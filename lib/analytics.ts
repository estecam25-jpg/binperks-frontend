/**
 * Admin analytics aggregation.
 *
 * Pure functions, no Supabase client. They live outside the route for the same
 * reason lib/scanner-analytics.ts does: a route handler can only be reached
 * through an admin session, which makes the grouping rules awkward to check
 * against real rows otherwise.
 *
 * ON DAY BOUNDARIES: everything here works in UTC. Vercel runs the route in
 * UTC, so `new Date().setHours(0,0,0,0)` in /api/admin/stats is already a UTC
 * midnight — matching that keeps the two tabs from disagreeing about what "this
 * month" means. It does mean a late-evening Eastern stamp counts toward the
 * next UTC day. That is a reporting nuance, not a stamping rule: the 1-per-day
 * stamp limit is enforced elsewhere, against visits.date.
 */

export type RangeKey = 'week' | 'mtd' | 'ytd' | 'allTime'

export const RANGE_KEYS: RangeKey[] = ['week', 'mtd', 'ytd', 'allTime']

export interface RangeBounds {
  key: RangeKey
  /** ISO timestamp, or null for all time. */
  since: string | null
  label: string
}

/**
 * Start of each reporting window.
 *
 * "This week" is the current calendar week starting Sunday — NOT a store's
 * fiscal week. Fiscal weeks are per store (stores.fiscal_week_start) and three
 * stores can be mid-week on three different days; a network-wide figure has to
 * pick one calendar. The UI shows the actual boundary date so nobody has to
 * guess which convention is in play.
 */
export function rangeBounds(now: Date = new Date()): RangeBounds[] {
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - now.getDay())   // back to Sunday
  weekStart.setHours(0, 0, 0, 0)

  const monthStart = new Date(now)
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const yearStart = new Date(now)
  yearStart.setMonth(0, 1)
  yearStart.setHours(0, 0, 0, 0)

  return [
    { key: 'week',    since: weekStart.toISOString(),  label: 'This Week' },
    { key: 'mtd',     since: monthStart.toISOString(), label: 'MTD' },
    { key: 'ytd',     since: yearStart.toISOString(),  label: 'YTD' },
    { key: 'allTime', since: null,                     label: 'All Time' },
  ]
}

/** True when `iso` falls on or after `since`. A null `since` means all time. */
export function inRange(iso: string | null | undefined, since: string | null): boolean {
  if (since === null) return true
  if (!iso) return false
  return iso >= since
}

// ── Growth ────────────────────────────────────────────────────────────────

export interface GrowthRow {
  newMembers: number
  newVipMembers: number
  newMerchants: number
  stampsAwarded: number
  couponsEarned: number
  couponsRedeemed: number
}

export interface GrowthInputs {
  members:   { created_at: string | null; subscription_status: string | null }[]
  merchants: { created_at: string | null }[]
  activity:  { occurred_at: string | null; effective_stamps: number | null }[]
  rewards:   { earned_at: string | null; status: string | null; redeemed_at: string | null }[]
}

/**
 * One growth row per window.
 *
 * NEW VIP IS APPROXIMATE and always will be from this data: there is no
 * upgraded_at column, so a member who joined in January and upgraded in August
 * counts in January's window, not August's. Stated in the UI rather than
 * quietly presented as an upgrade date.
 *
 * COUPONS EARNED counts reward ROWS created in the window. Every rewards row is
 * a coupon that was earned; status only says whether it has since been
 * redeemed. (/api/admin/stats counts status='earned' for its "issued" figure,
 * which is really "earned and still unredeemed" — a different question.)
 */
export function growthForRanges(input: GrowthInputs, now: Date = new Date()) {
  const out: Record<RangeKey, GrowthRow> = {} as Record<RangeKey, GrowthRow>

  for (const { key, since } of rangeBounds(now)) {
    out[key] = {
      newMembers: input.members.filter(m => inRange(m.created_at, since)).length,
      newVipMembers: input.members.filter(
        m => m.subscription_status === 'vip' && inRange(m.created_at, since),
      ).length,
      newMerchants: input.merchants.filter(m => inRange(m.created_at, since)).length,
      stampsAwarded: input.activity
        .filter(a => inRange(a.occurred_at, since))
        .reduce((sum, a) => sum + (a.effective_stamps ?? 0), 0),
      couponsEarned: input.rewards.filter(r => inRange(r.earned_at, since)).length,
      // Redemption is dated by redeemed_at, not earned_at: a coupon earned in
      // June and redeemed in August belongs to August's redemption figure.
      couponsRedeemed: input.rewards.filter(
        r => r.status === 'redeemed' && inRange(r.redeemed_at, since),
      ).length,
    }
  }

  return out
}

