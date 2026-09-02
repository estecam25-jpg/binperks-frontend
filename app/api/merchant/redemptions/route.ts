/**
 * GET /api/merchant/redemptions
 *
 * Coupon redemptions at the merchant's own locations, by fiscal week.
 *
 * NO MEMBER IS IDENTIFIED HERE, DELIBERATELY. This returned memberName until
 * the terms were tightened: Merchant Terms 10.3 now states that location
 * operational reporting "does not identify individual members", and Privacy
 * Policy 6.3 says merchants receive no individual member-level activity. A name
 * on each row contradicted both.
 *
 * The members embed was dropped from the query as well, not just from the
 * response — an unused join still pulls names out of the database on every
 * request, and leaving it there is an invitation to map it back into the output.
 * Do not add it back without changing the terms first.
 *
 * Query params:
 *   storeId?      — scope to one location
 *   weekOffset?   — 0 = current fiscal week, -1 = last week, etc. (default 0)
 *   page?         — default 1
 *   limit?        — default 50
 */

import { NextRequest, NextResponse } from 'next/server'
import { findMerchantForRequest } from '@/lib/merchant-auth'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { toOne } from '@/lib/supabase-relations'

/** to-ONE embed — object-or-array because toOne accepts either. */
type StoreRelation =
  | { display_name: string }
  | { display_name: string }[]
  | null

function getFiscalWeekRange(offset: number, fiscalWeekStart = 'friday') {
  const dayMap: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
  }
  const startDay = dayMap[fiscalWeekStart.toLowerCase()] ?? 5

  const now = new Date()
  const todayDay = now.getDay()
  const daysBack = (todayDay - startDay + 7) % 7

  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - daysBack + offset * 7)
  weekStart.setHours(0, 0, 0, 0)

  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)

  return { weekStart, weekEnd }
}

export async function GET(req: NextRequest) {
  // See lib/merchant-auth — falls back to owner_email when auth_user_id is stale.
  const merchant = await findMerchantForRequest()
  if (!merchant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // All table reads below use the admin client — RLS blocks these queries
  // otherwise (see CLAUDE.md CRITICAL RLS RULE).
  const admin = createAdminSupabaseClient()

  const url = new URL(req.url)
  const storeId     = url.searchParams.get('storeId')
  const weekOffset  = Number(url.searchParams.get('weekOffset') ?? 0)
  const page        = Math.max(1, Number(url.searchParams.get('page') ?? 1))
  const limit       = Math.min(100, Number(url.searchParams.get('limit') ?? 50))
  const offset      = (page - 1) * limit

  // Get fiscal week start for this merchant/store
  const { data: storeData } = storeId
    ? await admin.from('stores').select('fiscal_week_start').eq('id', storeId).single()
    : await admin.from('stores').select('fiscal_week_start').eq('merchant_id', merchant.id).limit(1).single()

  const { weekStart, weekEnd } = getFiscalWeekRange(weekOffset, storeData?.fiscal_week_start)

  let query = admin
    .from('rewards')
    .select(`
      id,
      coupon_value,
      redeemed_at,
      status,
      stores!redeemed_at_location_id ( display_name )
    `, { count: 'exact' })
    .eq('merchant_id', merchant.id)
    .eq('status', 'redeemed')
    .gte('redeemed_at', weekStart.toISOString())
    .lte('redeemed_at', weekEnd.toISOString())
    .order('redeemed_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (storeId) {
    query = query.eq('redeemed_at_location_id', storeId)
  }

  const { data: redemptions, count, error } = await query

  if (error) {
    console.error('[/api/merchant/redemptions]', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }

  return NextResponse.json({
    redemptions: (redemptions ?? []).map((r: {
      id: string
      coupon_value: number
      redeemed_at: string
      // A to-ONE embed: an object, not an array — see lib/supabase-relations.
      stores: StoreRelation
    }) => {
      // Was r.stores[0], always undefined on a to-one embed, so every
      // redemption rendered as "Unknown" for the store.
      const store = toOne(r.stores)
      return {
        id:           r.id,
        couponValue:  r.coupon_value,
        redeemedAt:   r.redeemed_at,
        storeName:    store?.display_name ?? 'Unknown',
      }
    }),
    total:      count ?? 0,
    page,
    pages:      Math.ceil((count ?? 0) / limit),
    weekStart:  weekStart.toISOString(),
    weekEnd:    weekEnd.toISOString(),
  })
}
