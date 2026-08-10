/**
 * POST /api/join/vip
 *
 * Creates a Stripe Checkout session for the $29.99/month VIP membership.
 * Used by BOTH VIP entry points — the signup upsell at
 * /member/join/[storeKey]/vip and the standalone /member/upgrade page.
 *
 * ── DUPLICATE GUARD ──────────────────────────────────────────────────────────
 * This route used to create a checkout session for any memberId it was handed,
 * every time. Nothing stopped a member who was already VIP from subscribing
 * again, and one test member accumulated NINE concurrent vip_membership
 * subscriptions — which in production is nine charges a month for one person.
 *
 * Three checks now stand in the way, cheapest first:
 *   1. the member exists
 *   2. the member is active and not blacklisted
 *   3. the member is not already VIP — by our own record, and then confirmed
 *      against Stripe when we hold a subscription id
 *
 * Check 3's second half matters because our record can lag: a member who
 * completes checkout and taps again before the webhook lands would still read
 * as free. Asking Stripe closes that window exactly, with no search-index
 * delay, because we look the subscription up by id.
 *
 * ── ON AUTHENTICATION ────────────────────────────────────────────────────────
 * This endpoint is deliberately NOT session-gated: the signup funnel reaches it
 * before the member has verified their OTP, so requiring a session would break
 * the primary conversion path. memberId therefore comes from the request body
 * and is only validated, not authenticated. See the note in the completion
 * report — closing that properly needs the signup flow to establish a session
 * first, which is a larger change than this fix.
 *
 * Responses:
 *   200 { checkoutUrl }
 *   400 { error: 'Missing required fields' }
 *   403 { error: 'member_inactive' }
 *   404 { error: 'member_not_found' }
 *   409 { error: 'already_vip' }
 *   500 { error: 'Failed to create checkout session' }
 */

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
})

const VIP_PRICE_USD = 2999

/** Stripe statuses that mean "this member is already paying, or is expected to
 *  resume paying". A past_due subscription is still live — Stripe is retrying —
 *  so a second checkout would double-bill rather than fix anything. */
const LIVE_SUBSCRIPTION_STATUSES: Stripe.Subscription.Status[] = [
  'active', 'trialing', 'past_due', 'unpaid',
]

interface VipRequest {
  memberId: string
  merchantId: string
  successUrl: string
  cancelUrl: string
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Partial<VipRequest>
    const { memberId, merchantId, successUrl, cancelUrl } = body

    if (!memberId || !merchantId || !successUrl || !cancelUrl) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Public endpoint (no session during signup), so reads go through the admin
    // client — CLAUDE.md CRITICAL RLS RULE.
    const admin = createAdminSupabaseClient()

    const { data: member } = await admin
      .from('members')
      .select('id, status, is_blacklisted, subscription_status, stripe_subscription_id')
      .eq('id', memberId)
      .maybeSingle()

    // Previously any string was accepted here, so a checkout could be opened
    // against a memberId that did not exist at all.
    if (!member) {
      return NextResponse.json({ error: 'member_not_found' }, { status: 404 })
    }

    if (member.status === 'deactivated' || member.is_blacklisted) {
      console.warn(`[/api/join/vip] blocked checkout for inactive member=${memberId}`)
      return NextResponse.json({ error: 'member_inactive' }, { status: 403 })
    }

    if (member.subscription_status === 'vip') {
      console.warn(`[/api/join/vip] blocked duplicate checkout — member=${memberId} already VIP`)
      return NextResponse.json({ error: 'already_vip' }, { status: 409 })
    }

    // Our record says free. Confirm against Stripe when we have an id to check,
    // which covers the gap between checkout completing and the webhook landing.
    if (member.stripe_subscription_id) {
      try {
        const existing = await stripe.subscriptions.retrieve(member.stripe_subscription_id)
        if (LIVE_SUBSCRIPTION_STATUSES.includes(existing.status)) {
          console.warn(
            `[/api/join/vip] blocked duplicate checkout — member=${memberId} has live ` +
            `subscription ${existing.id} (${existing.status}) despite subscription_status=free`
          )
          return NextResponse.json({ error: 'already_vip' }, { status: 409 })
        }
      } catch (err) {
        // A subscription that no longer exists at Stripe is not a reason to
        // block a member from subscribing again.
        console.error(`[/api/join/vip] could not verify ${member.stripe_subscription_id}:`, err)
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            recurring: { interval: 'month' },
            product_data: {
              name: 'BinPerks VIP Membership',
              description: 'Monthly loyalty rewards membership',
            },
            unit_amount: VIP_PRICE_USD,
          },
          quantity: 1,
        },
      ],
      subscription_data: {
        metadata: {
          memberId,
          merchantId,
          type: 'vip_membership',
        },
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    })

    return NextResponse.json({ checkoutUrl: session.url })

  } catch (err) {
    console.error('[/api/join/vip] Error:', err)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}