// ── Retention ─────────────────────────────────────────────────────────────

export interface RetentionBuckets {
  last30: number
  days31to60: number
  days61to90: number
  inactive90Plus: number
  neverStamped: number
}

/**
 * Members bucketed by how long ago they last earned a stamp.
 *
 * NEVER-STAMPED IS ITS OWN BUCKET. Folding a member who has never stamped into
 * "inactive 90+" would read as churn when it is really a member who never
 * started — a signup problem, not a retention problem, and they are fixed in
 * completely different ways.
 */
export function retentionBuckets(
  memberIds: string[],
  activity: { member_id: string | null; occurred_at: string | null }[],
  now: Date = new Date(),
): RetentionBuckets {
  const lastByMember = new Map<string, string>()
  for (const a of activity) {
    if (!a.member_id || !a.occurred_at) continue
    const prev = lastByMember.get(a.member_id)
    if (!prev || a.occurred_at > prev) lastByMember.set(a.member_id, a.occurred_at)
  }

  const buckets: RetentionBuckets = {
    last30: 0, days31to60: 0, days61to90: 0, inactive90Plus: 0, neverStamped: 0,
  }

  for (const id of memberIds) {
    const last = lastByMember.get(id)
    if (!last) { buckets.neverStamped++; continue }
    const days = daysBetween(new Date(last), now)
    if (days <= 30)      buckets.last30++
    else if (days <= 60) buckets.days31to60++
    else if (days <= 90) buckets.days61to90++
    else                 buckets.inactive90Plus++
  }

  return buckets
}

export function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 86_400_000
}

// ── Speed to first coupon ─────────────────────────────────────────────────

export interface SpeedToFirstCoupon {
  averageDays: number | null
  memberCount: number
  fastestDays: number | null
  slowestDays: number | null
}

/**
 * Average days from signup to a member's FIRST coupon.
 *
 * Only members who have actually earned one are averaged — including members
 * who never earned a coupon as a zero would drag the average toward zero, and
 * counting them as "still waiting" would need a censored-data model this
 * dashboard does not warrant. memberCount is returned so the sample size is
 * visible next to the average.
 *
 * A first reward dated before the member row (possible for backfilled test
 * data) is clamped to 0 rather than subtracting from everyone else's average.
 */
export function speedToFirstCoupon(
  members: { id: string; created_at: string | null }[],
  rewards: { member_id: string | null; earned_at: string | null }[],
): SpeedToFirstCoupon {
  const firstReward = new Map<string, string>()
  for (const r of rewards) {
    if (!r.member_id || !r.earned_at) continue
    const prev = firstReward.get(r.member_id)
    if (!prev || r.earned_at < prev) firstReward.set(r.member_id, r.earned_at)
  }

  const spans: number[] = []
  for (const m of members) {
    const first = firstReward.get(m.id)
    if (!first || !m.created_at) continue
    spans.push(Math.max(0, daysBetween(new Date(m.created_at), new Date(first))))
  }

  if (spans.length === 0) {
    return { averageDays: null, memberCount: 0, fastestDays: null, slowestDays: null }
  }

  const avg = spans.reduce((a, b) => a + b, 0) / spans.length
  return {
    averageDays: Math.round(avg * 10) / 10,
    memberCount: spans.length,
    fastestDays: Math.round(Math.min(...spans) * 10) / 10,
    slowestDays: Math.round(Math.max(...spans) * 10) / 10,
  }
}

// ── Store performance ─────────────────────────────────────────────────────

export interface StoreActivityTotals {
  storeId: string
  stamps: number
  visits: number
  lastActivityAt: string | null
}

/**
 * Per-store totals from activity_events.
 *
 * VISITS ARE ROWS, NOT SUMMED STAMPS. The stamp route writes exactly one row
 * per qualifying visit, so counting rows is right for both live and backfilled
 * data — while summing stamps_awarded is not, because the Phase 1 backfill put
 * the multiplied total in that column with multiplier 1.00.
 */
