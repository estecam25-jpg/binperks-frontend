/**
 * POST /api/merchant/webhook
 *
 * Handles Stripe webhook events for merchant platform subscriptions.
 *
 * Events handled:
 *   checkout.session.completed       → create merchant + store, open DocuSeal signing
 *   customer.subscription.created    → the same (whichever arrives first — see below)
 *   invoice.payment_failed           → start grace period (billing_status: grace_period)
 *   invoice.payment_succeeded        → resume from grace period if applicable
 *   customer.subscription.updated   → detect cancellation scheduling
 *   customer.subscription.deleted   → deactivate merchant, suspend commission eligibility
 *
 * PAYMENT NO LONGER ACTIVATES ANYONE. A paid checkout creates the merchant at
 * billing_status 'pending_signature' with an inactive store; the merchant is
 * activated only once they have signed the Merchant Agreement — see
 * lib/merchant-onboarding and /api/merchant/docuseal-webhook. The old
 * activateMerchant(), which went live on payment, is gone.
 *
 * Idempotency: ALL side effects go through claim_webhook_event() RPC first.
 * Every financial/external effect is independently idempotent:
 *   - merchant creation: unique merchants.stripe_customer_id
 *   - DocuSeal submission: claimed via docuseal_requested_at
 *   - origin_eligibility_history: always safe to insert (no UNIQUE constraint)
 * The GHL activation notice and commission eligibility now belong to
 * activation — lib/merchant-onboarding.activateAfterSignature().
 *
 * Stripe webhook secret: STRIPE_MERCHANT_WEBHOOK_SECRET (live)
 *                        STRIPE_MERCHANT_WEBHOOK_TEST_SECRET (test)
 * Endpoint: https://app.binperks.com/api/merchant/webhook
 */

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { createMerchantAfterPayment, ensureDocusealSubmission } from '@/lib/merchant-onboarding'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' })
const isTest = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test')
const webhookSecret = isTest
  ? process.env.STRIPE_MERCHANT_WEBHOOK_TEST_SECRET
  : process.env.STRIPE_MERCHANT_WEBHOOK_SECRET

// ── helpers ─────────────────────────────────────────────────────────────────

/**
 * Claim a webhook event atomically. Returns true if this worker should process
 * the event, false if it was already processed or is owned by another worker.
 */
async function claimEvent(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  eventId: string,
  eventType: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('claim_webhook_event', {
    p_event_id:      eventId,
    p_event_type:    eventType,
    p_source:        'merchant',
    p_stale_seconds: 300,
  })
  if (error) {
    console.error(`[merchant/webhook] claim_webhook_event error for ${eventId}:`, error)
    return false
  }
  if (data === 'already_completed') {
    console.log(`[merchant/webhook] Skipping duplicate event ${eventId}`)
    return false
  }
  if (data === 'owned_by_other') {
    console.log(`[merchant/webhook] Event ${eventId} owned by another worker — skipping`)
    return false
  }
  return true // 'claimed'
}

async function markCompleted(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  eventId: string,
) {
  await supabase
    .from('processed_webhook_events')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('event_id', eventId)
}

async function markFailed(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  eventId: string,
  details: string,
) {
  await supabase
    .from('processed_webhook_events')
    .update({ status: 'failed', failure_details: details })
    .eq('event_id', eventId)
}

/**
 * Create the merchant for a paid checkout and open their signing session.
 *
 * RUN BY BOTH checkout.session.completed AND customer.subscription.created.
 * Stripe does not promise which arrives first, and this endpoint has gone
 * stretches receiving only one of them — the thank-you page also runs the same
 * step. createMerchantAfterPayment() is idempotent on stripe_customer_id, so
 * whichever gets there first writes the rows and the others find them.
 *
 * A DocuSeal failure is NOT an event failure. The merchant has paid and their
 * row exists; the signing session is opened again on demand by the thank-you
 * page, the signing page and the dashboard, so a DocuSeal hiccup here must not
 * make Stripe retry the whole event.
 */
async function onboardAfterPayment(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  args: Parameters<typeof createMerchantAfterPayment>[1],
): Promise<void> {
  const merchant = await createMerchantAfterPayment(supabase, args)
  if (!merchant) return
  if (merchant.billing_status === 'pending_signature' && !merchant.docuseal_slug) {
    await ensureDocusealSubmission(supabase, merchant.id)
  }
}

