/**
 * GET /api/admin/analytics
 *
 * Everything the God Mode Analytics tab renders, in one admin-only, read-only
 * response. Nothing here writes.
 *
 * ── Why full table reads ──────────────────────────────────────────────────
 * Most of these figures are groupings Postgres would do better than JS, but
 * PostgREST aggregate functions are DISABLED on this project (verified:
 * `effective_stamps.sum()` returns PGRST123 "Use of aggregate functions is not
 * allowed"). So the rows come back and are grouped here.
 *
 * Every full read goes through fetchAll(), which PAGES. A plain .select() stops
 * at PostgREST's 1000-row default and returns success, so an un-paged scan
 * would quietly under-report the moment activity_events passes a thousand rows
 * — the kind of wrong number that never looks wrong.
 *
 * SCALING CEILING: this route is O(table). That is a deliberate trade the spec
 * accepts for an admin page, and the response is cached for five minutes so
 * clicking around the tab does not re-run it. When members reach five figures,
 * the fix is Postgres aggregate functions (RPC), not row limits — a limit here
 * silently changes the answer, which is worse than a slow page.
 *
 * ── The house merchant ────────────────────────────────────────────────────
 * The BinPerks house merchant and store (lib/binperks-origin) are real rows
 * that exist to satisfy NOT NULL origin foreign keys. They are excluded from
 * every merchant and store figure: counting the house as a merchant with no
 * Stripe Connect and no pricing schedule would invent problems that do not
 * exist. Members whose origin is the house ARE real members and are counted.
 *
 * Responses:
 *   200 { generatedAt, cached, ...sections }
 *   403 { error: 'forbidden' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { verifyAdmin } from '@/lib/admin-auth'
import { BINPERKS_HOUSE_MERCHANT_ID, BINPERKS_HOUSE_STORE_ID } from '@/lib/binperks-origin'
import { computeMrr, round2 } from '@/lib/mrr'
import { pct, topCategories } from '@/lib/scanner-analytics'
import {
  rangeBounds, growthForRanges, retentionBuckets, speedToFirstCoupon,
  storeActivityTotals, highVelocityDays, possibleDuplicates, healthTone,
  type RangeKey,
} from '@/lib/analytics'

export const dynamic = 'force-dynamic'

/** Rows per page when reading a whole table. PostgREST's own default cap. */
const PAGE_SIZE = 1000

/** Hard stop, so a runaway table cannot hang the request forever. */
const MAX_PAGES = 200

/**
 * Response cache.
 *
 * `next: { revalidate }` is a fetch() option and does nothing for a route
 * handler that reads its own database — and this handler is dynamic regardless,
 * because verifyAdmin reads the session cookie. So the cache is held here, in
 * module scope, for five minutes.
 *
 * Not per-admin: the payload is identical for every admin and contains no
 * caller-specific data. Admin identity is still verified on every request
 * BEFORE the cache is consulted, so the cache can never serve a non-admin.
 * Per serverless instance, so two instances may hold copies of different ages;
 * generatedAt is returned so the UI can say how old the numbers are.
 */
const CACHE_TTL_MS = 5 * 60 * 1000
let cache: { at: number; payload: Record<string, unknown> } | null = null

interface PageResult<T> { data: T[] | null; error: { message: string } | null }

/**
 * Read an entire table, one page at a time.
 *
 * `page` must apply a deterministic order — id, not a timestamp — or rows can
 * repeat or be skipped across page boundaries when two rows share a value.
 */
async function fetchAll<T>(
  label: string,
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = []
  for (let i = 0; i < MAX_PAGES; i++) {
    const from = i * PAGE_SIZE
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) {
      console.error(`[admin/analytics] ${label} page ${i} failed:`, error)
      return { rows, truncated: true }
    }
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) return { rows, truncated: false }
  }
  console.warn(`[admin/analytics] ${label} hit ${MAX_PAGES} pages — result is partial`)
  return { rows, truncated: true }
}

// ── Row shapes ────────────────────────────────────────────────────────────

