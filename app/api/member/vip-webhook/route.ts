/**
 * POST /api/member/vip-webhook
 *
 * Stripe webhook for member VIP subscriptions (separate endpoint from the
 * merchant subscription webhook at /api/merchant/webhook — different
 * product, different signing secret).
 *
 * Configure in Stripe dashboard:
 *   Endpoint: https://app.binperks.com/api/member/vip-webhook
 *   Events:   checkout.session.completed, customer.subscription.created,
 *             customer.subscription.updated, customer.subscription.deleted,
 *             invoice.payment_failed, invoice.payment_succeeded
 *   Secret:   STRIPE_MEMBER_WEBHOOK_SECRET
 *
 * members has no Stripe columns (only subscription_status, vip_billing_cycle,
 * vip_annual_start) — we never store a customer/subscription ID. Instead the
 * memberId travels in Stripe metadata: top-level session metadata for
 * checkout.session.completed, and subscription metadata (which Stripe copies
 * from subscription_data.metadata at creation) for the later invoice/cancel
 * events, which arrive with a Subscription object, not a Session.
 *
 * V3 commission decisions:
 *   - invoice.payment_succeeded creates an immutable commission_decisions row
 *     keyed on the Stripe invoice ID (UNIQUE membership_payment_id).
 *   - At payment time, origin_merchant commission_eligible is read — this
 *     decision is recorded and NEVER recalculated later.
 *   - A matching settlement_ledger entry is created immediately.
 *
 * Rules enforced here:
 *   - 30-day grace period on payment failure — do NOT downgrade immediately
 *   - Member keeps ALL stamps during grace period and after downgrade
 *   - No stamp expiration, ever
 *   - Commission decisions are immutable at payment time
 */

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' })
const webhookSecret = process.env.STRIPE_MEMBER_WEBHOOK_SECRET

// ── helpers ─────────────────────────────────────────────────────────────────

type SupabaseAdmin = ReturnType<typeof createAdminSupabaseClient>

async function claimEvent(
  supabase: SupabaseAdmin,
  eventId: string,
  eventType: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('claim_webhook_event', {
    p_event_id:      eventId,
    p_event_type:    eventType,
    p_source:        'member_vip',
    p_stale_seconds: 300,
  })
  if (error) {
    console.error(`[member/vip-webhook] claim_webhook_event error for ${eventId}:`, error)
    return false
  }
  if (data === 'already_completed') {
    console.log(`[member/vip-webhook] Skipping duplicate event ${eventId}`)
    return false
  }
  if (data === 'owned_by_other') {
    console.log(`[member/vip-webhook] Event ${eventId} owned by another worker — skipping`)
    return false
  }
  return true
}

async function markCompleted(supabase: SupabaseAdmin, eventId: string) {
  await supabase
    .from('processed_webhook_events')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('event_id', eventId)
}

async function markFailed(supabase: SupabaseAdmin, eventId: string, details: string) {
  await supabase
    .from('processed_webhook_events')
    .update({ status: 'failed', failure_details: details })
    .eq('event_id', eventId)
}

/**
 * Settlement period key: "YYYY-MM" of the payment date.
 */
