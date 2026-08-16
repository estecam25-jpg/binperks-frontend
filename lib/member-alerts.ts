/**
 * Member alerts — creation helpers.
 *
 * Alerts are a SIDE EFFECT of something that already happened: a coupon was
 * earned, a tier was crossed. The thing that happened is the record; the alert
 * is a notification about it. So every writer here is best-effort and never
 * throws — failing to tell a member about their reward must not fail the stamp
 * that earned it.
 *
 * Copy lives here rather than at the call sites so the same event always reads
 * the same way, wherever it is raised from.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type AlertType =
  | 'reward_earned'
  | 'coupon_ready'
  | 'stamp_awarded'
  | 'binperks_announcement'
  | 'store_message'

/**
 * The icon for each alert type.
 *
 * Lives beside the type union so the two cannot drift: adding a member of
 * AlertType without an icon is a type error, not a silent fallback to a
 * generic bell. Shared by the member drawer and the admin send preview, so an
 * admin composing an announcement sees the glyph a member will actually get.
 */
export const ALERT_GLYPH: Record<AlertType, string> = {
  reward_earned:         '🎉',
  coupon_ready:          '🎉',
  stamp_awarded:         '🏆',
  binperks_announcement: '📢',
  store_message:         '🏪',
}

/** Falls back for a row whose type predates a new member of the union. */
export function alertGlyph(type: string): string {
  return ALERT_GLYPH[type as AlertType] ?? '🔔'
}

interface NewAlert {
  memberId: string
  type: AlertType
  title: string
  body: string
  storeId?: string | null
}

/**
 * Writes one alert. Never throws and never rejects — callers are in the middle
 * of something more important.
 */
export async function createAlert(
  admin: SupabaseClient,
  alert: NewAlert,
): Promise<void> {
  try {
    const { error } = await admin.from('member_alerts').insert({
      member_id:  alert.memberId,
      alert_type: alert.type,
      title:      alert.title,
      body:       alert.body,
      store_id:   alert.storeId ?? null,
      read:       false,
    })
    if (error) console.error('[member-alerts] insert failed:', error)
  } catch (err) {
    console.error('[member-alerts] insert threw:', err)
  }
}

/** A coupon is ready to redeem. */
export function couponReadyAlert(memberId: string, amount: number, storeId?: string | null): NewAlert {
  return {
    memberId,
    type: 'coupon_ready',
    title: 'Reward earned',
    body: `🎉 You earned a $${amount} reward! Show it to any BinPerks cashier to redeem.`,
    storeId,
  }
}

/** The member crossed into a new VIP tier. */
export function tierUpAlert(memberId: string, tier: string, storeId?: string | null): NewAlert {
  // Capitalised for the copy — the stamp route passes 'silver' | 'gold' | 'diamond'.
  const name = tier.charAt(0).toUpperCase() + tier.slice(1)
  return {
    memberId,
    type: 'stamp_awarded',
    title: `${name} VIP`,
    body: `🏆 You reached ${name} VIP! Your rewards just got bigger.`,
    storeId,
  }
}