export function storeActivityTotals(
  activity: { store_id: string | null; effective_stamps: number | null; occurred_at: string | null }[],
): Map<string, StoreActivityTotals> {
  const byStore = new Map<string, StoreActivityTotals>()
  for (const a of activity) {
    if (!a.store_id) continue
    let t = byStore.get(a.store_id)
    if (!t) {
      t = { storeId: a.store_id, stamps: 0, visits: 0, lastActivityAt: null }
      byStore.set(a.store_id, t)
    }
    t.stamps += a.effective_stamps ?? 0
    t.visits += 1
    if (a.occurred_at && (!t.lastActivityAt || a.occurred_at > t.lastActivityAt)) {
      t.lastActivityAt = a.occurred_at
    }
  }
  return byStore
}

// ── Anomalies ─────────────────────────────────────────────────────────────

export interface HighVelocityDay {
  memberId: string
  date: string
  storeCount: number
}

/**
 * Members who stamped at `minStores`+ different locations on the same day.
 *
 * Not proof of anything on its own — a member genuinely can visit three stores
 * in one day, and the 1-per-store-per-day rule permits it. It is a review
 * prompt, which is why the raw rows are returned rather than a verdict.
 */
export function highVelocityDays(
  activity: { member_id: string | null; store_id: string | null; occurred_at: string | null }[],
  minStores = 3,
): HighVelocityDay[] {
  const byMemberDay = new Map<string, Set<string>>()
  for (const a of activity) {
    if (!a.member_id || !a.store_id || !a.occurred_at) continue
    const key = `${a.member_id}|${a.occurred_at.slice(0, 10)}`
    const set = byMemberDay.get(key) ?? new Set<string>()
    set.add(a.store_id)
    byMemberDay.set(key, set)
  }

  const out: HighVelocityDay[] = []
  for (const [key, stores] of byMemberDay) {
    if (stores.size < minStores) continue
    const [memberId, date] = key.split('|')
    out.push({ memberId, date, storeCount: stores.size })
  }
  return out.sort((a, b) => b.storeCount - a.storeCount || b.date.localeCompare(a.date))
}

export interface DuplicateGroup {
  name: string
  members: { id: string; phone: string; createdAt: string | null; subscriptionStatus: string | null }[]
}

/**
 * Members sharing a first + last name across DIFFERENT phone numbers.
 *
 * One phone is one BinPerks membership (CLAUDE.md rule 17) and the phone column
 * is globally unique, so a duplicate account can only ever show up as the same
 * person on a second number. Two real people named John Smith will land here
 * too — hence "possible", and hence a list for a human rather than an action.
 */
export function possibleDuplicates(
  members: {
    id: string; first_name: string | null; last_name: string | null
    phone: string | null; created_at: string | null; subscription_status: string | null
  }[],
): DuplicateGroup[] {
  const byName = new Map<string, DuplicateGroup>()

  for (const m of members) {
    const first = (m.first_name ?? '').trim()
    const last  = (m.last_name ?? '').trim()
    if (!first && !last) continue
    const key = `${first.toLowerCase()} ${last.toLowerCase()}`.trim()

    let g = byName.get(key)
    if (!g) {
      g = { name: [first, last].filter(Boolean).join(' '), members: [] }
      byName.set(key, g)
    }
    g.members.push({
      id: m.id,
      phone: m.phone ?? '',
      createdAt: m.created_at,
      subscriptionStatus: m.subscription_status,
    })
  }

  return [...byName.values()]
    .filter(g => new Set(g.members.map(m => m.phone)).size > 1)
    .sort((a, b) => b.members.length - a.members.length || a.name.localeCompare(b.name))
}

// ── Health scoring ────────────────────────────────────────────────────────

export type HealthTone = 'green' | 'yellow' | 'red'

/**
 * Green when nothing is missing, red when most of the set is, yellow between.
 *
 * A count with no denominator (total 0) is green — nothing exists to be wrong.
 */
export function healthTone(missing: number, total: number): HealthTone {
  if (missing <= 0) return 'green'
  if (total <= 0) return 'green'
  return missing / total > 0.5 ? 'red' : 'yellow'
}
