/**
 * POST /api/merchant/apply
 *
 * Creates the merchant application and a Stripe checkout session.
 * Called by Page 3 (plan confirmation) when owner clicks "Start subscription."
 *
 * Steps:
 *   1. Validate form data
 *   2. Create Supabase auth user for merchant (email magic link, admin client)
 *   3. Insert merchants row (subscription_status: 'pending')
 *   4. Insert stores row for the first location (is_active: false until paid)
 *   5. Create Stripe customer
 *   6. Create Stripe checkout session (subscription)
 *   7. Notify GHL: merchant-created, and the abandoned-checkout alert (both
 *      skipped if their URL isn't configured, neither able to block checkout)
 *   8. Return { checkoutUrl, merchantId }
 *
 * Note: GHL_MERCHANT_CREATED_WEBHOOK_URL handles the welcome SMS — no separate welcome webhook needed.
 *
 * On Stripe webhook (checkout.session.completed) — see /api/merchant/webhook:
 *   - Update merchant: subscription_status='active', stripe_subscription_id, billing_status='active'
 *   - stores.is_active = true
 *   - GHL sends magic link email — BinPerks admin provisions logo/brand color/QR manually
 *
 * Pricing — see merchantCheckoutLineItems() below, shared with resume-checkout:
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
 * Response: { checkoutUrl: string, merchantId: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { postToGhl } from '@/lib/ghl-webhook'
import { merchantCheckoutLineItems } from '@/lib/merchant-checkout'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' })

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      firstName, lastName, email, phone, website,
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

    const supabase = createAdminSupabaseClient()
    const count = Math.max(1, Number(locationCount) || 1)

    // Resolve the Stripe prices FIRST. Everything below writes — an auth user,
    // a Stripe customer, a merchant row, a store row — before Stripe is asked
    // for a checkout session, so a missing price discovered at step 6 left all
    // four behind as orphans. Fail here instead, while nothing exists yet.
    const lineItems = merchantCheckoutLineItems(count)
    if (!lineItems) {
      console.error('[/api/merchant/apply] Stripe price env vars missing — refusing before any writes')
      return NextResponse.json({ error: 'Checkout is not configured' }, { status: 500 })
    }

    const normalizedEmail = email.toLowerCase().trim()

    // 1. Create Supabase auth user (email magic link — admin client required
    //    for auth.admin.* calls; the regular server client can't do this).
    const admin = createAdminSupabaseClient()
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      email_confirm: true,
    })

    let authUserId = authData?.user?.id

    if (authError) {
      if (!authError.message.includes('already been registered')) {
        console.error('[/api/merchant/apply] auth error:', authError)
        return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
      }
      // Email already has a Supabase auth user (e.g. re-applying). Look up
      // whether we already have a merchant row tied to it; otherwise proceed
      // without an auth_user_id — BinPerks admin can reconcile during
      // provisioning rather than blocking the application.
      const { data: existingMerchant } = await supabase
        .from('merchants')
        .select('auth_user_id')
        .eq('owner_email', normalizedEmail)
        .maybeSingle()
      authUserId = existingMerchant?.auth_user_id ?? undefined
    }

    // 2. Create Stripe customer
    const stripeCustomer = await stripe.customers.create({
      email: normalizedEmail,
      name: `${firstName} ${lastName}`,
      metadata: { companyName, storeName },
    })

    // 3. Insert merchant row
    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .insert({
        auth_user_id:        authUserId ?? null,
        owner_email:         normalizedEmail,
        company_name:        companyName.trim(),
        name:                companyName.trim(),
        stripe_customer_id:  stripeCustomer.id,
        subscription_status: 'pending',
        plan:                'standard',
        location_count:      count,
        billing_status:      'pending',
        created_at:          new Date().toISOString(),
      })
      .select('id')
      .single()

    if (merchantError || !merchant) {
      console.error('[/api/merchant/apply] merchant insert error:', merchantError)
      return NextResponse.json({ error: 'Failed to create merchant' }, { status: 500 })
    }

    // 4. Insert first store (location)
    // canonical_key: STATE-City-StoreName (no spaces) — BinPerks admin
    // reviews/adjusts during provisioning. Used as the /join/[storeKey] slug.
    const canonicalKey = [
      state.toUpperCase(),
      city.replace(/\s+/g, ''),
      storeName.replace(/\s+/g, ''),
    ].join('-')

    await supabase.from('stores').insert({
      merchant_id:       merchant.id,
      canonical_key:     canonicalKey,
      brand_name:        storeName.trim(),
      display_name:      storeName.trim(),
      address:           (address ?? '').trim(),
      city:              city.trim(),
      state:             state.trim().toUpperCase(),
      zip:               (zip ?? '').trim(),
      timezone:          'America/New_York',  // BinPerks admin updates during provisioning
      brand_color:       '#4A4B98',           // BinPerks admin updates during provisioning
      fiscal_week_start: 'friday',
      bin_count:         binCount ? Number(binCount) : null,
      is_active:         false,               // activated after payment + provisioning
      created_at:        new Date().toISOString(),
    })

    // 5. Line items were resolved at the top — see merchantCheckoutLineItems().

    // 6. Create Stripe checkout session
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
    const session = await stripe.checkout.sessions.create({
      mode:       'subscription',
      customer:   stripeCustomer.id,
      line_items: lineItems,
      payment_method_types: ['card'],
      allow_promotion_codes: true,
      subscription_data: {
        metadata: {
          merchantId:    merchant.id,
          locationCount: String(count),
        },
      },
      success_url: `${appUrl}/merchant/signup/thankyou?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}/merchant/signup/apply`,
      metadata: {
        merchantId:    merchant.id,
        locationCount: String(count),
      },
    })

    // 7. Notify GHL. Awaited — a fire-and-forget fetch is killed when the
    //    handler returns on Vercel, so the welcome SMS was being dropped at
    //    random. postToGhl never throws, so a GHL outage cannot block a
    //    merchant from paying. The two calls run side by side, so a slow GHL
    //    costs one 5s timeout before the checkout redirect, not two.
    const ghlCalls: Promise<boolean>[] = []

    const ghlWebhook = process.env.GHL_MERCHANT_CREATED_WEBHOOK_URL
    if (ghlWebhook) {
      ghlCalls.push(postToGhl(ghlWebhook, {
        merchantId:  merchant.id,
        firstName,
        lastName,
        phone,
        email:       normalizedEmail,
        companyName,
      }, '/api/merchant/apply'))
    }

    // 7a. Abandoned-checkout alert.
    //
    //     SENT WHEN CHECKOUT STARTS, NOT WHEN IT IS ABANDONED. BinPerks cannot
    //     know a merchant has walked away until they have — so this hands GHL
    //     the details now, and the GHL workflow decides when to follow up.
    //     That workflow MUST stop once the merchant pays, or every merchant
    //     who pays gets a "you didn't finish" message a day later.
    //
    //     checkoutUrl is Stripe's session URL, which Stripe expires after 24
    //     hours. A follow-up sent later than that links to a dead page; a
    //     merchant can still finish from the dashboard, which offers a fresh
    //     checkout to any merchant still marked pending.
    const abandonedWebhook = process.env.GHL_MERCHANT_ABANDONED_CHECKOUT_WEBHOOK_URL
    if (abandonedWebhook) {
      ghlCalls.push(postToGhl(abandonedWebhook, {
        merchantName:  `${firstName} ${lastName}`.trim(),
        businessName:  companyName,
        merchantEmail: normalizedEmail,
        merchantPhone: phone ?? null,
        storeName,
        checkoutUrl:   session.url,
      }, '/api/merchant/apply abandoned-checkout'))
    } else {
      console.warn('[/api/merchant/apply] GHL_MERCHANT_ABANDONED_CHECKOUT_WEBHOOK_URL is not set — abandoned-checkout alert skipped')
    }

    await Promise.all(ghlCalls)

    return NextResponse.json({
      checkoutUrl: session.url,
      merchantId:  merchant.id,
    })

  } catch (err) {
    console.error('[/api/merchant/apply] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
