/**
 * POST /api/merchant/finish-setup — open checkout for a pre-setup store
 *
 * Step 1 of the two the owner does in front of Esteban at the visit. Step 2,
 * signing, and everything after it is the ORGANIC MACHINERY UNCHANGED: this
 * sends the browser to Stripe with success_url pointing at the same thank-you
 * page, which polls the same status route, which creates the DocuSeal session
 * and forwards to the same signing page. Activation only ever happens through
 * the existing DocuSeal webhook.
 *
 * The one difference from /api/merchant/apply is what travels in the metadata.
 * Apply carries the whole signup form, because no merchant row exists yet.
 * This carries a single id, because one does — see adoptPresetup.
 *
 * THE TOKEN IS THE ONLY CREDENTIAL, so it is checked against a merchant that
 * is still in 'presetup'. A token for a merchant who has paid is dead, which
 * is what stops a second checkout being opened from a link someone kept.
 *
 * NO ABANDONED-CHECKOUT ALERT. That workflow nudges a stranger who wandered
 * off mid-signup; here Esteban is standing next to them.
 *
 * Responses:
 *   200 { checkoutUrl }
 *   404 { error: 'invalid_link' }       bad, spent, or deleted token
 *   409 { error: 'already_started' }    paid already; the page says where to go
 *   500 { error: 'not_configured' }     Stripe prices missing
 */

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { merchantCheckoutLineItems } from '@/lib/merchant-checkout'
import { MERCHANT_SIGNUP_TYPE } from '@/lib/merchant-onboarding'
import { PRESETUP, PRESETUP_MERCHANT_ID_KEY, isPresetupToken } from '@/lib/presetup'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' })

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json().catch(() => ({ token: null }))
    if (!isPresetupToken(token)) {
      return NextResponse.json({ error: 'invalid_link' }, { status: 404 })
    }

    const admin = createAdminSupabaseClient()
    const { data: merchant } = await admin
      .from('merchants')
      .select('id, billing_status, company_name, owner_name, owner_email, phone, location_count')
      .eq('presetup_token', token)
      .maybeSingle()

    if (!merchant) return NextResponse.json({ error: 'invalid_link' }, { status: 404 })
    if (merchant.billing_status !== PRESETUP) {
      return NextResponse.json({ error: 'already_started' }, { status: 409 })
    }

    const { data: store } = await admin
      .from('stores').select('display_name').eq('merchant_id', merchant.id)
      .order('created_at', { ascending: true }).limit(1).maybeSingle()

    const count = Math.max(1, Number(merchant.location_count) || 1)

    // Resolved before anything is created in Stripe, same as apply.
    const lineItems = merchantCheckoutLineItems(count)
    if (!lineItems) {
      console.error('[/api/merchant/finish-setup] Stripe price env vars missing')
      return NextResponse.json({ error: 'not_configured' }, { status: 500 })
    }

    const email = String(merchant.owner_email ?? '').toLowerCase().trim()
    const storeName = (store?.display_name as string) ?? ''

    const customer = await stripe.customers.create({
      email,
      name: (merchant.owner_name as string) ?? undefined,
      metadata: { companyName: (merchant.company_name as string) ?? '', storeName },
    })

    // One id, not a form. Set on BOTH objects because the two Stripe events
    // that can adopt the merchant each see only their own.
    const metadata: Record<string, string> = {
      type: MERCHANT_SIGNUP_TYPE,
      [PRESETUP_MERCHANT_ID_KEY]: merchant.id as string,
      locationCount: String(count),
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
    const session = await stripe.checkout.sessions.create({
      mode:       'subscription',
      customer:   customer.id,
      line_items: lineItems,
      payment_method_types: ['card'],
      // Same promo codes as organic signup, entered on Stripe's page.
      allow_promotion_codes: true,
      subscription_data: { metadata },
      success_url: `${appUrl}/merchant/signup/thankyou?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}/merchant/finish-setup/${token}`,
      metadata,
    })

    console.log(`[/api/merchant/finish-setup] checkout opened for pre-setup merchant ${merchant.id}`)
    return NextResponse.json({ checkoutUrl: session.url })

  } catch (err) {
    console.error('[/api/merchant/finish-setup] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
