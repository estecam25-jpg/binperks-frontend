/**
 * POST /api/merchant/webhook
 *
 * Handles Stripe webhook events for merchant platform subscriptions.
 *
 * Events handled:
 *   checkout.session.completed       → activateMerchant()
 *   customer.subscription.created    → activateMerchant()  (same function — see below)
 *   invoice.payment_failed           → start grace period (billing_status: grace_period)
 *   invoice.payment_succeeded        → resume from grace period if applicable
 *   customer.subscription.updated   → detect cancellation scheduling
 *   customer.subscription.deleted   → deactivate merchant, suspend commission eligibility
 *
 * Idempotency: ALL side effects go through claim_webhook_event() RPC first.
 * Every financial/external effect is independently idempotent:
 *   - GHL onboarding call: check ghl_onboarding_sent_at IS NULL first
 *   - commission_eligible write: check column before setting
 *   - origin_eligibility_history: always safe to insert (no UNIQUE constraint)
 *
 * Stripe webhook secret: STRIPE_MERCHANT_WEBHOOK_SECRET (live)
 *                        STRIPE_MERCHANT_WEBHOOK_TEST_SECRET (test)
 * Endpoint: https://app.binperks.com/api/merchant/webhook
 */

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { postToGhl } from '@/lib/ghl-webhook'

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
 * Activate a merchant once Stripe has a paid subscription for them.
 *
 * CALLED FROM TWO EVENTS, on purpose. checkout.session.completed was the only
 * activation path, and the live Stripe endpoint for this URL has never
 * delivered it — processed_webhook_events holds no checkout.session.completed
 * row from any date. customer.subscription.created IS delivered, so a merchant
 * who paid sat at subscription_status='pending' with an inactive store and no
 * welcome. Both events now run this one function, so whichever arrives does the
 * whole job and the two can never drift into half-activating a merchant.
 *
 * SAFE WHEN BOTH ARRIVE, including at the same moment. claim_webhook_event()
 * dedupes by event id, and these are two different events, so the one-time
 * side effects are guarded on the merchant row itself with conditional UPDATEs
 * — Postgres re-checks the WHERE after taking the row lock, so only one caller
 * can win each of them:
 *   - the eligibility history row (written only when this call flipped it)
 *   - the GHL welcome             (claimed before sending; released on failure)
 *   - implementation_fee_paid_at  (stamped once, never rewritten)
 *
 * The subscription is retrieved from the API rather than read off the event:
 * event payloads use the endpoint's API version (2025-05-28.basil, where
 * current_period_end moved onto subscription items), while this client is
 * pinned to 2025-02-24.acacia.
 */
