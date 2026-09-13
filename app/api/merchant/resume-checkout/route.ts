/**
 * POST /api/merchant/resume-checkout
 *
 * Creates a new Stripe checkout session for a merchant who abandoned signup.
 * Called when merchant with billing_status='pending' clicks "Complete Payment →".
 *
 * Auth: Supabase merchant session cookie.
 * Returns: { url } — redirect merchant to Stripe checkout.
 */

import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { merchantCheckoutLineItems } from '@/lib/merchant-checkout'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' })

export async function POST() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminSupabaseClient()

  const { data: merchant } = await admin
    .from('merchants')
    .select('id, stripe_customer_id, billing_status, location_count')
    .eq('auth_user_id', user.id)
    .single()

  if (!merchant) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 })
  if (merchant.billing_status === 'active') {
    return NextResponse.json({ error: 'Subscription already active' }, { status: 400 })
  }

  // Same line items as /api/merchant/apply — one shared builder, so the two
  // checkout paths cannot drift apart again (they had identical copies of the
  // one-time-only item list, and both failed the same way).
  const count = Math.max(1, merchant.location_count ?? 1)
  const lineItems = merchantCheckoutLineItems(count)
  if (!lineItems) {
    console.error('[/api/merchant/resume-checkout] Stripe price env vars missing')
    return NextResponse.json({ error: 'Checkout is not configured' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.binperks.com'

  const session = await stripe.checkout.sessions.create({
    mode:                  'subscription',
    customer:              merchant.stripe_customer_id ?? undefined,
    line_items:            lineItems,
    payment_method_types:  ['card'],
    allow_promotion_codes: true,
    subscription_data: {
      metadata: {
        merchantId:    merchant.id,
        locationCount: String(count),
      },
    },
    success_url: `${appUrl}/merchant/dashboard`,
    cancel_url:  `${appUrl}/merchant/dashboard`,
    metadata: {
      merchantId:    merchant.id,
      locationCount: String(count),
    },
  })

  return NextResponse.json({ url: session.url })
}