function settlementPeriod(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

// ── route ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig  = req.headers.get('stripe-signature')

  if (!webhookSecret) {
    console.error('[member/vip-webhook] STRIPE_MEMBER_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig!, webhookSecret)
  } catch (err) {
    console.error('[member/vip-webhook] Invalid signature:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()

  switch (event.type) {

    // ── Checkout completed → upgrade member ──────────────────────────────────
    case 'checkout.session.completed': {
      if (!await claimEvent(supabase, event.id, event.type)) break

      try {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.metadata?.type !== 'vip_membership') {
          await markCompleted(supabase, event.id)
          break
        }

        const memberId = session.metadata?.memberId
        if (!memberId) {
          await markCompleted(supabase, event.id)
          break
        }

        await supabase
          .from('members')
          .update({ subscription_status: 'vip', vip_billing_cycle: 'monthly' })
          .eq('id', memberId)

        console.log(`[member/vip-webhook] Member ${memberId} upgraded to VIP via checkout`)
        await markCompleted(supabase, event.id)
      } catch (err) {
        console.error('[member/vip-webhook] checkout.session.completed error:', err)
        await markFailed(supabase, event.id, String(err))
      }
      break
    }

    // ── Subscription created/updated → ensure VIP status ────────────────────
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      if (!await claimEvent(supabase, event.id, event.type)) break

      try {
        const subscription = event.data.object as Stripe.Subscription
        if (subscription.metadata?.type !== 'vip_membership') {
          await markCompleted(supabase, event.id)
          break
        }
        const memberId = subscription.metadata?.memberId
        if (!memberId || subscription.status !== 'active') {
          await markCompleted(supabase, event.id)
          break
        }

        await supabase
          .from('members')
          .update({ subscription_status: 'vip', vip_billing_cycle: 'monthly' })
          .eq('id', memberId)

        console.log(`[member/vip-webhook] Member ${memberId} set to VIP via ${event.type}`)
        await markCompleted(supabase, event.id)
      } catch (err) {
        console.error(`[member/vip-webhook] ${event.type} error:`, err)
        await markFailed(supabase, event.id, String(err))
      }
      break
    }

    // ── Invoice payment succeeded → create immutable commission decision ──────
    case 'invoice.payment_succeeded': {
      if (!await claimEvent(supabase, event.id, event.type)) break

      try {
        const invoice        = event.data.object as Stripe.Invoice
        const subscriptionId = invoice.subscription as string | null
        if (!subscriptionId) {
          await markCompleted(supabase, event.id)
          break
        }

        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        if (subscription.metadata?.type !== 'vip_membership') {
          await markCompleted(supabase, event.id)
          break
        }

        const memberId = subscription.metadata?.memberId
        if (!memberId) {
          await markCompleted(supabase, event.id)
          break
        }

        // The Stripe invoice ID is the immutable payment identifier
        const membershipPaymentId = invoice.id
        const paymentAmount       = (invoice.amount_paid ?? 0) / 100
        const paymentCollectedAt  = new Date(invoice.created * 1000).toISOString()
        const period              = settlementPeriod(new Date(invoice.created * 1000))

        // Check for existing commission decision (UNIQUE constraint on membership_payment_id)
        const { data: existingDecision } = await supabase
          .from('commission_decisions')
          .select('id')
          .eq('membership_payment_id', membershipPaymentId)
          .maybeSingle()

        if (existingDecision) {
          console.log(`[member/vip-webhook] Commission decision already exists for ${membershipPaymentId}`)
          await markCompleted(supabase, event.id)
          break
        }

        // Fetch member's origin store/merchant to read commission eligibility
        const { data: member } = await supabase
          .from('members')
          .select('id, origin_store_id, origin_merchant_id')
          .eq('id', memberId)
          .single()

        if (!member?.origin_store_id || !member?.origin_merchant_id) {
          console.error(`[member/vip-webhook] Member ${memberId} has no origin store — cannot create commission decision`)
          await markFailed(supabase, event.id, `Member ${memberId} missing origin_store_id`)
          break
        }

        // Read commission eligibility AT payment time — immutable from this point
        const { data: originMerchant } = await supabase
          .from('merchants')
          .select('commission_eligible')
          .eq('id', member.origin_merchant_id)
          .single()

        const eligible         = originMerchant?.commission_eligible ?? false
        const COMMISSION_AMT   = 19.99
        const commissionAmount = eligible ? COMMISSION_AMT : 19.99 // always 19.99, direction differs

        // Create immutable commission decision
        const { data: decision, error: decisionErr } = await supabase
          .from('commission_decisions')
          .insert({
            membership_payment_id:       membershipPaymentId,
            stripe_subscription_id:      subscriptionId,
            member_id:                   member.id,
            origin_store_id:             member.origin_store_id,
            origin_merchant_id:          member.origin_merchant_id,
            payment_amount:              paymentAmount,
            payment_collected_at:        paymentCollectedAt,
            eligibility_at_payment_time: eligible,
            commission_amount:           commissionAmount,
            commission_recipient:        eligible ? 'merchant' : 'binperks',
            binperks_retention_reason:   eligible ? null : 'Origin merchant not commission_eligible at payment time',
            settlement_period:           period,
            ledger_status:               'pending',
          })
          .select('id')
          .single()

        if (decisionErr || !decision) {
          console.error('[member/vip-webhook] Failed to create commission decision:', decisionErr)
          await markFailed(supabase, event.id, `commission_decisions insert failed: ${decisionErr?.message}`)
          break
        }

        // Create settlement ledger entry (partial UNIQUE index prevents duplicates)
        const ledgerType = eligible ? 'commission_credit' : 'commission_retained_binperks'
        await supabase.from('settlement_ledger').insert({
          ledger_entry_type:      ledgerType,
          commission_decision_id: decision.id,
          member_id:              member.id,
          origin_store_id:        member.origin_store_id,
          origin_merchant_id:     member.origin_merchant_id,
          funding_party:          eligible ? 'origin_merchant' : 'binperks',
          credit_amount:          eligible ? commissionAmount : 0,
          debit_amount:           eligible ? 0 : commissionAmount,
          membership_payment_id:  membershipPaymentId,
          stripe_subscription_id: subscriptionId,
          occurred_at:            paymentCollectedAt,
          settlement_period:      period,
          ledger_status:          'pending',
        })

        console.log(
          `[member/vip-webhook] Commission decision created: ${decision.id}`,
          `eligible=${eligible} period=${period} amount=${commissionAmount}`
        )
        await markCompleted(supabase, event.id)
      } catch (err) {
        console.error('[member/vip-webhook] invoice.payment_succeeded error:', err)
        await markFailed(supabase, event.id, String(err))
      }
      break
    }

    // ── Invoice payment failed → start grace period ──────────────────────────
    case 'invoice.payment_failed': {
      if (!await claimEvent(supabase, event.id, event.type)) break

      try {
        const invoice        = event.data.object as Stripe.Invoice
        const subscriptionId = invoice.subscription as string | null
        if (!subscriptionId) {
          await markCompleted(supabase, event.id)
          break
        }

        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        if (subscription.metadata?.type !== 'vip_membership') {
          await markCompleted(supabase, event.id)
          break
        }
        const memberId = subscription.metadata?.memberId
        if (!memberId) {
          await markCompleted(supabase, event.id)
          break
        }

        // 30-day grace period — member keeps VIP status and ALL stamps.
        // GHL sends payment-failure warning SMS (respecting sms_opt_in) — TODO Phase 2.
        console.log(`[member/vip-webhook] Member ${memberId} payment failed — 30-day grace period`)
        await markCompleted(supabase, event.id)
      } catch (err) {
        console.error('[member/vip-webhook] invoice.payment_failed error:', err)
        await markFailed(supabase, event.id, String(err))
      }
      break
    }

    // ── Subscription deleted → downgrade to Free ─────────────────────────────
    case 'customer.subscription.deleted': {
      if (!await claimEvent(supabase, event.id, event.type)) break

      try {
        const subscription = event.data.object as Stripe.Subscription
        if (subscription.metadata?.type !== 'vip_membership') {
          await markCompleted(supabase, event.id)
          break
        }
        const memberId = subscription.metadata?.memberId
        if (!memberId) {
          await markCompleted(supabase, event.id)
          break
        }

        // Downgrade to Free — stamps and coupon history are NEVER touched.
        await supabase
          .from('members')
          .update({ subscription_status: 'free', vip_billing_cycle: null })
          .eq('id', memberId)

        console.log(`[member/vip-webhook] Member ${memberId} downgraded to Free`)
        await markCompleted(supabase, event.id)
      } catch (err) {
        console.error('[member/vip-webhook] customer.subscription.deleted error:', err)
        await markFailed(supabase, event.id, String(err))
      }
      break
    }

    default:
      console.log(`[member/vip-webhook] Unhandled event type: ${event.type}`)
  }

  return NextResponse.json({ received: true })
}
