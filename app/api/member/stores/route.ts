/**
 * GET /api/member/stores
 *
 * Store finder for the member dashboard. Returns the BinPerks locations a
 * member can visit — the network, not just the store they enrolled through.
 *
 * Visibility is governed by two independent flags (see the V3 store status
 * model in CLAUDE.md):
 *   is_active       — the store record is live
 *   network_visible — admin allows it to appear in public discovery
 * A store that is closed for shopping today still appears; that is a
 * different flag (is_open_for_shopping) and hiding it here would make the
 * network look smaller than it is.
 *
 * The member's Origin Store is always first in the list and flagged, so the
 * dashboard can label it without a second lookup. Everything after it is
 * sorted by canonical_key ASC (CORE RULE 13).
 *
 * Query params:
 *   q     — optional free-text filter, matched against store and brand name.
 *   state — optional two-letter code ('FL'); 'ALL' or absent means every state.
 *           The two combine: state narrows the set, q searches within it.
 *
 * Responses:
 *   200 { lastStampedStoreId, stores: [{ id, canonicalKey, displayName, brandName, city, state,
 *                     brandColor, todayPrice, restocksToday, isOriginStore }] }
 *        todayPrice is resolved in each STORE's own timezone, and is null when
 *        that merchant has published no price for today.
 *   401 { error: 'not_authenticated' }
 *   404 { error: 'member_not_found' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { todayPrice, restocksToday, type PricingSchedule } from '@/lib/store-pricing'

/** Enough to browse the whole network today, small enough to stay a fast
 *  payload once it grows. The search box narrows anything past this. */
const MAX_RESULTS = 60

interface StoreRow {
  id: string
  canonical_key: string
  display_name: string
  brand_name: string | null
  city: string | null
  state: string | null
  /** Display only — lets the member store card show the store's own colour
   *  instead of a generic swatch. */
  brand_color: string | null
  pricing_schedule: PricingSchedule | null
  restock_days: unknown
  /** Drives which day "today" is — see lib/store-pricing. */
  timezone: string | null
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  // Auth-required route: server client for identity, admin client for reads.
  const admin = createAdminSupabaseClient()

  const { data: member } = await admin
    .from('members')
    .select('id, origin_store_id, home_store_id, is_blacklisted')
    .eq('auth_user_id', user.id)
    .single()

  if (!member) {
    return NextResponse.json({ error: 'member_not_found' }, { status: 404 })
  }
  if (member.is_blacklisted) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  // Where this member most recently earned a stamp. The scanner uses it to
  // price a saving without asking them which store they are standing in.
  //
  // activity_events is the V3 canonical activity source and the Phase 1
  // backfill carried the stamp_events history into it, so this reaches back
  // past the dual-write cutover. A member who has never been stamped returns
  // null and the caller falls back to their Origin Store.
  const { data: lastActivity } = await admin
    .from('activity_events')
    .select('store_id')
    .eq('member_id', member.id)
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const lastStampedStoreId = lastActivity?.store_id ?? null

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  // Two-letter code, as stored on the row. Absent or 'ALL' means every state.
  const stateParam = req.nextUrl.searchParams.get('state')?.trim().toUpperCase() ?? ''

  let query = admin
    .from('stores')
    .select('id, canonical_key, display_name, brand_name, city, state, brand_color, pricing_schedule, restock_days, timezone')
    .eq('is_active', true)
    .eq('network_visible', true)

  if (stateParam && stateParam !== 'ALL') query = query.eq('state', stateParam)

  if (q) {
    // Escape PostgREST's or() delimiters before interpolating. A comma or a
    // paren in the search box would otherwise be parsed as filter syntax.
    const safe = q.replace(/[,()]/g, ' ')
    // Store NAME or STATE only. City was removed deliberately: there are not
    // enough stores in any one city for city search to be useful, and it made
    // "FL" miss stores whose city happened not to contain those letters.
    //
    // canonical_key went with it — the key embeds the city ("FL-Tampa-EstaBins"),
    // so matching on it would have quietly reintroduced city search.
    // Name only. State is its own dropdown now, so folding it into the text
    // search would make "FL" match every Florida store while someone is trying
    // to type a store name.
    query = query.or(
      `display_name.ilike.%${safe}%,` +
      `brand_name.ilike.%${safe}%`
    )
  }

  const { data, error } = await query
    .order('canonical_key', { ascending: true })
    .limit(MAX_RESULTS)

  if (error) {
    console.error('[member/stores] query failed:', error)
    return NextResponse.json({ error: 'store_lookup_failed' }, { status: 500 })
  }

  const rows = (data ?? []) as StoreRow[]

  // Origin Store first. It stays in place when a search excludes it — we do
  // not re-add it, because a member searching "Miami" should not be handed
  // their Tampa store as the top hit.
  const originId = member.origin_store_id ?? member.home_store_id
  const ordered = [
    ...rows.filter(s => s.id === originId),
    ...rows.filter(s => s.id !== originId),
  ]

  return NextResponse.json({
    // Null when the member has never been stamped anywhere, or when that store
    // is not in this response (hidden from discovery, or filtered out by ?q=).
    lastStampedStoreId:
      lastStampedStoreId && ordered.some(s => s.id === lastStampedStoreId)
        ? lastStampedStoreId
        : null,
    stores: ordered.map(s => ({
      id:            s.id,
      canonicalKey:  s.canonical_key,
      displayName:   s.display_name,
      brandName:     s.brand_name ?? s.display_name,
      city:          s.city ?? '',
      state:         s.state ?? '',
      brandColor:    s.brand_color ?? '#4A4B98',
      // Resolved per store, in that store's timezone. null means the merchant
      // has published no price for today — which is NOT the same as $0, so
      // the UI shows "—" rather than "free".
      todayPrice:    todayPrice(s.pricing_schedule, s.timezone),
      restocksToday: restocksToday(s.restock_days, s.timezone),
      isOriginStore: s.id === originId,
    })),
  })
}
