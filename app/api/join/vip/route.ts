import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
})

const VIP_PRICE_USD = 2999

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