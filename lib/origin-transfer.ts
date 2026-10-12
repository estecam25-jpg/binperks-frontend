/**
 * Moving a member's origin store when the one on file can no longer serve them.
 *
 * SERVER ONLY — takes the service-role client.
 *
 * WHEN IT HAPPENS. A member whose origin merchant has gone inactive, or who
 * joined through BinPerks directly rather than through a store, is attributed
 * to the next active store that stamps them. No approval from either merchant,
 * no admin step: the member walked into a shop and that shop earned them.
 *
 * FROM THAT STAMP FORWARD, NEVER BACKWARDS. The transfer is written before the
 * stamp is recorded, so the visit itself, any coupon it completes and every
 * commission after it belong to the new store. Nothing already settled moves,
 * and a merchant that pays its bill and reactivates does NOT get these members
 * back — their attribution has already moved on.
 *
 * WHAT THE RECEIVING MERCHANT LEARNS: nothing. The transfer is recorded in
 * member_origin_history, which is admin-only (RLS on, no policies). The
 * merchant dashboard shows aggregate counts for members attributed to it and
 * has no route to a previous origin or to activity anywhere else.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { BINPERKS_HOUSE_MERCHANT_ID } from '@/lib/binperks-origin'
import { canAwardStamps } from '@/lib/merchant-status'

type Admin = SupabaseClient

export interface TransferCandidate {
  id: string
  origin_store_id: string | null
  origin_merchant_id: string | null
}

export interface TransferResult {
  /** The origin the stamp should be attributed to — the new one if it moved. */
  originStoreId: string | null
  originMerchantId: string | null
  transferred: boolean
  reason: 'origin_inactive' | 'house_origin_first_stamp' | null
}

/**
 * Move the member's origin to this store if the one they have cannot keep it.
 *
 * Returns the origin to use for everything that follows in this request, so
 * the caller never has to decide whether to use the old value or the new one.
 * Never throws: a transfer that fails leaves the member where they were and
 * the stamp still happens.
 */
export async function transferOriginIfDue(
  admin: Admin,
  member: TransferCandidate,
  toStoreId: string,
  toMerchantId: string,
): Promise<TransferResult> {
  const unchanged: TransferResult = {
    originStoreId:    member.origin_store_id,
    originMerchantId: member.origin_merchant_id,
    transferred:      false,
    reason:           null,
  }

  try {
    // Already here. Nothing to move, and no history row worth writing.
    if (member.origin_merchant_id === toMerchantId && member.origin_store_id === toStoreId) {
      return unchanged
    }

    // A member who joined through BinPerks itself belongs to the first store
    // that actually stamps them — that shop did the acquiring.
    const isHouse = !member.origin_merchant_id
      || member.origin_merchant_id === BINPERKS_HOUSE_MERCHANT_ID

    let reason: TransferResult['reason'] = null

    if (isHouse) {
      reason = 'house_origin_first_stamp'
    } else {
      const { data: current } = await admin
        .from('merchants')
        .select('billing_status, admin_suspended')
        .eq('id', member.origin_merchant_id)
        .maybeSingle()

      // A merchant row that has vanished counts as gone, not as a reason to
      // keep a member attributed to nothing.
      if (!current || !canAwardStamps(current)) reason = 'origin_inactive'
    }

    if (!reason) return unchanged

    const now = new Date().toISOString()

    const { data: moved, error } = await admin
      .from('members')
      .update({
        origin_store_id:       toStoreId,
        origin_merchant_id:    toMerchantId,
        origin_transferred_at: now,
      })
      .eq('id', member.id)
      // Compare-and-set on the origin they still have, so two stamps racing at
      // two stores cannot both claim the member.
      .eq('origin_merchant_id', member.origin_merchant_id ?? '')
      .select('id')

    // The guard above cannot match a member whose origin_merchant_id is NULL,
    // so that case is handled on its own.
    const claimed = moved && moved.length > 0
    if (!claimed && member.origin_merchant_id === null) {
      const { data: movedNull } = await admin
        .from('members')
        .update({
          origin_store_id:       toStoreId,
          origin_merchant_id:    toMerchantId,
          origin_transferred_at: now,
        })
        .eq('id', member.id)
        .is('origin_merchant_id', null)
        .select('id')
      if (!movedNull || movedNull.length === 0) return unchanged
    } else if (error || !claimed) {
      if (error) console.error('[origin-transfer] member update failed:', error)
      return unchanged
    }

    const { error: histError } = await admin.from('member_origin_history').insert({
      member_id:        member.id,
      from_store_id:    member.origin_store_id,
      from_merchant_id: member.origin_merchant_id,
      to_store_id:      toStoreId,
      to_merchant_id:   toMerchantId,
      reason,
      occurred_at:      now,
    })
    // The transfer itself has happened; a missing history row is an audit gap
    // worth logging, not a reason to put the member back.
    if (histError) console.error('[origin-transfer] history insert failed:', histError)

    console.log(`[origin-transfer] member ${member.id} -> merchant ${toMerchantId} (${reason})`)

    return { originStoreId: toStoreId, originMerchantId: toMerchantId, transferred: true, reason }
  } catch (err) {
    console.error('[origin-transfer] unexpected error:', err)
    return unchanged
  }
}
