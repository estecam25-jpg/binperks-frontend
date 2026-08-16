/**
 * The BinPerks "house" origin.
 *
 * A member who joins through BinPerks itself — no store QR, no referral — is
 * attributed to these rows rather than to a participating merchant.
 *
 * WHY REAL ROWS AND NOT NULL: members.origin_store_id and origin_merchant_id
 * are foreign keys, and commission_decisions.origin_* and activity_events.origin_*
 * are NOT NULL. A null origin makes the VIP webhook fail the entire Stripe
 * event (no commission decision, no ledger entry, the $29.99 unrecorded) and
 * makes every stamp skip its activity_events dual-write. Real rows satisfy all
 * of that with no branching in the money path.
 *
 * NO COMMISSION ACCRUES because the house merchant is commission_eligible =
 * false. The VIP webhook already writes commission_retained_binperks for an
 * ineligible origin, so BinPerks keeps the full amount through the existing
 * code path — the same one used when a real merchant lapses.
 *
 * The house store is is_active = false, which keeps it out of the cashier store
 * picker, the member store finder and /member, while still resolving by id for
 * branding lookups.
 */

export const BINPERKS_HOUSE_MERCHANT_ID = '00000000-0000-0000-0000-b19ec5000001'
export const BINPERKS_HOUSE_STORE_ID    = '00000000-0000-0000-0000-b19ec5000002'

export function isBinPerksHouseStore(storeId: string | null | undefined): boolean {
  return storeId === BINPERKS_HOUSE_STORE_ID
}
