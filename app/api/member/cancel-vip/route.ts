/**
 * /api/member/cancel-vip — member-authenticated.
 *
 * GET   current VIP subscription state (renewal date, cancellation pending)
 * POST  schedule cancellation at the end of the current billing period
 *
 * CANCELLATION IS AT PERIOD END, never immediate. The member has paid for the
 * current month and keeps VIP — the tier, the multiplier, the coupon value —
 * until it runs out. This route therefore does NOT change subscription_status.
 * Stripe fires customer.subscription.deleted when the period actually ends and
 * /api/member/vip-webhook does the downgrade there, so status changes in
 * exactly one place no matter who initiated the cancellation.
 *
 * Stamps and coupon history are never touched by any of this.
 *
 * Responses (GET):
 *   200 { vip, cancelAtPeriodEnd, currentPeriodEnd, cancelsAt }
 *   401 { error: 'not_authenticated' }
 *   404 { error: 'member_not_found' }
 * Responses (POST):
 *   200 { ok: true, cancelsAt }
 *   400 { error: 'no_active_subscription' }
 *   401 { error: 'not_authenticated' }
 *   404 { error: 'member_not_found' }
 *   500 { error: 'cancel_failed' }
 */

import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' })

/** Unix seconds → ISO, or null. Stripe omits cancel_at until a cancellation is
 *  scheduled, so callers fall back to current_period_end. */
function toIso(seconds: number | null | undefined): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null
  return new Date(seconds * 1000).toISOString()
}

/** Resolves the signed-in member. Server client for identity, admin client for
 *  the row (CLAUDE.md CRITICAL RLS RULE). */
async function currentMember() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_authenticated' as const }

  const admin = createAdminSupabaseClient()
  const { data: member } = await admin
    .from('members')
    .select('id, subscription_status, stripe_subscription_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!member) return { error: 'member_not_found' as const }
  return { member, admin }
}

export async function GET() {
  const ctx = await currentMember()
  if ('error' in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.error === 'not_authenticated' ? 401 : 404 })
  }
  const { member } = ctx

  if (member.subscription_status !== 'vip' || !member.stripe_subscription_id) {
    return NextResponse.json({
      vip: member.subscription_status === 'vip',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      cancelsAt: null,
      // True for a VIP with no stored subscription id — pre-fix members whose
      // id could not be backfilled. They cannot self-cancel; support must.
      unmanageable: member.subscription_status === 'vip',
    })
  }

  try {
    const sub = await stripe.subscriptions.retrieve(member.stripe_subscription_id)
    return NextResponse.json({
      vip: true,
      cancelAtPeriodEnd: sub.cancel_at_period_end === true,
      currentPeriodEnd:  toIso(sub.current_period_end),
      cancelsAt:         toIso(sub.cancel_at) ?? (sub.cancel_at_period_end ? toIso(sub.current_period_end) : null),
      unmanageable: false,
    })
  } catch (err) {
    // A subscription that no longer exists at Stripe shouldn't break Settings.
    console.error('[member/cancel-vip] retrieve failed:', err)
    return NextResponse.json({
      vip: true, cancelAtPeriodEnd: false, currentPeriodEnd: null,
      cancelsAt: null, unmanageable: true,
    })
  }
}

export async function POST() {
  const ctx = await currentMember()
  if ('error' in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.error === 'not_authenticated' ? 401 : 404 })
  }
  const { member } = ctx

  if (member.subscription_status !== 'vip' || !member.stripe_subscription_id) {
    return NextResponse.json({ error: 'no_active_subscription' }, { status: 400 })
  }

  try {
    // Idempotent by nature: setting cancel_at_period_end on an already-
    // cancelling subscription is a no-op that returns the same schedule, so a
    // double tap cannot cancel "twice" or bring the date forward.
    const sub = await stripe.subscriptions.update(member.stripe_subscription_id, {
      cancel_at_period_end: true,
    })

    const cancelsAt = toIso(sub.cancel_at) ?? toIso(sub.current_period_end)

    console.log(
      `[member/cancel-vip] member=${member.id} sub=${sub.id} ` +
      `scheduled cancellation at ${cancelsAt ?? 'unknown'}`
    )

    // Deliberately no members update here — see the header. The member keeps
    // VIP until Stripe says the period ended.
    return NextResponse.json({ ok: true, cancelsAt })
  } catch (err) {
    console.error('[member/cancel-vip] Stripe error:', err)
    return NextResponse.json({ error: 'cancel_failed' }, { status: 500 })
  }
}
