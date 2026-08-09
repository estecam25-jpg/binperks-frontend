/**
 * Product Image Service.
 *
 * Decides whether a scan earns an image lookup, maintains the BinPerks product
 * catalog, and records how each decision was reached.
 *
 * WHAT IS PERSISTED: the catalog row (BinPerks-owned product intelligence) and
 * a log row describing the resolution path. WHAT IS NOT: anything Brave
 * returned. The image URL travels back to the caller for one render and is
 * never written anywhere — see lib/providers/brave-images.
 *
 * LOGGING SHAPE: a single scan can produce TWO independent log rows. A catalog
 * hit writes CATALOG_HIT, and the search that follows writes IMAGE_SEARCH or
 * SEARCH_FAILED. They are separate facts — "we already knew this product" and
 * "we called Brave" — so the admin catalog-hit rate and image-search rate are
 * measured independently and a scan may contribute to both.
 *
 * Every threshold comes from the environment. Nothing here is tuned in code.
 */

import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { BraveImagesProvider, ImageSearchResult } from '@/lib/providers/brave-images'
import { generateProductKey, isSpecificEnough, normalizeProductName } from '@/lib/product-fingerprint'

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
  imageUrl: string | null  // transient — never stored
  catalogHit: boolean
  resolution: string
}

/** Shape read back from product_catalog during the lookup tiers. */
interface CatalogMatch {
  id: string
  scan_count: number
}

export async function getProductImage(req: ProductImageRequest): Promise<ProductImageResponse> {
  const admin = createAdminSupabaseClient()
  const enabled = process.env.IMAGE_SEARCH_ENABLED === 'true'
  const minConfidence = Number(process.env.IMAGE_SEARCH_MIN_CONFIDENCE ?? 0.65)

  // Off by default. Returns before touching the catalog or writing any log
  // row, so a disabled feature leaves no trace at all.
  if (!enabled) return { imageUrl: null, catalogHit: false, resolution: 'FEATURE_DISABLED' }

  if (req.confidence < minConfidence) {
    await logResolution(admin, req.scannerEventId, null, 'LOW_CONFIDENCE_SKIP', null, req.confidence, null)
    return { imageUrl: null, catalogHit: false, resolution: 'LOW_CONFIDENCE_SKIP' }
  }

  if (!isSpecificEnough(req.identifiedProduct)) {
    await logResolution(admin, req.scannerEventId, null, 'INSUFFICIENT_SPECIFICITY', null, req.confidence, null)
    return { imageUrl: null, catalogHit: false, resolution: 'INSUFFICIENT_SPECIFICITY' }
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
    const { data } = await admin.from('product_catalog').select('id, scan_count').eq('upc', req.upc).maybeSingle()
    existing = data
  }
  if (!existing && productKey) {
    const { data } = await admin.from('product_catalog').select('id, scan_count').eq('product_key', productKey).maybeSingle()
    existing = data
  }
  if (!existing && normalizedName) {
    const { data } = await admin.from('product_catalog').select('id, scan_count').eq('normalized_name', normalizedName).maybeSingle()
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

  // IMAGE_SEARCH or SEARCH_FAILED is a SECOND independent log row
  // A single scan may produce two log rows: CATALOG_HIT + IMAGE_SEARCH
  await logResolution(
    admin, req.scannerEventId, catalogId,
    success ? 'IMAGE_SEARCH' : 'SEARCH_FAILED',
    triggerReason, req.confidence, searchQuery, responseMs, success
  )

  return { imageUrl: imageResult?.url ?? null, catalogHit, resolution: success ? 'IMAGE_SEARCH' : 'SEARCH_FAILED' }
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
    provider: resolution === 'IMAGE_SEARCH' || resolution === 'SEARCH_FAILED' ? 'brave' : null,
    success:            success ?? null,
    response_ms:        responseMs ?? null,
    ai_confidence:      confidence,
    search_query_used:  searchQuery,
  })
}
