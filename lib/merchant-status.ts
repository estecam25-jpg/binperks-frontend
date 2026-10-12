/**
 * Whether a merchant may award stamps, and when it stops being able to.
 *
 * THE RULE: a platform payment that fails starts a 30-day clock. During those
 * 30 days nothing changes — the stores keep stamping, members keep earning,
 * commissions keep accruing. On day 30, if the payment is still unpaid, the
 * account goes inactive and every one of its stores stops being able to stamp.
 * Paying in full restores it immediately.
 *
 * WHY STAMPING IS GATED AT ALL. A stamp is a promise that costs the merchant
 * money later: twenty of them earn a coupon that merchant funds. A merchant
 * who has stopped paying for the platform cannot keep writing those promises.
 *
 * WHY IT IS GATED HERE AND NOT IN THE UI. The stamp tool already hides stores
 * it should not show, but the UI is not enforcement — /api/stamp is a plain
 * POST and anything can call it.
 */

/** Days between a failed payment and the account going inactive. */
export const GRACE_PERIOD_DAYS = 30

/** Statuses that can still stamp. 'house' is the BinPerks internal merchant,
 *  which owns no physical store but must never be blocked by a billing rule
 *  that does not apply to it. */
const CAN_STAMP = new Set(['active', 'grace_period', 'house'])

export interface MerchantStampability {
  billing_status: string | null
  admin_suspended?: boolean | null
}

/** May this merchant's stores award a stamp right now? */
export function canAwardStamps(m: MerchantStampability | null | undefined): boolean {
  if (!m) return false
  if (m.admin_suspended) return false
  return CAN_STAMP.has(m.billing_status ?? '')
}

/** Is this merchant inactive — the state that releases its members? */
export function isInactiveMerchant(m: MerchantStampability | null | undefined): boolean {
  if (!m) return true
  return !canAwardStamps(m)
}

/** The moment a grace period that started at `failedAt` runs out. */
export function graceEndsAt(failedAt: string | Date): Date {
  const start = typeof failedAt === 'string' ? new Date(failedAt) : failedAt
  return new Date(start.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)
}

/** Whole days left before stamping stops. 0 once the clock has run out. */
export function graceDaysRemaining(failedAt: string | Date, now: Date = new Date()): number {
  const ms = graceEndsAt(failedAt).getTime() - now.getTime()
  return ms <= 0 ? 0 : Math.ceil(ms / (24 * 60 * 60 * 1000))
}

/** What the stamp tool says when a store cannot stamp. One sentence, and it
 *  names the way out — a cashier reading it should know to ring BinPerks
 *  rather than retry or tell the member something is broken. */
export const CANNOT_STAMP_MESSAGE =
  "This store can't award stamps right now. Please contact BinPerks support."
