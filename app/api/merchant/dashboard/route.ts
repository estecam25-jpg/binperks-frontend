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
 *     totalMembers, visitsToday, stampsToday, couponsRedeemedThisWeek,
 *     referralsThisWeek, newMembersThisWeek
 *   },
 *   originMetrics: { originatedMembers, originatedVipMembers, monthlyCommissionPotential },
 *   lifetimeStats: { totalStampsGiven, totalCouponsEarned, membersEnrolled, vipMembers },
 *   fiscalWeekChart: [{ date, dayLabel, visitCount, stampCount }]
 * }
 *
 * No member identities are returned. Merchants see aggregates only — BinPerks
 * owns the member relationship (CLAUDE.md rule 16).
 *
 * NOTE ON SCOPE: commissionEligible, originMetrics, and three of the four
 * lifetimeStats are MERCHANT-level and are deliberately NOT filtered by the
 * storeId param. Commission eligibility belongs
 * to the merchant account, not a location, and Origin Store attribution is counted
 * per originating merchant. Switching locations in the dashboard must not change
 * these numbers — see CLAUDE.md "STORE AND MERCHANT STATUS MODEL (V3)".
 *
 * lifetimeStats.totalStampsGiven is the exception: stamps are awarded AT a
 * location, so it follows the location selector like the rest of the activity
 * figures. The other three are Origin attribution and stay merchant-wide.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { findMerchantForRequest } from '@/lib/merchant-auth'

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

/**
 * All-time effective stamps, summed in the route rather than by the database.
 *
 * PostgREST aggregate functions are disabled on this project ("Use of aggregate
 * functions is not allowed"), so effective_stamps.sum() is not available and the
 * rows have to come back. They are read in pages because PostgREST caps a
 * response at 1000 rows by default — a plain select would silently stop counting
 * at row 1000 and report a number that only ever looks slightly low.
 *
 * Paged on id, which is unique, so no row is read twice or skipped when rows
 * share an occurred_at. On a partial read the total so far is returned and the
 * shortfall logged: an undercount is visible in the logs rather than passed off
 * as complete.
 */
const STAMP_PAGE_SIZE = 1000
const STAMP_MAX_PAGES = 100

async function sumEffectiveStamps(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  storeIds: string[],
): Promise<number> {
  let total = 0
  for (let page = 0; page < STAMP_MAX_PAGES; page++) {
    const from = page * STAMP_PAGE_SIZE
    const { data, error } = await admin
      .from('activity_events')
      .select('effective_stamps')
      .in('store_id', storeIds)
      .order('id', { ascending: true })
      .range(from, from + STAMP_PAGE_SIZE - 1)

    if (error) {
      console.error('[/api/merchant/dashboard] stamp sum page failed:', error)
      return total
    }
    const rows = (data ?? []) as { effective_stamps: number | null }[]
    total += rows.reduce((sum, r) => sum + (r.effective_stamps ?? 0), 0)
    if (rows.length < STAMP_PAGE_SIZE) return total
  }
  console.warn(
    `[/api/merchant/dashboard] stamp sum stopped at ${STAMP_MAX_PAGES} pages — total is a floor`,
  )
  return total
}

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
      lifetimeStats:   null,
      fiscalWeekChart: [],
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
    couponsThisWeekRes,
    referralsThisWeekRes,
    newMembersThisWeekRes,
    fiscalChartRes,
    originatedMembersRes,
    originatedVipRes,
    couponsEarnedRes,
    totalStampsGiven,
  ] = await Promise.all([
    admin
      .from('members')
      .select('id', { count: 'exact', head: true })
      .eq('merchant_id', merchant.id)
      .eq('status', 'active')
      .in('home_store_id', storeIds),


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

    // Both metrics come from ONE source so they can never disagree.
    //
    // A VISIT is one row: the stamp route writes exactly one activity_events
    // row per awarded stamp, and visits.date carries a UNIQUE
    // (member_id, store_id, date) index, so one row IS one qualifying visit.
    //
    // Deliberately NOT sum(stamps_awarded) for visits: the Phase 1 backfill
    // could not recover the base/multiplier split out of stamp_events and put
    // the TOTAL in stamps_awarded with multiplier 1.00, so summing it reports
    // 52 "visits" for 18 real ones on backfilled days. Live rows are correct
    // (base 1, effective 2 for a Bronze VIP); counting rows is right for both.
    admin
      .from('activity_events')
      .select('occurred_at, effective_stamps')
      .in('store_id', storeIds)
      .gte('occurred_at', weekStart.toISOString())
      .lte('occurred_at', weekEnd.toISOString()),

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

    // Coupons EARNED by members this merchant originated, wherever they were
    // earned and whether or not they have been redeemed yet — the merchant's
    // all-time contribution to the network, not its redemption traffic (which
    // the fiscal-week "Coupons this week" tile already covers).
    //
    // rewards carries no origin column, so the filter goes through an inner
    // join on the owning member. reward_type is pinned to 'visit_reward' so a
    // future reward kind cannot quietly inflate the count.
    admin
      .from('rewards')
      .select('id, members!inner(origin_merchant_id)', { count: 'exact', head: true })
      .eq('reward_type', 'visit_reward')
      .eq('members.origin_merchant_id', merchant.id),

    sumEffectiveStamps(admin, storeIds),
  ])

  const weekActivity = (fiscalChartRes.data ?? []) as
    { occurred_at: string; effective_stamps: number | null }[]

  const chartDays: {
    date: string; dayLabel: string; visitCount: number; stampCount: number
  }[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    const dateStr = d.toISOString().split('T')[0]
    const rows = weekActivity.filter(a => a.occurred_at?.slice(0, 10) === dateStr)
    chartDays.push({
      date: dateStr,
      dayLabel: DAY_LABELS[d.getDay()],
      visitCount: rows.length,
      stampCount: rows.reduce((sum, a) => sum + (a.effective_stamps ?? 0), 0),
    })
  }

  const todayRows = weekActivity.filter(a => a.occurred_at?.slice(0, 10) === todayStr)
  const visitsToday = todayRows.length
  const stampsToday = todayRows.reduce((sum, a) => sum + (a.effective_stamps ?? 0), 0)

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
      // Raw qualifying visits vs stamps actually awarded (visits x tier
      // multiplier). The Overview tab toggles between them.
      visitsToday,
      stampsToday,
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
    lifetimeStats: {
      // Store-scoped, so this one follows the location selector.
      totalStampsGiven:   totalStampsGiven,
      // Merchant-level, all-time, by Origin attribution.
      totalCouponsEarned: couponsEarnedRes.count ?? 0,
      membersEnrolled:    originatedMembersRes.count ?? 0,
      vipMembers:         originatedVipMembers,
    },
    fiscalWeekChart: chartDays,
    fiscalWeekStart,
  })
}
