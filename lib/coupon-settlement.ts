/**
 * Who pays for a coupon, and what that writes to the settlement ledger.
 *
 * SERVER ONLY — takes the service-role client.
 *
 * ── THE RULE ───────────────────────────────────────────────────────────────
 * Every coupon is funded by the member's ORIGIN STORE AS AT THE MOMENT IT WAS
 * EARNED. That store is stamped onto the reward row (funding_merchant_id) and
 * never recalculated, which is what makes a cycle that began under one store
 * and completed under another unambiguous: the store that was the origin when
 * the twentieth stamp landed owes the whole coupon.
 *
 * At redemption:
 *
 *   SAME STORE      the funding store honoured its own coupon. Nothing moves,
 *                   nothing is written. There is no money to settle: the
 *                   discount came off its own till.
 *   ANOTHER STORE   the honouring merchant is reimbursed the face value and
 *                   the funding merchant is charged it. Two rows, one credit
 *                   and one debit, both in the month the coupon was redeemed.
 *   FUNDER GONE     if the funding merchant is inactive, terminated or
 *                   missing, BinPerks pays the honouring merchant instead and
 *                   the amount is recorded as BinPerks-funded.
 *
 * ── WHERE THE MONEY ACTUALLY MOVES ─────────────────────────────────────────
 * Nowhere, here. These rows are claims. The monthly batch
 * (/api/admin/settlement/calculate) nets a merchant's coupon debits against
 * its commission credits — the debit comes out of its Merchant Share first —
 * and anything still owed after that becomes a negative balance carried into
 * the next month, which is what "owed to BinPerks" means. No transfer is
 * initiated from this file.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { canAwardStamps } from '@/lib/merchant-status'

type Admin = SupabaseClient

/** YYYY-MM in UTC — the period the settlement batch sweeps. */
export function settlementPeriod(when: Date = new Date()): string {
  return `${when.getUTCFullYear()}-${String(when.getUTCMonth() + 1).padStart(2, '0')}`
}

export interface RedeemedReward {
  id: string
  member_id: string | null
  coupon_value: number | string
  funding_store_id: string | null
  funding_merchant_id: string | null
}

/**
 * Record what a redemption owes, if anything.
 *
 * Never throws and never blocks a redemption: the member has already been
 * given their discount at the counter by the time this runs, and a ledger row
 * that failed to write is a reconciliation problem, not a reason to refuse
 * someone their coupon.
 */
export async function recordCouponRedemption(
  admin: Admin,
  reward: RedeemedReward,
  redeemingStoreId: string,
  redeemingMerchantId: string,
  redeemedAt: Date = new Date(),
): Promise<'same_store' | 'cross_store' | 'binperks_funded' | 'skipped'> {
  try {
    const value = Number(reward.coupon_value ?? 0)
    if (!(value > 0)) return 'skipped'

    // Rewards earned before funding was recorded carry no funder. There is
    // nobody to charge, so there is nothing to settle.
    if (!reward.funding_merchant_id) {
      console.warn(`[coupon-settlement] reward ${reward.id} has no funding merchant — not settled`)
      return 'skipped'
    }

    // Honoured by the store that funds it: the discount came off its own till.
    if (reward.funding_merchant_id === redeemingMerchantId) return 'same_store'

    const { data: funder } = await admin
      .from('merchants')
      .select('billing_status, admin_suspended')
      .eq('id', reward.funding_merchant_id)
      .maybeSingle()

    const funderPays = canAwardStamps(funder)
    const period     = settlementPeriod(redeemedAt)
    const occurredAt = redeemedAt.toISOString()

    // The honouring merchant is reimbursed either way. Who funds it differs.
    const rows: Record<string, unknown>[] = [{
      ledger_entry_type:    'coupon_credit_redeeming',
      member_id:            reward.member_id,
      reward_id:            reward.id,
      origin_store_id:      reward.funding_store_id,
      origin_merchant_id:   reward.funding_merchant_id,
      redeeming_store_id:   redeemingStoreId,
      redeeming_merchant_id: redeemingMerchantId,
      funding_party:        funderPays ? 'origin_merchant' : 'binperks',
      coupon_value:         value,
      credit_amount:        value,
      debit_amount:         0,
      occurred_at:          occurredAt,
      settlement_period:    period,
      ledger_status:        'pending',
    }]

    if (funderPays) {
      rows.push({
        ledger_entry_type:     'coupon_debit_origin',
        member_id:             reward.member_id,
        reward_id:             reward.id,
        origin_store_id:       reward.funding_store_id,
        origin_merchant_id:    reward.funding_merchant_id,
        redeeming_store_id:    redeemingStoreId,
        redeeming_merchant_id: redeemingMerchantId,
        funding_party:         'origin_merchant',
        coupon_value:          value,
        credit_amount:         0,
        debit_amount:          value,
        occurred_at:           occurredAt,
        settlement_period:     period,
        ledger_status:         'pending',
      })
    } else {
      // BinPerks pays the honouring merchant now. The amount is still recorded
      // against the funding merchant as owed — admin raises the invoice, and
      // collection happens outside this system.
      rows.push({
        ledger_entry_type:     'coupon_debit_binperks',
        member_id:             reward.member_id,
        reward_id:             reward.id,
        origin_store_id:       reward.funding_store_id,
        origin_merchant_id:    reward.funding_merchant_id,
        redeeming_store_id:    redeemingStoreId,
        redeeming_merchant_id: redeemingMerchantId,
        funding_party:         'binperks',
        coupon_value:          value,
        credit_amount:         0,
        debit_amount:          value,
        occurred_at:           occurredAt,
        settlement_period:     period,
        ledger_status:         'pending',
        internal_notes:        'Funding merchant inactive or terminated at redemption — BinPerks paid the honouring merchant and the amount is owed by the funding merchant.',
      })
    }

    const { error } = await admin.from('settlement_ledger').insert(rows)
    if (error) {
      console.error(`[coupon-settlement] ledger insert failed for reward ${reward.id}:`, error)
      return 'skipped'
    }

    return funderPays ? 'cross_store' : 'binperks_funded'
  } catch (err) {
    console.error('[coupon-settlement] unexpected error:', err)
    return 'skipped'
  }
}

/** A coupon is spendable if it is earned and has not run out of time. */
export function isSpendable(r: { status: string; expires_at?: string | null }, now: Date = new Date()): boolean {
  if (r.status !== 'earned') return false
  if (!r.expires_at) return true
  return new Date(r.expires_at).getTime() > now.getTime()
}
