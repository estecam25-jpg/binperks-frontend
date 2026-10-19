/**
 * POST /api/merchant/agreement/activate — finish a stalled activation
 *
 * The replacement for DocuSeal's second route in. Acceptance and activation
 * are two steps, and the second one can fail on its own — a database blip, a
 * timeout — leaving a merchant who has genuinely accepted sitting in front of
 * a page that will not let them through.
 *
 * ONLY FOR MERCHANTS WHO HAVE ALREADY ACCEPTED. The acceptance row is the
 * authority; this route never creates one, so it cannot activate anybody who
 * has not agreed to anything. Everything else is activateAfterSignature's own
 * idempotency: if they are already live, this does nothing and says so.
 *
 * The acceptance page calls it on load whenever it finds an acceptance without
 * an active merchant, so the retry is automatic rather than something the
 * merchant has to know to do.
 */

import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { merchantForAgreementRequest } from '@/lib/agreement-access'
import { activateAfterSignature, sendActivationNotices } from '@/lib/merchant-onboarding'

export async function POST(req: NextRequest) {
  const admin = createAdminSupabaseClient()
  const merchant = await merchantForAgreementRequest(
    admin, req.nextUrl.searchParams.get('session'),
  )
  if (!merchant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: acceptance } = await admin
    .from('merchant_agreement_acceptances')
    .select('id, accepted_at')
    .eq('merchant_id', merchant.id)
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!acceptance) {
    return NextResponse.json({ error: 'not_accepted' }, { status: 409 })
  }

  try {
    const activated = await activateAfterSignature(admin, merchant.id, 'signing_page')
    if (activated) waitUntil(sendActivationNotices(admin, merchant.id))

    // Re-read rather than trusting the return: activateAfterSignature returns
    // false both for "already live" and for "not eligible", and the page needs
    // to know which.
    const { data: now } = await admin
      .from('merchants').select('billing_status').eq('id', merchant.id).maybeSingle()

    const live = now?.billing_status === 'active'
    console.log(`[merchant/agreement/activate] ${merchant.id} retry — activated=${activated} live=${live}`)
    return NextResponse.json({ ok: true, activated, live })
  } catch (err) {
    console.error(`[merchant/agreement/activate] failed for ${merchant.id}:`, err)
    return NextResponse.json({ error: 'activation_failed' }, { status: 500 })
  }
}