async function activateMerchant(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  args: { merchantId: string; subscriptionId: string; eventId: string; eventType: string },
): Promise<void> {
  const { merchantId, subscriptionId, eventId, eventType } = args

  const subscription = await stripe.subscriptions.retrieve(subscriptionId)

  // A subscription can exist before it is paid for (e.g. 'incomplete' while a
  // payment still needs confirming). Activation follows payment, not creation.
  if (subscription.status !== 'active' && subscription.status !== 'trialing') {
    console.warn(`[merchant/webhook] ${eventType}: subscription ${subscriptionId} is '${subscription.status}' — merchant ${merchantId} not activated`)
    return
  }

  const nextBillingDate = new Date(subscription.current_period_end * 1000).toISOString()
  const locationCount   = Math.max(1, Number(subscription.metadata?.locationCount ?? 1) || 1)
  const now             = new Date().toISOString()

  // ── 1. Merchant + billing state (plain UPDATE — safe to repeat) ─────────────
  await supabase
    .from('merchants')
    .update({
      subscription_status: 'active',
      billing_status:      'active',
      location_count:      locationCount,
    })
    .eq('id', merchantId)

  // Setup fee stamp: first activation only, so a second event cannot move it.
  await supabase
    .from('merchants')
    .update({ implementation_fee_paid: true, implementation_fee_paid_at: now })
    .eq('id', merchantId)
    .not('implementation_fee_paid', 'is', true)

  // ── 2. Stores ─────────────────────────────────────────────────────────────
  await supabase
    .from('stores')
    .update({ is_active: true })
    .eq('merchant_id', merchantId)

  // ── 3. Commission eligibility ───────────────────────────────────────────────
  //
  // Claimed atomically: only the call that actually changes the row writes the
  // history record. Also catches a merchant flagged eligible by hand with no
  // commission_eligible_from and no history, which is how a stuck merchant can
  // look after someone patches the row directly.
  //
  // Never over an admin suspension — a new subscription is not an admin's
  // decision to lift one (CLAUDE.md: administrative suspension).
  const { data: flipped } = await supabase
    .from('merchants')
    .update({ commission_eligible: true, commission_eligible_from: now })
    .eq('id', merchantId)
    .not('admin_suspended', 'is', true)
    .or('commission_eligible.is.null,commission_eligible.eq.false,commission_eligible_from.is.null')
    .select('id')

  if (flipped && flipped.length > 0) {
    await supabase.from('origin_eligibility_history').insert({
      merchant_id:         merchantId,
      event_type:          'activated',
      effective_at:        now,
      triggered_by:        'stripe_webhook',
      reason:              `${eventType} — merchant activated after payment`,
      commission_eligible: true,
      stripe_event_id:     eventId,
    })
  }

  // ── 4. GHL welcome / onboarding ────────────────────────────────────────────
  //
  // GHL_MERCHANT_ONBOARDING_WEBHOOK_URL is honoured if it is ever added, but it
  // does not exist in Vercel today — the post-payment workflow is wired to
  // GHL_MERCHANT_ACTIVATED_WEBHOOK_URL ("BinPerks Merchant Activation", the same
  // hook the admin Activate action uses). Reading only the new name would have
  // silently sent nothing.
  const ghlWebhook = process.env.GHL_MERCHANT_ONBOARDING_WEBHOOK_URL
    || process.env.GHL_MERCHANT_ACTIVATED_WEBHOOK_URL

  if (ghlWebhook) {
    // Claim first so two events cannot both send the welcome.
    const { data: claimed } = await supabase
      .from('merchants')
      .update({ ghl_onboarding_sent_at: now })
      .eq('id', merchantId)
      .is('ghl_onboarding_sent_at', null)
      .select('owner_email, company_name')

    if (claimed && claimed.length > 0) {
      // postToGhl is bounded and never throws, so a hung GHL cannot hold the
      // webhook open until Vercel kills it and Stripe retries the whole event.
      const delivered = await postToGhl(ghlWebhook, {
        merchantId,
        merchantEmail: claimed[0].owner_email ?? '',
        companyName:   claimed[0].company_name ?? '',
        subscriptionId,
        locationCount,
        nextBillingDate,
      }, `merchant/webhook ${eventType}`)

      // Release the claim on failure so the other activation event, or a
      // resend from the Stripe dashboard, gets another go.
      if (!delivered) {
        await supabase
          .from('merchants')
          .update({ ghl_onboarding_sent_at: null })
          .eq('id', merchantId)
          .eq('ghl_onboarding_sent_at', now)
      }
    }
  } else {
    console.warn('[merchant/webhook] No GHL merchant onboarding webhook URL configured — welcome not sent')
  }

  console.log(`[merchant/webhook] Merchant ${merchantId} activated via ${eventType} (sub=${subscriptionId}, status=${subscription.status})`)
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

    // ── Checkout completed → activate merchant ───────────────────────────────
    case 'checkout.session.completed': {
      if (!await claimEvent(supabase, event.id, event.type)) break

      try {
        const session        = event.data.object as Stripe.Checkout.Session
        const merchantId     = session.metadata?.merchantId
        const subscriptionId = typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id ?? null

        // Member VIP checkouts arrive here too; they carry no merchantId.
        if (merchantId && subscriptionId) {
          await activateMerchant(supabase, { merchantId, subscriptionId, eventId: event.id, eventType: event.type })
        }
        await markCompleted(supabase, event.id)
      } catch (err) {
        console.error('[merchant/webhook] checkout.session.completed error:', err)
        await markFailed(supabase, event.id, String(err))
      }
      break
    }

    // ── Subscription created → activate merchant ─────────────────────────────
    //
    // The event this endpoint actually receives when a merchant pays. Every
    // subscription on the Stripe account fires it — member VIP ones included —
    // so anything that does not resolve to a merchant is ignored.
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

        // By Stripe customer first. /api/merchant/apply creates one customer per
        // application and stores it on the merchant row, so this is exact.
        const { data: byCustomer } = await supabase
          .from('merchants')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .maybeSingle()

        // Fallback: the merchantId apply puts in subscription_data.metadata.
        let merchantId = byCustomer?.id as string | undefined
        if (!merchantId && subscription.metadata?.merchantId) {
          const { data: byMeta } = await supabase
            .from('merchants')
            .select('id')
            .eq('id', subscription.metadata.merchantId)
            .maybeSingle()
          merchantId = byMeta?.id as string | undefined
        }

        if (!merchantId) {
          console.log(`[merchant/webhook] customer.subscription.created: no merchant for customer ${customerId} — ignored`)
          await markCompleted(supabase, event.id)
          break
        }

        await activateMerchant(supabase, {
          merchantId, subscriptionId: subscription.id, eventId: event.id, eventType: event.type,
        })
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
