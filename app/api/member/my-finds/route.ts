/**
 * GET /api/member/my-finds
 *
 * The member's own scan history, newest first. Every scan is a find — there is
 * no manual save step (the "Save to My Finds" button was removed; see
 * components/member/MemberScanner).
 *
 * Query params:
 *   range?  — 'week' | 'month' | 'all'  (default 'all')
 *   limit?  — page size, default 20, max 50
 *   offset? — rows to skip
 *
 * TWO PICTURES PER FIND, either of which may be absent:
 *
 *   memberPhotoUrl        the member's OWN photo of the item in the bin, from
 *                         the private scan-photos bucket
 *   representativeImageUrl a reference photo of the PRODUCT, from the private
 *                         representative-images bucket, shared by every member
 *                         who scanned the same product
 *
 * Both are fresh SIGNED URLs minted per request and expiring in an hour. The
 * URLs are never stored: a stored one outlives its own expiry and starts being
 * treated as shareable. Scans predating either store fall back to a category
 * tile, so old history stays readable rather than half-broken.
 *
 * HOW A SCAN FINDS ITS PRODUCT: scanner_events has no catalog foreign key, so
 * the link runs through image_search_log, which records the catalog row a scan
 * resolved to. A scan that never reached the Product Image Service — feature
 * off, low confidence, too vague — has no log row and therefore no
 * representative image. That is correct: nothing was ever looked up for it.
 *
 * Auth: member session (server client for identity), admin client for reads.
 *
 * Responses:
 *   200 { finds: [{ ..., memberPhotoUrl, representativeImageUrl }], hasMore }
 *   401 { error: 'not_authenticated' }
 *   404 { error: 'member_not_found' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { signRepresentativeImages } from '@/lib/representative-image-store'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

/** Long enough to browse a page of history, short enough that a URL copied out
 *  of the network tab stops working the same day. */
const PHOTO_URL_TTL_SECONDS = 60 * 60

export type FindsRange = 'week' | 'month' | 'all'

/** Start of the requested window, or null for all time. */
function rangeStart(range: FindsRange): string | null {
  if (range === 'all') return null
  const d = new Date()
  d.setDate(d.getDate() - (range === 'week' ? 7 : 30))
  return d.toISOString()
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const admin = createAdminSupabaseClient()

  const { data: member } = await admin
    .from('members')
    .select('id, is_blacklisted')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!member) return NextResponse.json({ error: 'member_not_found' }, { status: 404 })
  if (member.is_blacklisted) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const sp = req.nextUrl.searchParams
  const rangeParam = sp.get('range')
  const range: FindsRange =
    rangeParam === 'week' || rangeParam === 'month' ? rangeParam : 'all'

  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(sp.get('limit')) || DEFAULT_LIMIT))
  const offset = Math.max(0, Number(sp.get('offset')) || 0)

  // Scoped to THIS member's id, never to the auth user id — scanner_events is
  // keyed by member.
  let query = admin
    .from('scanner_events')
    .select('id, identified_product, identified_category, estimated_retail_price, scanned_at, store_id, photo_storage_path')
    .eq('member_id', member.id)
    .order('scanned_at', { ascending: false })
    // One extra row is fetched to answer hasMore without a second count query.
    .range(offset, offset + limit)

  const start = rangeStart(range)
  if (start) query = query.gte('scanned_at', start)

  const { data, error } = await query

  if (error) {
    console.error('[member/my-finds] query failed:', error)
    return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  }

  const rows = data ?? []
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows

  // Store names resolved in one round trip rather than a join, so a scan whose
  // store was since deleted still lists rather than dropping out of history.
  const storeIds = [...new Set(page.map(r => r.store_id).filter(Boolean))] as string[]
  const nameById: Record<string, string> = {}
  if (storeIds.length > 0) {
    const { data: stores } = await admin
      .from('stores')
      .select('id, display_name')
      .in('id', storeIds)
    for (const s of stores ?? []) nameById[s.id] = s.display_name
  }

  // One signed URL per photo, minted now and valid for an hour. Failures are
  // silent: a missing photo costs the member a thumbnail, not their history.
  const photoUrlById: Record<string, string> = {}
  const withPhotos = page.filter(r => r.photo_storage_path)
  if (withPhotos.length > 0) {
    const { data: signed } = await admin.storage
      .from('scan-photos')
      .createSignedUrls(withPhotos.map(r => r.photo_storage_path as string), PHOTO_URL_TTL_SECONDS)
    for (let i = 0; i < (signed?.length ?? 0); i++) {
      const url = signed?.[i]?.signedUrl
      if (url) photoUrlById[withPhotos[i].id] = url
    }
  }

  // ── Representative images ──
  // Two hops, both bounded by the page size: scan -> catalog id (through the
  // image search log) and catalog id -> stored path. Signing is batched, so a
  // page of twenty costs one signing call regardless of how many share a
  // product.
  const representativeUrlById: Record<string, string> = {}
  const scanIds = page.map(r => r.id)

  if (scanIds.length > 0) {
    const { data: logRows } = await admin
      .from('image_search_log')
      .select('scanner_event_id, product_catalog_id')
      .in('scanner_event_id', scanIds)
      .not('product_catalog_id', 'is', null)

    // A scan can have several log rows (CATALOG_HIT then IMAGE_SEARCH), all
    // pointing at the same catalog row, so the map collapses them.
    const catalogIdByScan: Record<string, string> = {}
    for (const row of logRows ?? []) {
      if (row.scanner_event_id && row.product_catalog_id) {
        catalogIdByScan[row.scanner_event_id] = row.product_catalog_id
      }
    }

    const catalogIds = [...new Set(Object.values(catalogIdByScan))]
    if (catalogIds.length > 0) {
      const { data: catalogRows } = await admin
        .from('product_catalog')
        .select('id, representative_image_path')
        .in('id', catalogIds)
        .not('representative_image_path', 'is', null)

      const pathByCatalogId: Record<string, string> = {}
      for (const c of catalogRows ?? []) {
        if (c.representative_image_path) pathByCatalogId[c.id] = c.representative_image_path
      }

      const signedByPath = await signRepresentativeImages(
        admin,
        [...new Set(Object.values(pathByCatalogId))],
      )

      for (const [scanId, catalogId] of Object.entries(catalogIdByScan)) {
        const path = pathByCatalogId[catalogId]
        const url = path ? signedByPath[path] : undefined
        if (url) representativeUrlById[scanId] = url
      }
    }
  }

  return NextResponse.json({
    finds: page.map(r => ({
      id:              r.id,
      product:         r.identified_product,
      category:        r.identified_category,
      estimatedRetail: r.estimated_retail_price,
      scannedAt:       r.scanned_at,
      storeName:       r.store_id ? (nameById[r.store_id] ?? null) : null,
      memberPhotoUrl:  photoUrlById[r.id] ?? null,
      representativeImageUrl: representativeUrlById[r.id] ?? null,
      // Kept so a client cached from before this change keeps rendering the
      // member's own photo instead of dropping to a category tile.
      photoUrl:        photoUrlById[r.id] ?? null,
    })),
    hasMore,
  })
}
