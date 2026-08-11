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
 *   merchant: { id, companyName, locationCount, billingStatus, hasSubscription,
 *               commissionEligible, commissionSuspensionReason },
 *   stores: [{ id, storeName, storeKey, city, state, isActive }],
 *   stats: {
 *     totalMembers, stampsToday, couponsRedeemedThisWeek, referralsThisWeek,
 *     newMembersThisWeek
 *   },
 *   originMetrics: { originatedMembers, originatedVipMembers, monthlyCommissionPotential },
 *   fiscalWeekChart: [{ date, dayLabel, stampCount }],
 *   recentMembers: [{ id, firstName, lastName, tier, totalStamps, joinedAt }]
 * }
 *
 * NOTE ON SCOPE: commissionEligible and originMetrics are MERCHANT-level and are
 * deliberately NOT filtered by the storeId param. Commission eligibility belongs
 * to the merchant account, not a location, and Origin Store attribution is counted
 * per originating merchant. Switching locations in the dashboard must not change
 * these numbers — see CLAUDE.md "STORE AND MERCHANT STATUS MODEL (V3)".
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { findMerchantForRequest } from '@/lib/merchant-auth'
import { resolveTierName } from '@/lib/tiers'

// Origin Merchant commission per VIP member per month while eligible.
// Source of truth: CLAUDE.md "PRICING (V3 LOCKED)". Mirrored in
// /api/member/vip-webhook, which writes the immutable commission_decisions.
const ORIGIN_COMMISSION_PER_VIP = 19.99

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
  // Resolved through lib/merchant-auth, which falls back to owner_email when
  // merchants.auth_user_id is stale. A plain auth_user_id lookup returning 404
  // here is what made every dashboard tab render empty at once.
  const merchant = await findMerchantForRequest<{
    id: string
    company_name: string | null
    location_count: number | null
    billing_status: string | null
    stripe_customer_id: string | null
    commission_eligible: boolean | null
    commission_suspension_reason: string | null
  }>('id, company_name, location_count, billing_status, stripe_customer_id, commission_eligible, commission_suspension_reason')

  if (!merchant) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 })

  // All table reads below use the admin client — RLS blocks these queries
  // otherwise (see CLAUDE.md CRITICAL RLS RULE).
  const admin = createAdminSupabaseClient()

  const storeIdParam = new URL(req.url).searchParams.get('storeId')

  const { data: stores } = await admin
    .from('stores')
    .select('id, display_name, canonical_key, city, state, is_active, fiscal_week_start, brand_color, logo_url')
    .eq('merchant_id', merchant.id)
    .order('created_at')

  if (!stores?.length) {
    return NextResponse.json({
      merchant: {
        id: merchant.id,
        companyName: merchant.company_name,
        locationCount: merchant.location_count,
        billingStatus: merchant.billing_status,
        hasSubscription: !!merchant.stripe_customer_id,
        commissionEligible: merchant.commission_eligible ?? false,
        commissionSuspensionReason: merchant.commission_suspension_reason ?? null,
      },
      stores: [],
      stats:           null,
      originMetrics:   null,
      fiscalWeekChart: [],
      recentMembers:   [],
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
    originatedMembersRes,
    originatedVipRes,
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
      // subscription_status is needed to resolve the tier — a free member is
      // Starter regardless of stamp count.
      .select('id, first_name, last_name, total_stamps, subscription_status, created_at')
      .eq('merchant_id', merchant.id)
      .in('home_store_id', storeIds)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(10),

    // Origin Store attribution — merchant-scoped and all-time, never filtered by
    // storeIds or by member status. A member this merchant originated stays
    // attributed to it permanently (CLAUDE.md rule 18), including members whose
    // home store later differs from where they enrolled.
    admin
      .from('members')
      .select('id', { count: 'exact', head: true })
      .eq('origin_merchant_id', merchant.id),

    admin
      .from('members')
      .select('id', { count: 'exact', head: true })
      .eq('origin_merchant_id', merchant.id)
      .eq('subscription_status', 'vip'),
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

  const recentMembers = (recentMembersRes.data ?? []).map(m => ({
    id:          m.id,
    firstName:   m.first_name,
    lastName:    m.last_name,
    totalStamps: m.total_stamps,
    tier:        resolveTierName(m.total_stamps, m.subscription_status),
    joinedAt:    m.created_at,
  }))

  const commissionEligible = merchant.commission_eligible ?? false
  const originatedVipMembers = originatedVipRes.count ?? 0

  return NextResponse.json({
    merchant: {
      id:              merchant.id,
      companyName:     merchant.company_name,
      locationCount:   merchant.location_count,
      billingStatus:   merchant.billing_status,
      hasSubscription: !!merchant.stripe_customer_id,
      commissionEligible,
      commissionSuspensionReason: merchant.commission_suspension_reason ?? null,
    },
    stores: stores.map(s => ({
      id:         s.id,
      storeName:  s.display_name,
      storeKey:   s.canonical_key,
      city:       s.city,
      state:      s.state,
      isActive:   s.is_active,
      brandColor: s.brand_color ?? null,
      logoUrl:    s.logo_url ?? null,
    })),
    stats: {
      totalMembers:            totalMembersRes.count ?? 0,
      stampsToday:             stampsTodayRes.count ?? 0,
      couponsRedeemedThisWeek: couponsThisWeekRes.count ?? 0,
      referralsThisWeek:       referralsThisWeekRes.count ?? 0,
      newMembersThisWeek:      newMembersThisWeekRes.count ?? 0,
    },
    originMetrics: {
      originatedMembers:    originatedMembersRes.count ?? 0,
      originatedVipMembers,
      // Forward-looking estimate of what these VIP members would generate next
      // month at current eligibility — NOT an amount owed. Null when ineligible,
      // because BinPerks retains the commission during suspension and it is never
      // paid retroactively (CLAUDE.md "ORIGIN STORE RULES").
      monthlyCommissionPotential: commissionEligible
        ? Number((originatedVipMembers * ORIGIN_COMMISSION_PER_VIP).toFixed(2))
        : null,
    },
    fiscalWeekChart: chartDays,
    recentMembers,
    fiscalWeekStart,
  })
}
