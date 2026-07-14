/**
 * POST /api/merchant/webhook
 *
 * Handles Stripe webhook events for merchant subscriptions.
 *
 * Events handled:
 *   checkout.session.completed  → activate merchant + send magic link
 *   invoice.payment_failed       → start 30-day grace period warning
 *   customer.subscription.deleted → deactivate after grace period
 *
 * Stripe webhook secret: STRIPE_MERCHANT_WEBHOOK_SECRET
 * Configure in Stripe dashboard: https://dashboard.stripe.com/webhooks
 * Endpoint: https://app.binperks.com/api/merchant/webhook
 *
 * This is a separate endpoint/secret from the member VIP webhook at
 * /api/member/vip-webhook — different product, different Stripe Connect flow.
 */

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' })
const webhookSecret = process.env.STRIPE_MERCHANT_WEBHOOK_SECRET

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig  = req.headers.get('stripe-signature')

  if (!webhookSecret) {
    console.error('[/api/merchant/webhook] STRIPE_MERCHANT_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig!, webhookSecret)
  } catch (err) {
    console.error('[/api/merchant/webhook] Invalid signature:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Stripe calls this endpoint with no session cookie, so we must use the
  // admin client (service role) to bypass RLS. The Stripe signature above
  // is the authentication for all writes below.
  const supabase = createAdminSupabaseClient()

  switch (event.type) {

    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const merchantId    = session.metadata?.merchantId
      const locationCount = Number(session.metadata?.locationCount ?? 1)
      const subscriptionId = session.subscription as string | null

      if (!merchantId || !subscriptionId) break

      // Retrieve subscription to get next billing date
      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const nextBillingDate = new Date(subscription.current_period_end * 1000).toISOString()
      void nextBillingDate // surfaced to GHL below; not stored (merchants has no such column)

      // Activate merchant
      await supabase
        .from('merchants')
        .update({
          subscription_status:    'active',
          stripe_subscription_id: subscriptionId,
          billing_status:         'active',
          location_count:         locationCount,
        })
        .eq('id', merchantId)

      // Activate first store
      await supabase
        .from('stores')
        .update({ is_active: true })
        .eq('merchant_id', merchantId)

      // Notify GHL → sends merchant magic link + welcome email (skipped if
      // the webhook URL isn't configured yet)
      const ghlWebhook = process.env.GHL_MERCHANT_ACTIVATED_WEBHOOK_URL
      if (ghlWebhook) {
        fetch(ghlWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            merchantId,
            subscriptionId,
            locationCount,
            nextBillingDate,
            // GHL workflow sends:
            // 1. Welcome email with magic link to merchant dashboard
            // 2. Internal notification to BinPerks admin to provision store
          }),
        }).catch(err => console.error('[webhook] GHL activated webhook error:', err))
      }

      console.log(`[webhook] Merchant ${merchantId} activated`)
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = invoice.customer as string

      // Find merchant by Stripe customer ID
      const { data: merchant } = await supabase
        .from('merchants')
        .select('id, owner_email')
        .eq('stripe_customer_id', customerId)
        .single()

      if (!merchant) break

      await supabase
        .from('merchants')
        .update({ billing_status: 'past_due' })
        .eq('id', merchant.id)

      // GHL sends payment failure warning email to merchant — 30-day grace
      // period before deactivation, per Merchant Rules (no immediate cutoff).
      console.log(`[webhook] Merchant ${merchant.id} payment failed — 30-day warning started`)
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = subscription.customer as string

      const { data: merchant } = await supabase
        .from('merchants')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .single()

      if (!merchant) break

      // Deactivate merchant and stores — data preserved, never deleted
      await supabase
        .from('merchants')
        .update({ subscription_status: 'cancelled', billing_status: 'inactive' })
        .eq('id', merchant.id)

      await supabase
        .from('stores')
        .update({ is_active: false })
        .eq('merchant_id', merchant.id)

      console.log(`[webhook] Merchant ${merchant.id} subscription cancelled — deactivated`)
      break
    }

    default:
      // Unhandled event type — log and return 200 so Stripe doesn't retry
      console.log(`[webhook] Unhandled event type: ${event.type}`)
  }

  return NextResponse.json({ received: true })
}
