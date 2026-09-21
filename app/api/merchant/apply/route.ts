/**
 * POST /api/merchant/apply
 *
 * Opens a Stripe checkout for a merchant application. Called by Page 3 (plan
 * confirmation) when the owner clicks "Start subscription."
 *
 * WRITES NOTHING TO THE DATABASE. The merchant and store rows are created only
 * once Stripe confirms payment (see lib/merchant-onboarding), so an application
 * that is never paid for leaves nothing behind — no half-set-up merchant, no
 * auth user, no inactive store. The form travels to that step inside the
 * checkout's metadata, on both the session and the subscription, because the
 * two Stripe events that can create the merchant each see only their own.
 *
 * Steps:
 *   1. Validate form data
 *   2. Create a Stripe customer (a Stripe object, not a BinPerks record)
 *   3. Create the Stripe checkout session (subscription)
 *   4. Alert GHL: abandoned-checkout (skipped if its URL isn't configured,
 *      never able to block checkout)
 *   5. Return { checkoutUrl }
 *
 * After payment — /api/merchant/webhook and the thank-you page:
 *   merchant + store created (billing_status 'pending_signature') → DocuSeal
 *   agreement signed in-app at /merchant/signup/sign → merchant activated.
 *
 * Pricing — see merchantCheckoutLineItems(), shared with resume-checkout:
 *   $200.00 setup fee          one-time, first invoice only
 *   $99.99/month platform      recurring, starts immediately
 *   $49.99/month per location  recurring, additional locations only (2+)
 *
 *   Month 1 = $200.00 + $99.99 = $299.99 for one location; $99.99/month after.
 *   There is no Subscription Schedule: the recurring price is on the
 *   subscription from the first invoice and simply continues.
 *
 *   Promotion codes are entered on the Stripe checkout page —
 *   allow_promotion_codes below. Which codes exist, and what each one
 *   discounts, is configured on the coupon in Stripe, not here.
 *
 * Request body: MerchantSignupForm + { locationCount }
 * Response: { checkoutUrl: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { postToGhl } from '@/lib/ghl-webhook'
import { merchantCheckoutLineItems } from '@/lib/merchant-checkout'
import { signupMetadata } from '@/lib/merchant-onboarding'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' })

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      firstName, lastName, email, phone,
      companyName, storeName, address, city, state, zip,
      locationCount, binCount,
    } = body

    // Basic validation
    if (!firstName || !lastName || !email || !companyName || !storeName || !city || !state) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    const count = Math.max(1, Number(locationCount) || 1)

    // Resolve the Stripe prices first, before creating anything in Stripe.
    const lineItems = merchantCheckoutLineItems(count)
    if (!lineItems) {
      console.error('[/api/merchant/apply] Stripe price env vars missing — refusing before any writes')
      return NextResponse.json({ error: 'Checkout is not configured' }, { status: 500 })
    }

    const normalizedEmail = email.toLowerCase().trim()

    // Everything the post-payment step needs to create the merchant and store.
    const metadata = signupMetadata({
      firstName:     String(firstName).trim(),
      lastName:      String(lastName).trim(),
      email:         normalizedEmail,
      phone:         phone ? String(phone) : '',
      companyName:   String(companyName).trim(),
      storeName:     String(storeName).trim(),
      address:       address ? String(address) : '',
      city:          String(city),
      state:         String(state),
      zip:           zip ? String(zip) : '',
      locationCount: count,
      binCount:      binCount ? Number(binCount) : null,
    })

    // 2. Stripe customer
    const stripeCustomer = await stripe.customers.create({
      email: normalizedEmail,
      name: `${firstName} ${lastName}`,
      metadata: { companyName, storeName },
    })

    // 3. Stripe checkout session
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
    const session = await stripe.checkout.sessions.create({
      mode:       'subscription',
      customer:   stripeCustomer.id,
      line_items: lineItems,
      payment_method_types: ['card'],
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { ...metadata, locationCount: String(count) },
      },
      success_url: `${appUrl}/merchant/signup/thankyou?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}/merchant/signup/apply`,
      metadata: { ...metadata, locationCount: String(count) },
    })

    // 4. Abandoned-checkout alert.
    //
    //    SENT WHEN CHECKOUT STARTS, NOT WHEN IT IS ABANDONED. BinPerks cannot
    //    know a merchant has walked away until they have — so this hands GHL
    //    the details now, and the GHL workflow decides when to follow up.
    //    That workflow MUST stop once the merchant pays, or every merchant
    //    who pays gets a "you didn't finish" message a day later.
    //
    //    checkoutUrl is Stripe's session URL, which Stripe expires after 24
    //    hours. A follow-up sent later than that links to a dead page.
    //
    //    Awaited — a fire-and-forget fetch is killed when the handler returns
    //    on Vercel. postToGhl never throws, so a GHL outage cannot block a
    //    merchant from paying.
    const abandonedWebhook = process.env.GHL_MERCHANT_ABANDONED_CHECKOUT_WEBHOOK_URL
    if (abandonedWebhook) {
      await postToGhl(abandonedWebhook, {
        merchantName:  `${firstName} ${lastName}`.trim(),
        businessName:  companyName,
        merchantEmail: normalizedEmail,
        merchantPhone: phone ?? null,
        storeName,
        checkoutUrl:   session.url,
      }, '/api/merchant/apply abandoned-checkout')
    } else {
      console.warn('[/api/merchant/apply] GHL_MERCHANT_ABANDONED_CHECKOUT_WEBHOOK_URL is not set — abandoned-checkout alert skipped')
    }

    return NextResponse.json({ checkoutUrl: session.url })

  } catch (err) {
    console.error('[/api/merchant/apply] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