interface MemberRow {
  id: string
  first_name: string | null; last_name: string | null
  phone: string | null; email: string | null; zip_code: string | null
  status: string | null; subscription_status: string | null
  total_stamps: number | null; created_at: string | null
  origin_store_id: string | null; origin_merchant_id: string | null
  referred_by_member_id: string | null; is_blacklisted: boolean | null
}
interface MerchantRow {
  id: string; company_name: string | null; name: string | null
  billing_status: string | null; subscription_status: string | null
  location_count: number | null; implementation_fee_paid_at: string | null
  created_at: string | null; stripe_connect_id: string | null
  negative_balance: number | string | null; commission_eligible: boolean | null
}
interface StoreRow {
  id: string; display_name: string | null; brand_name: string | null
  canonical_key: string | null; is_active: boolean | null; merchant_id: string | null
  pricing_schedule: Record<string, unknown> | null; google_maps_url: string | null
}
interface ActivityRow {
  member_id: string | null; store_id: string | null; merchant_id: string | null
  origin_merchant_id: string | null; effective_stamps: number | null; occurred_at: string | null
}
interface RewardRow {
  member_id: string | null; earned_at: string | null
  status: string | null; redeemed_at: string | null
}
interface ScanRow {
  identified_product: string | null; identified_category: string | null
  member_choice: string | null; scanned_at: string | null
}
interface ImageLogRow { resolution_method: string | null; ai_confidence: number | string | null }
interface LedgerRow {
  ledger_entry_type: string | null
  credit_amount: number | string | null; debit_amount: number | string | null
}
interface DecisionRow { eligibility_at_payment_time: boolean | null; commission_amount: number | string | null }

const num = (v: number | string | null | undefined): number => Number(v ?? 0) || 0

