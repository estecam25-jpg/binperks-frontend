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
 *   q — optional free-text filter, matched against store name, brand name,
 *       city and canonical_key
 *
 * Responses:
 *   200 { stores: [{ id, canonicalKey, displayName, brandName, city, state, isOriginStore }] }
 *   401 { error: 'not_authenticated' }
 *   404 { error: 'member_not_found' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

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

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''

  let query = admin
    .from('stores')
    .select('id, canonical_key, display_name, brand_name, city, state')
    .eq('is_active', true)
    .eq('network_visible', true)

  if (q) {
    // Escape PostgREST's or() delimiters before interpolating. A comma or a
    // paren in the search box would otherwise be parsed as filter syntax.
    const safe = q.replace(/[,()]/g, ' ')
    query = query.or(
      `display_name.ilike.%${safe}%,` +
      `brand_name.ilike.%${safe}%,` +
      `city.ilike.%${safe}%,` +
      `canonical_key.ilike.%${safe}%`
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
    stores: ordered.map(s => ({
      id:            s.id,
      canonicalKey:  s.canonical_key,
      displayName:   s.display_name,
      brandName:     s.brand_name ?? s.display_name,
      city:          s.city ?? '',
      state:         s.state ?? '',
      isOriginStore: s.id === originId,
    })),
  })
}
