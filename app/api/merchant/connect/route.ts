/**
 * POST /api/merchant/connect
 *
 * Starts (or resumes) Stripe Connect Express onboarding for the signed-in
 * merchant and returns a hosted onboarding URL.
 *
 * Creating the account is idempotent from our side: if the merchant already
 * has a stripe_connect_id we mint a fresh account link against the existing
 * account rather than creating a second one. A merchant must never end up with
 * two Connect accounts — transfers target exactly one destination, and a
 * duplicate would silently split their payout history.
 *
 * Account links are single-use and expire in minutes, so this is called every
 * time the merchant taps Connect / Complete Setup, not cached.
 *
 * Responses:
 *   200 { url }
 *   401 { error: 'Unauthorized' }
 *   404 { error: 'Merchant not found' }
 *   500 { error: 'connect_failed' | 'stripe_unavailable' }
 */

import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' })

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.binperks.com'

export async function POST() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('[merchant/connect] STRIPE_SECRET_KEY not configured')
    return NextResponse.json({ error: 'stripe_unavailable' }, { status: 500 })
  }

  // Server client for identity only; all table access uses the admin client
  // (CLAUDE.md CRITICAL RLS RULE).
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminSupabaseClient()

  const { data: merchant } = await admin
    .from('merchants')
    .select('id, owner_email, company_name, name, stripe_connect_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!merchant) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 })

  try {
    let accountId = merchant.stripe_connect_id

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: merchant.owner_email ?? undefined,
        metadata: { merchantId: merchant.id },
      })
      accountId = account.id

      // Persisted before the account link is created. If the link call fails,
      // the account still exists at Stripe — writing the id first means the
      // retry resumes that account instead of orphaning it and making a second.
      const { error: saveError } = await admin
        .from('merchants')
        .update({ stripe_connect_id: accountId })
        .eq('id', merchant.id)

      if (saveError) {
        // Refusing here is deliberate. Returning an onboarding URL for an
        // account id we failed to store would let the merchant complete setup
        // against an account BinPerks cannot find again.
        console.error('[merchant/connect] failed to store stripe_connect_id:', saveError)
        return NextResponse.json({ error: 'connect_failed' }, { status: 500 })
      }

      console.log(`[merchant/connect] created Connect account ${accountId} for merchant=${merchant.id}`)
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${APP_URL}/merchant/dashboard?tab=settlement&connect=refresh`,
      return_url:  `${APP_URL}/merchant/dashboard?tab=settlement&connect=success`,
      type: 'account_onboarding',
    })

    return NextResponse.json({ url: accountLink.url })

  } catch (err) {
    console.error('[merchant/connect] Stripe error:', err)
    return NextResponse.json({ error: 'connect_failed' }, { status: 500 })
  }
}
