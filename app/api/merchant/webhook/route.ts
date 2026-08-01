/**
 * POST /api/merchant/webhook
 *
 * Handles Stripe webhook events for merchant platform subscriptions.
 *
 * Events handled:
 *   checkout.session.completed       → activate merchant, create Subscription Schedule,
 *                                       set commission_eligible, fire GHL onboarding
 *   invoice.payment_failed           → start grace period (billing_status: grace_period)
 *   invoice.payment_succeeded        → resume from grace period if applicable
 *   customer.subscription.updated   → detect cancellation scheduling
 *   customer.subscription.deleted   → deactivate merchant, suspend commission eligibility
 *
 * Idempotency: ALL side effects go through claim_webhook_event() RPC first.
 * Every financial/external effect is independently idempotent:
 *   - Subscription Schedule: check stripe_subscription_schedule_id IS NULL first
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
        const session      = event.data.object as Stripe.Checkout.Session
        const merchantId   = session.metadata?.merchantId
        const locationCount = Number(session.metadata?.locationCount ?? 1)
        const subscriptionId = session.subscription as string | null

        if (!merchantId || !subscriptionId) {
          await markCompleted(supabase, event.id)
          break
        }

        // ── 1. Retrieve subscription ─────────────────────────────────────────
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        const nextBillingDate = new Date(subscription.current_period_end * 1000).toISOString()

        // ── 2. Activate merchant (idempotent — UPDATE is safe to repeat) ─────
        await supabase
          .from('merchants')
          .update({
            subscription_status:        'active',
            billing_status:             'active',
            location_count:             locationCount,
            implementation_fee_paid:    true,
            implementation_fee_paid_at: new Date().toISOString(),
          })
          .eq('id', merchantId)

        // ── 3. Activate stores ───────────────────────────────────────────────
        await supabase
          .from('stores')
          .update({ is_active: true })
          .eq('merchant_id', merchantId)

        // ── 4. Subscription Schedule (idempotent: only if not already created)
        const { data: merchantRow } = await supabase
          .from('merchants')
          .select('stripe_subscription_schedule_id, owner_email, company_name, commission_eligible, ghl_onboarding_sent_at')
          .eq('id', merchantId)
          .single()

        if (!merchantRow?.stripe_subscription_schedule_id) {
          try {
            const PLATFORM_PRICE_ID = isTest
              ? process.env.STRIPE_PRICE_PLATFORM_TEST
              : process.env.STRIPE_PRICE_PLATFORM

            const schedule = await stripe.subscriptionSchedules.create(
              {
                from_subscription: subscriptionId,
                end_behavior: 'release',
                phases: [
                  {
                    // Phase 1: current billing cycle (Implementation fee already paid)
                    items: subscription.items.data.map(item => ({
                      price:    item.price.id,
                      quantity: item.quantity ?? 1,
                    })),
                    end_date: subscription.current_period_end,
                  },
                  {
                    // Phase 2: ongoing at $99/month + additional locations
                    items: [
                      { price: PLATFORM_PRICE_ID!, quantity: 1 },
                      // Additional location prices are carried over from original subscription
                      ...subscription.items.data
                        .filter(item => item.price.id !== (isTest
                          ? process.env.STRIPE_PRICE_IMPLEMENTATION_TEST
                          : process.env.STRIPE_PRICE_IMPLEMENTATION))
                        .filter(item => item.price.id !== PLATFORM_PRICE_ID)
                        .map(item => ({ price: item.price.id, quantity: item.quantity ?? 1 })),
                    ],
                  },
                ],
              },
              { idempotencyKey: `schedule_${subscriptionId}` },
            )

            await supabase
              .from('merchants')
              .update({ stripe_subscription_schedule_id: schedule.id })
              .eq('id', merchantId)

            console.log(`[merchant/webhook] Subscription Schedule created: ${schedule.id}`)
          } catch (schedErr) {
            // Non-fatal: log but don't fail the webhook — schedule can be created manually
            console.error(`[merchant/webhook] Subscription Schedule creation failed for ${merchantId}:`, schedErr)
          }
        }

        // ── 5. commission_eligible (idempotent: only if not already set) ──────
        if (!merchantRow?.commission_eligible) {
          const now = new Date().toISOString()

          await supabase
            .from('merchants')
            .update({
              commission_eligible:      true,
              commission_eligible_from: now,
            })
            .eq('id', merchantId)

          // Write history record
          await supabase.from('origin_eligibility_history').insert({
            merchant_id:         merchantId,
            event_type:          'activated',
            effective_at:        now,
            triggered_by:        'stripe_webhook',
            reason:              'checkout.session.completed — merchant activated',
            commission_eligible: true,
            stripe_event_id:     event.id,
          })
        }

        // ── 6. GHL onboarding (idempotent: only if not already sent) ──────────
        if (!merchantRow?.ghl_onboarding_sent_at) {
          const ghlWebhook = process.env.GHL_MERCHANT_ACTIVATED_WEBHOOK_URL
          if (ghlWebhook) {
            try {
              await fetch(ghlWebhook, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  merchantId,
                  merchantEmail: merchantRow?.owner_email ?? '',
                  companyName:   merchantRow?.company_name ?? '',
                  subscriptionId,
                  locationCount,
                  nextBillingDate,
                }),
              })
              await supabase
                .from('merchants')
                .update({ ghl_onboarding_sent_at: new Date().toISOString() })
                .eq('id', merchantId)
            } catch (ghlErr) {
              console.error('[merchant/webhook] GHL onboarding webhook error:', ghlErr)
              // Non-fatal — GHL failure doesn't fail the Stripe webhook
            }
          }
        }

        console.log(`[merchant/webhook] Merchant ${merchantId} activated`)
        await markCompleted(supabase, event.id)
      } catch (err) {
        console.error('[merchant/webhook] checkout.session.completed error:', err)
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
