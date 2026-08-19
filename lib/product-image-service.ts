/**
 * Product Image Service.
 *
 * Decides whether a scan earns an image lookup, maintains the BinPerks product
 * catalog, and records how each decision was reached.
 *
 * WHAT IS PERSISTED: the catalog row (BinPerks-owned product intelligence), a
 * log row describing the resolution path, and — new — a BinPerks-hosted COPY of
 * the representative image, downloaded and re-encoded by
 * lib/representative-image-store. The provider's URL itself is still never
 * written anywhere; see lib/providers/brave-images for that distinction.
 *
 * THE IMAGE IS STORED ONCE PER PRODUCT. The second member to scan the same
 * drill gets the stored copy and no provider call happens at all — the image
 * lookup is now a real cache, not just product intelligence.
 *
 * LOGGING SHAPE: a scan produces ONE log row when the stored image answers it
 * (CATALOG_IMAGE_HIT) and TWO when it does not — CATALOG_HIT for "we already
 * knew this product", then IMAGE_SEARCH or SEARCH_FAILED for "we called Brave".
 * They are separate facts, measured independently, so a scan may contribute to
 * both rates. CATALOG_IMAGE_HIT is deliberately terminal: it is the one path
 * that costs nothing, and counting it in the search rate would hide the saving.
 *
 * Every threshold comes from the environment. Nothing here is tuned in code.
 */

import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { BraveImagesProvider, ImageSearchResult } from '@/lib/providers/brave-images'
import { generateProductKey, isSpecificEnough, normalizeProductName } from '@/lib/product-fingerprint'
import { signRepresentativeImage, storeRepresentativeImage } from '@/lib/representative-image-store'

const provider = new BraveImagesProvider()

export interface ProductImageRequest {
  scannerEventId: string
  identifiedProduct: string
  identifiedCategory?: string | null
  confidence: number
  upc?: string | null
  brand?: string | null
  modelNumber?: string | null
}

export interface ProductImageResponse {
  /**
   * A signed URL to the BinPerks-hosted copy when one exists, otherwise the
   * provider's transient URL for this render only. Either way it expires:
   * callers display it and never store it.
   */
  imageUrl: string | null
  catalogHit: boolean
  resolution: string
  /** True when imageUrl points at BinPerks storage rather than the provider. */
  stored: boolean
}

/** Shape read back from product_catalog during the lookup tiers. */
interface CatalogMatch {
  id: string
  scan_count: number
  representative_image_path: string | null
}

const CATALOG_COLUMNS = 'id, scan_count, representative_image_path'

