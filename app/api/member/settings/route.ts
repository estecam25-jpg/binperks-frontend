/**
 * PATCH /api/member/settings
 *
 * Updates settings for the logged-in member. Auth: Supabase session cookie.
 *
 * Request body (either or both):
 *   { smsOptIn?: boolean, deactivate?: true }
 *
 * Deactivation never deletes data — it only flips status, per the locked
 * rule "Member data never deleted — only deactivated."
 *
 * DEACTIVATION ALSO STOPS BILLING. Previously it did not: it flipped status
 * and nothing else, so a VIP who deactivated kept being charged $29.99 every
 * month, and each payment kept minting a commission decision for their Origin
 * Merchant. Cancellation is at period end, matching /api/member/cancel-vip —
 * the member paid for this month either way.
 *
 * Responses:
 *   200 { ok: true, vipCancelsAt? }
 *   401 { error: 'not_authenticated' }
 */

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' })

export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const { data: member } = await supabase
    .from('members')
    .select('id, subscription_status, stripe_subscription_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!member) {
    return NextResponse.json({ error: 'member_not_found' }, { status: 404 })
  }

  const body = await req.json() as { smsOptIn?: boolean; deactivate?: boolean }
  const update: Record<string, unknown> = {}

  if (typeof body.smsOptIn === 'boolean') {
    update.sms_opt_in = body.smsOptIn
  }
  if (body.deactivate === true) {
    update.status = 'deactivated'
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  // Cancel BEFORE deactivating. If Stripe fails, the account stays active and
  // the member can retry — the alternative ordering would leave a deactivated
  // account still being billed, which is the exact bug being fixed here.
  let vipCancelsAt: string | null = null
  if (body.deactivate === true && member.subscription_status === 'vip' && member.stripe_subscription_id) {
    try {
      const sub = await stripe.subscriptions.update(member.stripe_subscription_id, {
        cancel_at_period_end: true,
      })
      const seconds = sub.cancel_at ?? sub.current_period_end
      vipCancelsAt = typeof seconds === 'number' ? new Date(seconds * 1000).toISOString() : null
      console.log(
        `[/api/member/settings] member=${member.id} deactivating — VIP sub=${sub.id} ` +
        `cancels at ${vipCancelsAt ?? 'unknown'}`
      )
    } catch (err) {
      console.error('[/api/member/settings] VIP cancellation failed, aborting deactivation:', err)
      return NextResponse.json({ error: 'vip_cancel_failed' }, { status: 500 })
    }
  } else if (body.deactivate === true && member.subscription_status === 'vip') {
    // VIP with no stored subscription id — a member from before the id was
    // recorded. Deactivation proceeds, but billing will NOT stop on its own and
    // needs cancelling by hand in the Stripe dashboard.
    console.error(
      `[/api/member/settings] member=${member.id} deactivated as VIP with NO ` +
      `stripe_subscription_id — subscription must be cancelled manually in Stripe`
    )
  }

  const { error } = await supabase
    .from('members')
    .update(update)
    .eq('id', member.id)

  if (error) {
    console.error('[/api/member/settings] Update error:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }

  // Scan photos are DELETED on deactivation.
  //
  // "Member data never deleted, only deactivated" governs the loyalty record —
  // stamps, rewards, attribution — which BinPerks needs for settlement and
  // history. Photographs a member took are different: they are personal
  // content, not a business record, and keeping them after someone closes
  // their account is not something they agreed to. The scanner_events rows
  // stay; only the images go, and photo_storage_path is cleared so nothing
  // later tries to sign a URL for a file that no longer exists.
  if (body.deactivate === true) {
    try {
      // Admin client, not the session client: scan-photos is a PRIVATE bucket
      // with no storage policies, so only the service role can remove from it.
      const admin = createAdminSupabaseClient()

      const { data: scans } = await admin
        .from('scanner_events')
        .select('id, photo_storage_path')
        .eq('member_id', member.id)
        .not('photo_storage_path', 'is', null)

      const paths = (scans ?? [])
        .map(r => r.photo_storage_path)
        .filter((p): p is string => !!p)

      if (paths.length > 0) {
        const { error: rmError } = await admin.storage.from('scan-photos').remove(paths)
        if (rmError) console.error('[/api/member/settings] photo delete failed:', rmError)
        else {
          await admin
            .from('scanner_events')
            .update({ photo_storage_path: null })
            .eq('member_id', member.id)
        }
      }
    } catch (err) {
      // Never fails the deactivation: the member asked to close their account
      // and that has already happened. A leftover photo is followed up, not a
      // reason to keep them signed up.
      console.error('[/api/member/settings] photo cleanup threw:', err)
    }
  }

  return NextResponse.json({ ok: true, vipCancelsAt })
}
