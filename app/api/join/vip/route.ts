/**
 * POST /api/join/vip
 *
 * Creates a Stripe checkout session for VIP membership ($22.95/mo).
 * Called by Page 3 if member chooses VIP.
 *
 * The Stripe webhook (on checkout.session.completed) updates:
 *   members.subscription_status = 'vip'
 *   members.vip_billing_cycle = 'monthly'
 *
 * VIP revenue split: 80% to merchant via Stripe Connect, 20% to BinPerks
 *
 * Request body:
 *   { memberId, merchantId, successUrl, cancelUrl }
 *
 * Response:
 *   200 { checkoutUrl }
 *   400 { error }
 *   500 { error }
 */

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
})

const VIP_PRICE_USD = 2295 // $22.95 in cents

interface VipRequest {
  memberId: string
  merchantId: string                // resolved server-side to merchants.stripe_connect_id
  successUrl: string                // e.g. /join/[storeKey]/thankyou?plan=vip
  cancelUrl: string                 // e.g. /join/[storeKey]/vip (back to upsell)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Partial<VipRequest>
    const { memberId, merchantId, successUrl, cancelUrl } = body

    if (!memberId || !merchantId || !successUrl || !cancelUrl) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Resolve the merchant's Stripe Connect account server-side — never trust
    // a connect ID from the client.
    const supabase = await createServerSupabaseClient()
    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .select('stripe_connect_id')
      .eq('id', merchantId)
      .single()

    if (merchantError || !merchant?.stripe_connect_id) {
      return NextResponse.json({ error: 'merchant_not_stripe_connected' }, { status: 400 })
    }

    const merchantStripeConnectId = merchant.stripe_connect_id

    // Create Stripe checkout session with Connect transfer
    // 80% to merchant, 20% to BinPerks (application_fee_percent)
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
        application_fee_percent: 20, // 20% to BinPerks
        metadata: {
          memberId,
          type: 'vip_membership',
        },
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      // Top-level session metadata — the webhook reads this directly off
      // checkout.session.completed without an extra Stripe API call.
      // (subscription_data.metadata above propagates to the Subscription
      // object instead, which the webhook uses for later invoice/cancel events.)
      metadata: {
        memberId,
        type: 'vip_membership',
      },
      // Route payment to merchant's connected account
      // @ts-expect-error — stripe-node types lag on newer params
      on_behalf_of: merchantStripeConnectId,
      transfer_data: {
        destination: merchantStripeConnectId,
      },
    })

    return NextResponse.json({ checkoutUrl: session.url })

  } catch (err) {
    console.error('[/api/join/vip] Error:', err)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}