export async function getProductImage(req: ProductImageRequest): Promise<ProductImageResponse> {
  const admin = createAdminSupabaseClient()
  const enabled = process.env.IMAGE_SEARCH_ENABLED === 'true'
  const minConfidence = Number(process.env.IMAGE_SEARCH_MIN_CONFIDENCE ?? 0.65)

  // Off by default. Returns before touching the catalog or writing any log
  // row, so a disabled feature leaves no trace at all.
  if (!enabled) return { imageUrl: null, catalogHit: false, resolution: 'FEATURE_DISABLED', stored: false }

  if (req.confidence < minConfidence) {
    await logResolution(admin, req.scannerEventId, null, 'LOW_CONFIDENCE_SKIP', null, req.confidence, null)
    return { imageUrl: null, catalogHit: false, resolution: 'LOW_CONFIDENCE_SKIP', stored: false }
  }

  if (!isSpecificEnough(req.identifiedProduct)) {
    await logResolution(admin, req.scannerEventId, null, 'INSUFFICIENT_SPECIFICITY', null, req.confidence, null)
    return { imageUrl: null, catalogHit: false, resolution: 'INSUFFICIENT_SPECIFICITY', stored: false }
  }

  const { productKey } = generateProductKey({
    upc: req.upc, brand: req.brand, modelNumber: req.modelNumber, identifiedProduct: req.identifiedProduct,
  })
  const normalizedName = normalizeProductName(req.identifiedProduct)

  // Catalog lookup — separate queries per priority tier, most trustworthy
  // first. Deliberately not a single .or(): a UPC match and a name match are
  // not equally good, and one query could not express the preference.
  let existing: CatalogMatch | null = null
  if (req.upc) {
    const { data } = await admin.from('product_catalog').select(CATALOG_COLUMNS).eq('upc', req.upc).maybeSingle()
    existing = data
  }
  if (!existing && productKey) {
    const { data } = await admin.from('product_catalog').select(CATALOG_COLUMNS).eq('product_key', productKey).maybeSingle()
    existing = data
  }
  if (!existing && normalizedName) {
    const { data } = await admin.from('product_catalog').select(CATALOG_COLUMNS).eq('normalized_name', normalizedName).maybeSingle()
    existing = data
  }

  let catalogId: string | null = null
  let catalogHit = false

  if (existing) {
    catalogHit = true
    catalogId = existing.id
    await admin.from('product_catalog')
      .update({ scan_count: existing.scan_count + 1, last_seen_at: new Date().toISOString() })
      .eq('id', existing.id)

    // ── The free path ──
    // Product known AND an image already stored: answer from BinPerks storage
    // and return before any provider call. Logged as CATALOG_IMAGE_HIT, which
    // is the only resolution that costs nothing.
    //
    // A signing failure falls through to a normal search rather than returning
    // nothing — the stored file may have been removed, and the next scan
    // rebuilds it over the same key.
    if (existing.representative_image_path) {
      const signed = await signRepresentativeImage(admin, existing.representative_image_path)
      if (signed) {
        await logResolution(admin, req.scannerEventId, catalogId, 'CATALOG_IMAGE_HIT', null, req.confidence, null)
        return { imageUrl: signed, catalogHit: true, resolution: 'CATALOG_IMAGE_HIT', stored: true }
      }
      console.warn(
        `[product-image] stored image unreadable for catalog=${catalogId}; falling back to search`,
      )
    }

    // CATALOG_HIT is its own independent log row
    await logResolution(admin, req.scannerEventId, catalogId, 'CATALOG_HIT', null, req.confidence, null)
  } else {
    const { data: inserted } = await admin.from('product_catalog').insert({
      upc: req.upc ?? null,
      brand: req.brand ?? null,
      model_number: req.modelNumber ?? null,
      product_key: productKey || null,
      normalized_name: normalizedName || null,
      identified_product: req.identifiedProduct,
      identified_category: req.identifiedCategory ?? null,
    }).select('id').single()
    catalogId = inserted?.id ?? null
  }

  const searchQuery = [req.brand, req.modelNumber, req.identifiedProduct].filter(Boolean).join(' ').trim()
  const start = Date.now()
  let imageResult: ImageSearchResult | null = null
  let success = false

  try {
    imageResult = await provider.search(searchQuery)
    success = imageResult !== null
  } catch {
    success = false
  }

  const responseMs = Date.now() - start
  const triggerReason = catalogHit ? 'NO_EXISTING_IMAGE' : 'NEW_PRODUCT'

  // ── Download and re-host ──
  // Runs before the log write so response_ms still measures the PROVIDER call
  // and nothing else. Storage needs a catalog row to key on; without one
  // (an insert that failed) there is nowhere to file the image, so the
  // transient URL is shown for this render and the next scan tries again.
  let storedUrl: string | null = null
  if (imageResult?.url && catalogId) {
    storedUrl = await storeRepresentativeImage(admin, catalogId, imageResult.url)
  }

  // IMAGE_SEARCH or SEARCH_FAILED is a SECOND independent log row
  // A single scan may produce two log rows: CATALOG_HIT + IMAGE_SEARCH
  await logResolution(
    admin, req.scannerEventId, catalogId,
    success ? 'IMAGE_SEARCH' : 'SEARCH_FAILED',
    triggerReason, req.confidence, searchQuery, responseMs, success
  )

  // Prefer the stored copy. The provider URL is the fallback for this one
  // render when storing did not work out — the behaviour that existed before
  // re-hosting, and still display-only.
  return {
    imageUrl: storedUrl ?? imageResult?.url ?? null,
    catalogHit,
    resolution: success ? 'IMAGE_SEARCH' : 'SEARCH_FAILED',
    stored: storedUrl !== null,
  }
}

/**
 * Writes one image_search_log row.
 *
 * search_query_used is the only free text stored, and it is BinPerks-generated
 * — assembled from our own fields, never anything Brave sent back.
 */
async function logResolution(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  scannerEventId: string,
  catalogId: string | null,
  resolution: string,
  triggerReason: string | null,
  confidence: number,
  searchQuery: string | null,
  responseMs?: number,
  success?: boolean,
) {
  await admin.from('image_search_log').insert({
    scanner_event_id:   scannerEventId,
    product_catalog_id: catalogId,
    resolution_method:  resolution,
    trigger_reason:     triggerReason,
    // Only rows that actually reached the provider name one. CATALOG_IMAGE_HIT
    // never does, which is the whole point of it.
    provider: resolution === 'IMAGE_SEARCH' || resolution === 'SEARCH_FAILED' ? 'brave' : null,
    success:            success ?? null,
    response_ms:        responseMs ?? null,
    ai_confidence:      confidence,
    search_query_used:  searchQuery,
  })
}
