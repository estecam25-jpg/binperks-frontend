/**
 * GET /api/merchant/redemptions
 *
 * Query params:
 *   storeId?      — scope to one location
 *   weekOffset?   — 0 = current fiscal week, -1 = last week, etc. (default 0)
 *   page?         — default 1
 *   limit?        — default 50
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

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
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: merchant } = await supabase
    .from('merchants')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!merchant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const url = new URL(req.url)
  const storeId     = url.searchParams.get('storeId')
  const weekOffset  = Number(url.searchParams.get('weekOffset') ?? 0)
  const page        = Math.max(1, Number(url.searchParams.get('page') ?? 1))
  const limit       = Math.min(100, Number(url.searchParams.get('limit') ?? 50))
  const offset      = (page - 1) * limit

  // Get fiscal week start for this merchant/store
  const { data: storeData } = storeId
    ? await supabase.from('stores').select('fiscal_week_start').eq('id', storeId).single()
    : await supabase.from('stores').select('fiscal_week_start').eq('merchant_id', merchant.id).limit(1).single()

  const { weekStart, weekEnd } = getFiscalWeekRange(weekOffset, storeData?.fiscal_week_start)

  let query = supabase
    .from('rewards')
    .select(`
      id,
      coupon_value,
      redeemed_at,
      status,
      members ( first_name, last_name, total_stamps ),
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
      members?: { first_name?: string; last_name?: string; total_stamps?: number } | null
      stores?: { display_name?: string } | null
    }) => ({
      id:           r.id,
      couponValue:  r.coupon_value,
      redeemedAt:   r.redeemed_at,
      memberName:   r.members ? `${r.members.first_name} ${r.members.last_name}` : 'Unknown',
      storeName:    r.stores?.display_name ?? 'Unknown',
    })),
    total:      count ?? 0,
    page,
    pages:      Math.ceil((count ?? 0) / limit),
    weekStart:  weekStart.toISOString(),
    weekEnd:    weekEnd.toISOString(),
  })
}