export async function GET(req: NextRequest) {
  const adminEmail = await verifyAdmin()
  if (!adminEmail) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const refresh = new URL(req.url).searchParams.get('refresh') === '1'
  if (!refresh && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return NextResponse.json({ ...cache.payload, cached: true })
  }

  const admin = createAdminSupabaseClient()
  const now = new Date()

  const monthStart = new Date(now)
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString()

  const [
    membersRes, merchantsRes, storesRes, activityRes, rewardsRes,
    scansRes, imageLogRes, ledgerRes, decisionsRes, catalogRes,
  ] = await Promise.all([
    fetchAll<MemberRow>('members', (f, t) => admin.from('members')
      .select('id, first_name, last_name, phone, email, zip_code, status, subscription_status, total_stamps, created_at, origin_store_id, origin_merchant_id, referred_by_member_id, is_blacklisted')
      .order('id').range(f, t)),

    fetchAll<MerchantRow>('merchants', (f, t) => admin.from('merchants')
      .select('id, company_name, name, billing_status, subscription_status, location_count, implementation_fee_paid_at, created_at, stripe_connect_id, negative_balance, commission_eligible')
      .order('id').range(f, t)),

    fetchAll<StoreRow>('stores', (f, t) => admin.from('stores')
      .select('id, display_name, brand_name, canonical_key, is_active, merchant_id, pricing_schedule, google_maps_url')
      .order('id').range(f, t)),

    fetchAll<ActivityRow>('activity_events', (f, t) => admin.from('activity_events')
      .select('member_id, store_id, merchant_id, origin_merchant_id, effective_stamps, occurred_at')
      .order('id').range(f, t)),

    fetchAll<RewardRow>('rewards', (f, t) => admin.from('rewards')
      .select('member_id, earned_at, status, redeemed_at')
      .order('id').range(f, t)),

    fetchAll<ScanRow>('scanner_events', (f, t) => admin.from('scanner_events')
      .select('identified_product, identified_category, member_choice, scanned_at')
      .order('id').range(f, t)),

    fetchAll<ImageLogRow>('image_search_log', (f, t) => admin.from('image_search_log')
      .select('resolution_method, ai_confidence')
      .order('id').range(f, t)),

    fetchAll<LedgerRow>('settlement_ledger', (f, t) => admin.from('settlement_ledger')
      .select('ledger_entry_type, credit_amount, debit_amount')
      .order('id').range(f, t)),

    fetchAll<DecisionRow>('commission_decisions', (f, t) => admin.from('commission_decisions')
      .select('eligibility_at_payment_time, commission_amount')
      .order('id').range(f, t)),

    // The only capped read: the top of an already-ranked list, not a sample of
    // an unranked one, so the limit cannot change the answer.
    admin.from('product_catalog')
      .select('identified_product, identified_category, scan_count')
      .order('scan_count', { ascending: false, nullsFirst: false })
      .limit(10),
  ])

  const members  = membersRes.rows
  const stores   = storesRes.rows.filter(s => s.id !== BINPERKS_HOUSE_STORE_ID)
  const merchants = merchantsRes.rows.filter(m => m.id !== BINPERKS_HOUSE_MERCHANT_ID)
  const activity = activityRes.rows
  const rewards  = rewardsRes.rows
  const scans    = scansRes.rows
  const imageLog = imageLogRes.rows
  const ledger   = ledgerRes.rows
  const decisions = decisionsRes.rows

  const truncated = [
    membersRes, merchantsRes, storesRes, activityRes, rewardsRes,
    scansRes, imageLogRes, ledgerRes, decisionsRes,
  ].some(r => r.truncated)

  const storeById    = new Map(storesRes.rows.map(s => [s.id, s]))
  const merchantById = new Map(merchantsRes.rows.map(m => [m.id, m]))
  const memberById   = new Map(members.map(m => [m.id, m]))
  const storeLabel = (id: string | null | undefined) => {
    if (!id) return '—'
    const s = storeById.get(id)
    return s ? (s.display_name || s.brand_name || s.canonical_key || '—') : '—'
  }
  const merchantLabel = (id: string | null | undefined) => {
    if (!id) return '—'
    const m = merchantById.get(id)
    return m ? (m.company_name || m.name || '—') : '—'
  }
  const memberLabel = (id: string) => {
    const m = memberById.get(id)
    return m ? [m.first_name, m.last_name].filter(Boolean).join(' ') || '—' : '—'
  }

  // ── 1. Growth ───────────────────────────────────────────────────────────
  const growth = growthForRanges({ members, merchants, activity, rewards }, now)
  const ranges = rangeBounds(now).map(r => ({ key: r.key, label: r.label, since: r.since }))

  // ── 2. Member behaviour ─────────────────────────────────────────────────
  const totalMembers = members.length
  const vipMembers     = members.filter(m => m.subscription_status === 'vip').length
  const starterMembers = members.filter(m => m.subscription_status === 'free').length

  const couponsEarnedAllTime   = rewards.length
  const couponsRedeemedAllTime = rewards.filter(r => r.status === 'redeemed').length
  const membersViaReferral     = members.filter(m => m.referred_by_member_id !== null).length

  const memberBehavior = {
    vipConversion: {
      starterMembers,
      vipMembers,
      totalMembers,
      conversionRate: pct(vipMembers, totalMembers),
    },
    retention: retentionBuckets(members.map(m => m.id), activity, now),
    speedToFirstCoupon: speedToFirstCoupon(members, rewards),
    referrals: {
      membersViaReferral,
      totalMembers,
      referralRate: pct(membersViaReferral, totalMembers),
    },
    coupons: {
      earned: couponsEarnedAllTime,
      redeemed: couponsRedeemedAllTime,
      redemptionRate: pct(couponsRedeemedAllTime, couponsEarnedAllTime),
    },
  }

  // ── 3. Store performance ────────────────────────────────────────────────
  const totalsByStore = storeActivityTotals(activity)

  const topStores = [...totalsByStore.values()]
    .filter(t => t.storeId !== BINPERKS_HOUSE_STORE_ID)
    .sort((a, b) => b.stamps - a.stamps || b.visits - a.visits)
    .slice(0, 10)
    .map(t => ({
      storeId: t.storeId,
      storeName: storeLabel(t.storeId),
      merchantName: merchantLabel(storeById.get(t.storeId)?.merchant_id ?? null),
      stamps: t.stamps,
      visits: t.visits,
    }))

  const inactiveStores = stores
    .filter(s => {
      const last = totalsByStore.get(s.id)?.lastActivityAt ?? null
      return last === null || last < thirtyDaysAgo
    })
    .map(s => ({
      storeId: s.id,
      storeName: storeLabel(s.id),
      merchantName: merchantLabel(s.merchant_id),
      isActive: s.is_active ?? false,
      lastActivityAt: totalsByStore.get(s.id)?.lastActivityAt ?? null,
    }))
    .sort((a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? ''))

  // A stamp earned at a merchant other than the member's Origin Merchant.
  // House-origin members are counted SEPARATELY: they have no participating
  // origin merchant at all, so every stamp they earn would qualify and would
  // overstate how much real cross-shopping is happening.
  const houseOriginEvents = activity.filter(
    a => a.origin_merchant_id === BINPERKS_HOUSE_MERCHANT_ID,
  ).length
  const crossNetworkEvents = activity.filter(
    a => a.origin_merchant_id !== BINPERKS_HOUSE_MERCHANT_ID
      && a.merchant_id !== null
      && a.origin_merchant_id !== null
      && a.merchant_id !== a.origin_merchant_id,
  ).length

  const storePerformance = {
    topStores,
    inactiveStores,
    crossNetworkActivity: {
      crossNetworkEvents,
      totalEvents: activity.length,
      crossNetworkPct: pct(crossNetworkEvents, activity.length),
      houseOriginEvents,
    },
  }

  // ── 4. Scanner intelligence ─────────────────────────────────────────────
  const totalScans = scans.length
  const scansThisMonth = scans.filter(
    s => s.scanned_at !== null && s.scanned_at >= monthStart.toISOString(),
  ).length

  const methodCount = (method: string) =>
    imageLog.filter(r => r.resolution_method === method).length

  const confidences = imageLog
    .map(r => Number(r.ai_confidence))
    .filter(n => Number.isFinite(n))
  const avgConfidence = confidences.length > 0
    ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 1000) / 1000
    : null

  const imageSearchCalls = methodCount('IMAGE_SEARCH') + methodCount('SEARCH_FAILED')

  const scannerIntelligence = {
    totalScans,
    scansThisMonth,
    topCategories: topCategories(scans, 10),
    topProducts: (catalogRes.data ?? []).map(p => ({
      product: p.identified_product,
      category: p.identified_category,
      scans: p.scan_count ?? 0,
    })),
    avgConfidence,
    // Sample size matters here: image_search_log only has a row for scans that
    // reached the Product Image Service, so this is not an average over every
    // scan and should not be read as one.
    confidenceSampleSize: confidences.length,
    imageSearchRate: pct(imageSearchCalls, totalScans),
    catalogHitRate:  pct(methodCount('CATALOG_HIT'), totalScans),
    imageSearchCalls,
    catalogHits: methodCount('CATALOG_HIT'),
  }

  // ── 5. Financial health ─────────────────────────────────────────────────
  // SIGN CONVENTION (CLAUDE.md): a commission payable to a merchant is a
  // credit_amount; a commission BinPerks retained is a debit_amount with
  // credit_amount 0. Summing credits for the retained figure returns zero —
  // the bug fixed in the admin stats route — so each reads its own column.
  const sumBy = (type: string, col: 'credit_amount' | 'debit_amount') =>
    round2(ledger.filter(l => l.ledger_entry_type === type).reduce((s, l) => s + num(l[col]), 0))

  const eligibleDecisions = decisions.filter(d => d.eligibility_at_payment_time === true).length

  const activeBillingMerchants = merchants.filter(m => m.billing_status === 'active')
  const mrr = computeMrr(activeBillingMerchants, vipMembers, now)

  const negativeMerchants = merchants
    .filter(m => num(m.negative_balance) > 0)
    .map(m => ({
      merchantId: m.id,
      merchantName: m.company_name || m.name || '—',
      negativeBalance: round2(num(m.negative_balance)),
    }))
    .sort((a, b) => b.negativeBalance - a.negativeBalance)

  const financialHealth = {
    commissionsEarned:   sumBy('commission_credit', 'credit_amount'),
    commissionsRetained: sumBy('commission_retained_binperks', 'debit_amount'),
    couponsFundedByBinPerks: sumBy('coupon_debit_binperks', 'debit_amount'),
    eligibilityRate: pct(eligibleDecisions, decisions.length),
    commissionDecisions: decisions.length,
    eligibleDecisions,
    negativeMerchants,
    mrr,
    // Empty until the first VIP payment runs through /api/member/vip-webhook.
    // Flagged so zeros read as "nothing has happened yet" and not as a failure.
    ledgerEmpty: ledger.length === 0,
  }

  // ── 6. Network health ───────────────────────────────────────────────────
  const activeMerchants = merchants.filter(m => m.billing_status === 'active')
  const activeStores    = stores.filter(s => s.is_active === true)

  const missingConnect = activeMerchants.filter(m => !m.stripe_connect_id)
  const noPricing = stores.filter(s => {
    const p = s.pricing_schedule
    return p === null || typeof p !== 'object' || Object.keys(p).length === 0
  })
  const noMaps  = stores.filter(s => !s.google_maps_url)
  const noEmail = members.filter(m => !m.email)
  const noZip   = members.filter(m => !m.zip_code)

  const check = (label: string, missing: number, total: number, names: string[] = []) => ({
    label, missing, total, tone: healthTone(missing, total), names: names.slice(0, 25),
  })

  const networkHealth = {
    activeMerchants: activeMerchants.length,
    activeStores: activeStores.length,
    totalMerchants: merchants.length,
    totalStores: stores.length,
    checks: [
      check('Merchants without Stripe Connect', missingConnect.length, activeMerchants.length,
        missingConnect.map(m => m.company_name || m.name || m.id)),
      check('Stores without a pricing schedule', noPricing.length, stores.length,
        noPricing.map(s => storeLabel(s.id))),
      check('Stores without a Google Maps URL', noMaps.length, stores.length,
        noMaps.map(s => storeLabel(s.id))),
      check('Members without an email', noEmail.length, members.length),
      check('Members without a zip code', noZip.length, members.length),
    ],
  }

  // ── 7. Anomalies ────────────────────────────────────────────────────────
  // A Starter member is capped at one $5 coupon and blocked after visit 22, so
  // this list should be empty. Anything in it means the cap did not hold.
  const starterOver20 = members
    .filter(m => m.subscription_status === 'free' && (m.total_stamps ?? 0) > 20)
    .map(m => ({
      memberId: m.id,
      name: [m.first_name, m.last_name].filter(Boolean).join(' ') || '—',
      phone: m.phone ?? '—',
      totalStamps: m.total_stamps ?? 0,
      originStore: storeLabel(m.origin_store_id),
      isBlacklisted: m.is_blacklisted ?? false,
    }))
    .sort((a, b) => b.totalStamps - a.totalStamps)

  const highVelocity = highVelocityDays(activity, 3).map(h => ({
    ...h,
    memberName: memberLabel(h.memberId),
  }))

  const duplicates = possibleDuplicates(members)

  const payload = {
    generatedAt: now.toISOString(),
    cached: false,
    // True when a read stopped early. The numbers below are then a floor, not a
    // total, and the UI says so rather than presenting them as complete.
    truncated,
    ranges,
    growth: growth as Record<RangeKey, unknown>,
    memberBehavior,
    storePerformance,
    scannerIntelligence,
    financialHealth,
    networkHealth,
    anomalies: {
      starterOver20,
      highVelocity,
      possibleDuplicates: duplicates,
    },
  }

  cache = { at: Date.now(), payload }

  return NextResponse.json(payload, {
    // Private: this is admin-only data and must never sit in a shared cache.
    headers: { 'Cache-Control': 'private, max-age=300' },
  })
}
