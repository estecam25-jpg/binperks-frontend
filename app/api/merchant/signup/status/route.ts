/**
 * GET /api/merchant/signup/status?session_id=cs_…
 *
 * What the thank-you page polls after Stripe sends the merchant back: is their
 * signing link ready yet?
 *
 * PUBLIC — the merchant has no session yet. The Stripe checkout session id is
 * the credential: it appears only in the success URL Stripe returns to the
 * payer's own browser, and it is checked with Stripe here, never trusted as-is.
 *
 * CAN CREATE THE MERCHANT ITSELF. If this page arrives before either Stripe
 * event has, it does the same idempotent step the webhook would (see
 * lib/merchant-onboarding) — so a slow or missing webhook cannot leave a
 * merchant who has paid staring at a spinner.
 *
 * Responses (200):
 *   { state: 'processing' }        payment not confirmed yet, or not a merchant
 *                                  signup — keep polling
 *   { state: 'preparing' }         merchant exists; the DocuSeal session is not
 *                                  open yet — keep polling
 *   { state: 'ready', signUrl }    go sign
 *   { state: 'active' }            already signed and live
 * 400 { error: 'invalid_session' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import {
  PENDING_SIGNATURE, createMerchantFromCheckoutSession, ensureDocusealSubmission, signPagePath,
} from '@/lib/merchant-onboarding'

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session_id') ?? ''
  if (!/^cs_(test_|live_)?[A-Za-z0-9]+$/.test(sessionId)) {
    return NextResponse.json({ error: 'invalid_session' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()

  let merchant
  try {
    merchant = await createMerchantFromCheckoutSession(admin, sessionId)
  } catch (err) {
    // An unknown session id, or Stripe unreachable. Not something to retry
    // into a flood; the page shows its fallback after a while.
    console.error('[signup/status] checkout session lookup failed:', err)
    return NextResponse.json({ error: 'invalid_session' }, { status: 400 })
  }

  if (!merchant) return NextResponse.json({ state: 'processing' })
  if (merchant.billing_status !== PENDING_SIGNATURE) return NextResponse.json({ state: 'active' })

  const slug = merchant.docuseal_slug ?? await ensureDocusealSubmission(admin, merchant.id)
  if (!slug) return NextResponse.json({ state: 'preparing' })

  return NextResponse.json({ state: 'ready', signUrl: signPagePath(slug) })
}
