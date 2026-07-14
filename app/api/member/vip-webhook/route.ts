/**
 * POST /api/member/vip-webhook
 *
 * Stripe webhook for member VIP subscriptions (separate endpoint from the
 * merchant subscription webhook at /api/merchant/webhook — different
 * product, different signing secret).
 *
 * Configure in Stripe dashboard:
 *   Endpoint: https://app.binperks.com/api/member/vip-webhook
 *   Events:   checkout.session.completed, invoice.payment_failed,
 *             customer.subscription.deleted
 *   Secret:   STRIPE_MEMBER_WEBHOOK_SECRET
 *
 * members has no Stripe columns (only subscription_status, vip_billing_cycle,
 * vip_annual_start) — we never store a customer/subscription ID. Instead the
 * memberId travels in Stripe metadata: top-level session metadata for
 * checkout.session.completed, and subscription metadata (which Stripe copies
 * from subscription_data.metadata at creation) for the later invoice/cancel
 * events, which arrive with a Subscription object, not a Session.
 *
 * Rules enforced here:
 *   - 30-day grace period on payment failure — do NOT downgrade immediately
 *   - Member keeps ALL stamps during grace period and after downgrade
 *   - No stamp expiration, ever
 */

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' })
const webhookSecret = process.env.STRIPE_MEMBER_WEBHOOK_SECRET

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!webhookSecret) {
    console.error('[/api/member/vip-webhook] STRIPE_MEMBER_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig!, webhookSecret)
  } catch (err) {
    console.error('[/api/member/vip-webhook] Invalid signature:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Stripe calls this endpoint with no session cookie, so we must use the
  // admin client (service role) to bypass RLS. The Stripe signature above
  // is the authentication for all writes below.
  const supabase = createAdminSupabaseClient()

  switch (event.type) {

    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.metadata?.type !== 'vip_membership') break

      const memberId = session.metadata?.memberId
      if (!memberId) break

      await supabase
        .from('members')
        .update({
          subscription_status: 'vip',
          vip_billing_cycle:    'monthly',
        })
        .eq('id', memberId)

      console.log(`[member/vip-webhook] Member ${memberId} upgraded to VIP`)
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const subscriptionId = invoice.subscription as string | null
      if (!subscriptionId) break

      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      if (subscription.metadata?.type !== 'vip_membership') break
      const memberId = subscription.metadata?.memberId
      if (!memberId) break

      // 30-day grace period — member keeps VIP status and ALL stamps.
      // TODO: GHL sends a payment-failure warning SMS (respecting sms_opt_in).
      console.log(`[member/vip-webhook] Member ${memberId} payment failed — 30-day grace period started`)
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      if (subscription.metadata?.type !== 'vip_membership') break
      const memberId = subscription.metadata?.memberId
      if (!memberId) break

      // Downgrade to Free — stamps and coupon history are never touched.
      await supabase
        .from('members')
        .update({
          subscription_status: 'free',
          vip_billing_cycle:    null,
        })
        .eq('id', memberId)

      console.log(`[member/vip-webhook] Member ${memberId} downgraded to Free`)
      break
    }

    default:
      console.log(`[member/vip-webhook] Unhandled event type: ${event.type}`)
  }

  return NextResponse.json({ received: true })
}
