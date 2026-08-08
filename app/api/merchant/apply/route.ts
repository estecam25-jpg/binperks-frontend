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
 *   7. Notify GHL merchant-created webhook (fire-and-forget, skipped if URL isn't configured)
 *   8. Return { checkoutUrl, merchantId }
 *
 * Note: GHL_MERCHANT_CREATED_WEBHOOK_URL handles the welcome SMS — no separate welcome webhook needed.
 *
 * On Stripe webhook (checkout.session.completed) — see /api/merchant/webhook:
 *   - Update merchant: subscription_status='active', stripe_subscription_id, billing_status='active'
 *   - stores.is_active = true
 *   - GHL sends magic link email — BinPerks admin provisions logo/brand color/QR manually
 *
 * Pricing (V3):
 *   Month 1:  $299.99 Implementation & Launch (first location) + $49.99 x additional locations
 *   Month 2+: $99.00 Platform Subscription (first location)    + $49.99 x additional locations
 *
 *   This route creates the Month 1 checkout only. The transition to $99/month is
 *   handled by the Subscription Schedule that /api/merchant/webhook creates on
 *   checkout.session.completed — never here.
 *
 *   FOUNDING100 waives the Implementation & Launch fee only (product-restricted
 *   coupon); it does not discount platform or additional-location prices.
 *
 * Request body: MerchantSignupForm + { locationCount }
 * Response: { checkoutUrl: string, merchantId: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { postToGhl } from '@/lib/ghl-webhook'

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

    // 5. Build Stripe line items using V3 catalog price IDs (required for coupons/promotions to apply)
    const isTest = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test')

    const IMPLEMENTATION_PRICE = isTest
      ? process.env.STRIPE_PRICE_IMPLEMENTATION_TEST
      : process.env.STRIPE_PRICE_IMPLEMENTATION

    const LOCATION_PRICE = isTest
      ? process.env.STRIPE_PRICE_LOCATION_TEST
      : process.env.STRIPE_PRICE_LOCATION

    const lineItems = [
      { price: IMPLEMENTATION_PRICE, quantity: 1 },
      ...(count > 1 ? [{ price: LOCATION_PRICE, quantity: count - 1 }] : []),
    ]

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
    //    random. Costs up to 5s before the checkout redirect; postToGhl never
    //    throws, so a GHL outage cannot block a merchant from paying.
    //    Skipped entirely if the webhook URL isn't configured yet.
    const ghlWebhook = process.env.GHL_MERCHANT_CREATED_WEBHOOK_URL
    if (ghlWebhook) {
      await postToGhl(ghlWebhook, {
        merchantId:  merchant.id,
        firstName,
        lastName,
        phone,
        email:       normalizedEmail,
        companyName,
      }, '/api/merchant/apply')
    }

    return NextResponse.json({
      checkoutUrl: session.url,
      merchantId:  merchant.id,
    })

  } catch (err) {
    console.error('[/api/merchant/apply] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