// ── route ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig  = req.headers.get('stripe-signature')

  if (!webhookSecret) {
    console.error('[merchant/webhook] Webhook secret not configured')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig!, webhookSecret)
  } catch (err) {
    console.error('[merchant/webhook] Invalid signature:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()

  switch (event.type) {

    // ── Checkout completed → create merchant, open signing ───────────────────
    case 'checkout.session.completed': {
      if (!await claimEvent(supabase, event.id, event.type)) break

      try {
        const session        = event.data.object as Stripe.Checkout.Session
        const customerId     = typeof session.customer === 'string'
          ? session.customer
          : session.customer?.id ?? null
        const subscriptionId = typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id ?? null
        const paid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required'

        // Member VIP checkouts arrive here too; createMerchantAfterPayment
        // ignores anything that is not a merchant signup.
        if (customerId && paid) {
          await onboardAfterPayment(supabase, {
            customerId, subscriptionId, checkoutSessionId: session.id, metadata: session.metadata,
          })
        }
        await markCompleted(supabase, event.id)
      } catch (err) {
        console.error('[merchant/webhook] checkout.session.completed error:', err)
        await markFailed(supabase, event.id, String(err))
      }
      break
    }

    // ── Subscription created → create merchant, open signing ─────────────────
    //
    // Fires for every subscription on the Stripe account, member VIP ones
    // included. Only a paid merchant signup creates anything.
    case 'customer.subscription.created': {
      if (!await claimEvent(supabase, event.id, event.type)) break

      try {
        const subscription = event.data.object as Stripe.Subscription
        const customerId   = typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer.id

        if (subscription.metadata?.type === 'vip_membership') {
          await markCompleted(supabase, event.id)
          break
        }

        // Created before it is paid for (e.g. 'incomplete' while a payment is
        // confirmed) is not a paid merchant yet. checkout.session.completed
        // and the thank-you page will still create them once it is.
        if (subscription.status === 'active' || subscription.status === 'trialing') {
          await onboardAfterPayment(supabase, {
            customerId,
            subscriptionId:    subscription.id,
            checkoutSessionId: null,
            metadata:          subscription.metadata,
          })
        }
        await markCompleted(supabase, event.id)
      } catch (err) {
        console.error('[merchant/webhook] customer.subscription.created error:', err)
        await markFailed(supabase, event.id, String(err))
      }
      break
    }

    // ── Invoice payment failed → start grace period ──────────────────────────
    case 'invoice.payment_failed': {
      if (!await claimEvent(supabase, event.id, event.type)) break

      try {
        const invoice    = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string

        const { data: merchant } = await supabase
          .from('merchants')
          .select('id, billing_status')
          .eq('stripe_customer_id', customerId)
          .single()

        if (!merchant) {
          await markCompleted(supabase, event.id)
          break
        }

        // Only move to grace_period if currently active — don't overwrite billing_suspended
        if (merchant.billing_status === 'active') {
          await supabase
            .from('merchants')
            .update({ billing_status: 'grace_period' })
            .eq('id', merchant.id)

          await supabase.from('origin_eligibility_history').insert({
            merchant_id:         merchant.id,
            event_type:          'grace_period_started',
            triggered_by:        'stripe_webhook',
            reason:              'invoice.payment_failed — 30-day grace period started',
            commission_eligible: true, // still eligible during grace period
            stripe_event_id:     event.id,
          })
        }

        console.log(`[merchant/webhook] Merchant ${merchant.id} payment failed — grace period`)
        await markCompleted(supabase, event.id)
      } catch (err) {
        console.error('[merchant/webhook] invoice.payment_failed error:', err)
        await markFailed(supabase, event.id, String(err))
      }
      break
    }

    // ── Invoice payment succeeded → clear grace period if applicable ──────────
    case 'invoice.payment_succeeded': {
      if (!await claimEvent(supabase, event.id, event.type)) break

      try {
        const invoice    = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string

        const { data: merchant } = await supabase
          .from('merchants')
          .select('id, billing_status')
          .eq('stripe_customer_id', customerId)
          .single()

        if (merchant && merchant.billing_status === 'grace_period') {
          await supabase
            .from('merchants')
            .update({ billing_status: 'active' })
            .eq('id', merchant.id)

          await supabase.from('origin_eligibility_history').insert({
            merchant_id:         merchant.id,
            event_type:          'grace_period_ended',
            triggered_by:        'stripe_webhook',
            reason:              'invoice.payment_succeeded — grace period cleared',
            commission_eligible: true,
            stripe_event_id:     event.id,
          })

          console.log(`[merchant/webhook] Merchant ${merchant.id} grace period cleared`)
        }

        await markCompleted(supabase, event.id)
      } catch (err) {
        console.error('[merchant/webhook] invoice.payment_succeeded error:', err)
        await markFailed(supabase, event.id, String(err))
      }
      break
    }

    // ── Subscription cancelled → deactivate, suspend commission eligibility ───
    case 'customer.subscription.deleted': {
      if (!await claimEvent(supabase, event.id, event.type)) break

      try {
        const subscription = event.data.object as Stripe.Subscription
        const customerId   = subscription.customer as string

        const { data: merchant } = await supabase
          .from('merchants')
          .select('id, commission_eligible')
          .eq('stripe_customer_id', customerId)
          .single()

        if (!merchant) {
          await markCompleted(supabase, event.id)
          break
        }

        const now = new Date().toISOString()

        // Deactivate merchant — data is NEVER deleted
        await supabase
          .from('merchants')
          .update({
            subscription_status:          'cancelled',
            billing_status:               'inactive',
            commission_eligible:          false,
            commission_suspended_at:      now,
            commission_suspension_reason: 'Merchant-initiated cancellation confirmed by Stripe',
            last_deactivated_at:          now,
          })
          .eq('id', merchant.id)

        // enrollment_enabled stays true per CLAUDE.md rules — NOT set here
        await supabase
          .from('stores')
          .update({ is_active: false })
          .eq('merchant_id', merchant.id)

        // Write eligibility history
        if (merchant.commission_eligible) {
          await supabase.from('origin_eligibility_history').insert({
            merchant_id:         merchant.id,
            event_type:          'cancelled',
            triggered_by:        'stripe_webhook',
            reason:              'customer.subscription.deleted — commission eligibility suspended',
            commission_eligible: false,
            stripe_event_id:     event.id,
          })
        }

        console.log(`[merchant/webhook] Merchant ${merchant.id} cancelled — deactivated`)
        await markCompleted(supabase, event.id)
      } catch (err) {
        console.error('[merchant/webhook] customer.subscription.deleted error:', err)
        await markFailed(supabase, event.id, String(err))
      }
      break
    }

    default:
      console.log(`[merchant/webhook] Unhandled event type: ${event.type}`)
  }

  return NextResponse.json({ received: true })
}
