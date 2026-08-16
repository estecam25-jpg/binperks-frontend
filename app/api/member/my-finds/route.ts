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
 * PHOTOS are the member's own, from the private scan-photos bucket. A fresh
 * SIGNED URL is minted per request and expires in an hour — the URL is never
 * stored, because a stored one outlives its own expiry and would be treated as
 * shareable. Scans taken before photo storage existed have no path and fall
 * back to a category tile.
 *
 * Still no PRODUCT image: representative_image_url was dropped, and the Brave
 * URLs behind it are transient and may not be persisted.
 *
 * Auth: member session (server client for identity), admin client for reads.
 *
 * Responses:
 *   200 { finds: [...], hasMore: boolean }
 *   401 { error: 'not_authenticated' }
 *   404 { error: 'member_not_found' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

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

  return NextResponse.json({
    finds: page.map(r => ({
      id:              r.id,
      product:         r.identified_product,
      category:        r.identified_category,
      estimatedRetail: r.estimated_retail_price,
      scannedAt:       r.scanned_at,
      storeName:       r.store_id ? (nameById[r.store_id] ?? null) : null,
      photoUrl:        photoUrlById[r.id] ?? null,
    })),
    hasMore,
  })
}
