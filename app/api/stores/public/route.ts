/**
 * GET /api/stores/public
 *
 * Stores a prospective member can enroll through. Powers the "Where are you
 * shopping today?" picker in the combined sign-in/join flow on the home page.
 *
 * Public and unauthenticated, so it uses the admin client (CORE RULE 10) and
 * returns only the fields a picker needs — never merchant or member data.
 *
 * Three flags gate a store here, and they are independent on purpose:
 *   is_active          — the store record is live
 *   network_visible    — admin allows it in public discovery
 *   enrollment_enabled — new members may enroll through it
 * enrollment_enabled stays true when a merchant goes inactive (V3 rule 21), so
 * an unpaid merchant still enrolls members; only an admin disables it.
 *
 * Query params:
 *   q — optional free-text filter on store name, brand name, city, canonical_key
 *
 * Responses:
 *   200 { stores: [{ id, merchantId, canonicalKey, displayName, brandName, city, state }] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

const MAX_RESULTS = 60

interface StoreRow {
  id: string
  merchant_id: string
  canonical_key: string
  display_name: string
  brand_name: string | null
  city: string | null
  state: string | null
}

export async function GET(req: NextRequest) {
  const admin = createAdminSupabaseClient()
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''

  let query = admin
    .from('stores')
    .select('id, merchant_id, canonical_key, display_name, brand_name, city, state')
    .eq('is_active', true)
    .eq('network_visible', true)
    .eq('enrollment_enabled', true)

  if (q) {
    // Strip PostgREST's or() delimiters — a comma or paren typed into the
    // search box would otherwise be read as filter syntax.
    const safe = q.replace(/[,()]/g, ' ')
    query = query.or(
      `display_name.ilike.%${safe}%,` +
      `brand_name.ilike.%${safe}%,` +
      `city.ilike.%${safe}%,` +
      `canonical_key.ilike.%${safe}%`
    )
  }

  const { data, error } = await query
    .order('canonical_key', { ascending: true })   // CORE RULE 13
    .limit(MAX_RESULTS)

  if (error) {
    console.error('[stores/public] query failed:', error)
    return NextResponse.json({ stores: [] }, { status: 500 })
  }

  return NextResponse.json({
    stores: ((data ?? []) as StoreRow[]).map(s => ({
      id:           s.id,
      merchantId:   s.merchant_id,
      canonicalKey: s.canonical_key,
      displayName:  s.display_name,
      brandName:    s.brand_name ?? s.display_name,
      city:         s.city ?? '',
      state:        s.state ?? '',
    })),
  })
}
