/**
 * MRR pricing, in one place.
 *
 * V3 billing has three moving parts (CLAUDE.md "PRICING (V3 LOCKED)"):
 *   $299.99  Implementation & Launch — first billing cycle only
 *   $99.00   Platform subscription   — cycle 2 onward
 *   $49.99   Additional location     — every cycle, including the first
 *   $29.99   Member VIP              — per VIP member per month
 *
 * This lived inline in /api/admin/stats. It moved here when the Analytics tab
 * needed the same number: two copies of the pricing table is exactly how a
 * dashboard ends up reporting two different MRRs on two different tabs.
 */

export const IMPLEMENTATION_PRICE = 299.99
export const PLATFORM_PRICE       = 99.00
export const EXTRA_LOCATION_PRICE = 49.99
export const VIP_PRICE            = 29.99

export interface BillableMerchant {
  location_count: number | null
  implementation_fee_paid_at: string | null
  subscription_status?: string | null
  created_at?: string | null
}

/**
 * What one merchant bills per month.
 *
 * A merchant still inside their first billing cycle is paying the
 * implementation fee. A null implementation_fee_paid_at means a pre-V3
 * merchant, who is by definition past their first cycle.
 */
export function monthlyBilling(m: BillableMerchant, now: Date = new Date()): number {
  const oneMonthAgo = new Date(now)
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)

  const locs = Math.max(1, m.location_count ?? 1)
  const paidAt = m.implementation_fee_paid_at ? new Date(m.implementation_fee_paid_at) : null
  const inFirstCycle = paidAt !== null && paidAt > oneMonthAgo
  const basePrice = inFirstCycle ? IMPLEMENTATION_PRICE : PLATFORM_PRICE
  return basePrice + (locs - 1) * EXTRA_LOCATION_PRICE
}

/**
 * Network MRR.
 *
 * `merchants` must already be filtered to billing_status = 'active' by the
 * caller — that filter belongs in the query, not here. The house BinPerks
 * merchant carries billing_status 'house' and so never reaches this.
 * subscription_status is filtered here because a merchant can be billing-active
 * while their Stripe subscription is not.
 */
export function computeMrr(
  merchants: BillableMerchant[],
  vipMemberCount: number,
  now: Date = new Date(),
) {
  const active = merchants.filter(m => m.subscription_status === 'active')
  const merchantMrr = active.reduce((sum, m) => sum + monthlyBilling(m, now), 0)
  const memberMrr   = vipMemberCount * VIP_PRICE
  return {
    activeMerchantCount: active.length,
    merchantMrr: round2(merchantMrr),
    memberMrr:   round2(memberMrr),
    totalMrr:    round2(merchantMrr + memberMrr),
  }
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}
