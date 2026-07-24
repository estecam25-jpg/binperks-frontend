/**
 * GET /api/merchant/dashboard
 *
 * Returns aggregate stats for the merchant dashboard Overview tab.
 * Auth: Supabase merchant session cookie.
 *
 * Query params:
 *   storeId? — if provided, scopes to one location; otherwise aggregates all
 *
 * Response:
 * {
 *   merchant: { id, companyName, locationCount, billingStatus, hasSubscription },
 *   stores: [{ id, storeName, storeKey, city, state, isActive }],
 *   stats: {
 *     totalMembers, stampsToday, couponsRedeemedThisWeek, referralsThisWeek,
 *     newMembersThisWeek
 *   },
 *   fiscalWeekChart: [{ date, dayLabel, stampCount }],
 *   recentMembers: [{ id, firstName, lastName, tier, totalStamps, joinedAt }]
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { getTier } from '@/lib/tiers'

function getFiscalWeekRange(fiscalWeekStart: string = 'friday') {
  const dayMap: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
  }
  const startDay = dayMap[fiscalWeekStart.toLowerCase()] ?? 5

  const now = new Date()
  const todayDay = now.getDay()
  const daysBack = (todayDay - startDay + 7) % 7
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - daysBack)
  weekStart.setHours(0, 0, 0, 0)

  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)

  return { weekStart, weekEnd }
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Auth uses the server client (session cookie). All table reads below use
  // the admin client — RLS blocks these queries otherwise (see CLAUDE.md
  // CRITICAL RLS RULE).
  const admin = createAdminSupabaseClient()

  const { data: merchant } = await admin
    .from('merchants')
    .select('id, company_name, location_count, billing_status, stripe_subscription_id')
    .eq('auth_user_id', user.id)
    .single()

  console.log('[merchant/dashboard] user.id:', user?.id)
  if (!merchant) return NextResponse.json({ error: 'Merchant not found', userId: user?.id }, { status: 404 })

  const storeIdParam = new URL(req.url).searchParams.get('storeId')

  const { data: stores } = await admin
    .from('stores')
    .select('id, display_name, canonical_key, city, state, is_active, fiscal_week_start')
    .eq('merchant_id', merchant.id)
    .order('created_at')

  if (!stores?.length) {
    return NextResponse.json({
      merchant: {
        id: merchant.id,
        companyName: merchant.company_name,
        locationCount: merchant.location_count,
        billingStatus: merchant.billing_status,
        hasSubscription: !!merchant.stripe_subscription_id,
      },
      stores: [],
      stats: null,
      fiscalWeekChart: [],
      recentMembers: [],
    })
  }

  const storeIds = storeIdParam
    ? stores.filter(s => s.id === storeIdParam).map(s => s.id)
    : stores.map(s => s.id)

  const fiscalWeekStart = stores.find(s => s.id === storeIdParam)?.fiscal_week_start
    ?? stores[0]?.fiscal_week_start
    ?? 'friday'

  const { weekStart, weekEnd } = getFiscalWeekRange(fiscalWeekStart)
  const todayStr = new Date().toISOString().split('T')[0]

  const [
    totalMembersRes,
    stampsTodayRes,
    couponsThisWeekRes,
    referralsThisWeekRes,
    newMembersThisWeekRes,
    fiscalChartRes,
    recentMembersRes,
  ] = await Promise.all([
    admin
      .from('members')
      .select('id', { count: 'exact', head: true })
      .eq('merchant_id', merchant.id)
      .eq('status', 'active')
      .in('home_store_id', storeIds),

    admin
      .from('visits')
      .select('id', { count: 'exact', head: true })
      .in('store_id', storeIds)
      .eq('date', todayStr),

    admin
      .from('rewards')
      .select('id', { count: 'exact', head: true })
      .in('redeemed_at_location_id', storeIds)
      .eq('status', 'redeemed')
      .gte('redeemed_at', weekStart.toISOString())
      .lte('redeemed_at', weekEnd.toISOString()),

    admin
      .from('referrals')
      .select('id', { count: 'exact', head: true })
      .eq('merchant_id', merchant.id)
      .gte('created_at', weekStart.toISOString()),

    admin
      .from('members')
      .select('id', { count: 'exact', head: true })
      .in('home_store_id', storeIds)
      .gte('created_at', weekStart.toISOString()),

    admin
      .from('visits')
      .select('date')
      .in('store_id', storeIds)
      .gte('date', weekStart.toISOString().split('T')[0])
      .lte('date', weekEnd.toISOString().split('T')[0]),

    admin
      .from('members')
      .select('id, first_name, last_name, total_stamps, created_at')
      .eq('merchant_id', merchant.id)
      .in('home_store_id', storeIds)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const chartDays: { date: string; dayLabel: string; stampCount: number }[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    const dateStr = d.toISOString().split('T')[0]
    const count = (fiscalChartRes.data ?? []).filter(v => v.date === dateStr).length
    chartDays.push({
      date: dateStr,
      dayLabel: DAY_LABELS[d.getDay()],
      stampCount: count,
    })
  }

  const recentMembers = (recentMembersRes.data ?? []).map(m => {
    const tier = getTier(m.total_stamps)
    return {
      id:          m.id,
      firstName:   m.first_name,
      lastName:    m.last_name,
      totalStamps: m.total_stamps,
      tier:        tier.name,
      joinedAt:    m.created_at,
    }
  })

  return NextResponse.json({
    merchant: {
      id:              merchant.id,
      companyName:     merchant.company_name,
      locationCount:   merchant.location_count,
      billingStatus:   merchant.billing_status,
      hasSubscription: !!merchant.stripe_subscription_id,
    },
    stores: stores.map(s => ({
      id:        s.id,
      storeName: s.display_name,
      storeKey:  s.canonical_key,
      city:      s.city,
      state:     s.state,
      isActive:  s.is_active,
    })),
    stats: {
      totalMembers:            totalMembersRes.count ?? 0,
      stampsToday:             stampsTodayRes.count ?? 0,
      couponsRedeemedThisWeek: couponsThisWeekRes.count ?? 0,
      referralsThisWeek:       referralsThisWeekRes.count ?? 0,
      newMembersThisWeek:      newMembersThisWeekRes.count ?? 0,
    },
    fiscalWeekChart: chartDays,
    recentMembers,
    fiscalWeekStart,
  })
}
