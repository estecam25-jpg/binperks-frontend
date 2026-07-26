/**
 * POST /api/merchant/docuseal-webhook
 *
 * Receives DocuSeal webhook events when a merchant signs their agreement.
 * On submission.completed: finds the merchant by signer email and stamps
 * agreement_signed_at on their store record.
 *
 * Signature verification: HMAC-SHA256 of raw body using DOCUSEAL_WEBHOOK_SECRET.
 * DocuSeal sends the digest in the X-Docuseal-Signature header (hex-encoded).
 *
 * Env vars required:
 *   DOCUSEAL_WEBHOOK_SECRET       — live
 *   DOCUSEAL_WEBHOOK_SECRET_TEST  — test / sandbox
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

const isTest = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test')
const webhookSecret = isTest
  ? process.env.DOCUSEAL_WEBHOOK_SECRET_TEST
  : process.env.DOCUSEAL_WEBHOOK_SECRET

function verifySignature(body: string, sigHeader: string | null): boolean {
  if (!webhookSecret || !sigHeader) return false
  const expected = createHmac('sha256', webhookSecret).update(body).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(sigHeader))
  } catch {
    return false
  }
}

interface DocuSealSubmitter {
  role: string
  email: string
}

interface DocuSealEvent {
  event_type: string
  data: {
    id: number
    submitters: DocuSealSubmitter[]
  }
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sigHeader = req.headers.get('x-docuseal-signature')

  if (!verifySignature(body, sigHeader)) {
    console.error('[docuseal-webhook] Invalid or missing signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let event: DocuSealEvent
  try {
    event = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Only handle submission.completed
  if (event.event_type !== 'submission.completed') {
    return NextResponse.json({ received: true })
  }

  // Find signer email — look for the submitter with role 'Signer'
  const signer = event.data?.submitters?.find(
    (s: DocuSealSubmitter) => s.role?.toLowerCase() === 'signer'
  )
  const signerEmail = signer?.email?.toLowerCase().trim()

  if (!signerEmail) {
    console.error('[docuseal-webhook] No signer email in submission', event.data?.id)
    return NextResponse.json({ error: 'No signer email' }, { status: 422 })
  }

  const supabase = createAdminSupabaseClient()

  // Find merchant by owner_email
  const { data: merchant } = await supabase
    .from('merchants')
    .select('id')
    .eq('owner_email', signerEmail)
    .single()

  if (!merchant) {
    console.error('[docuseal-webhook] No merchant found for email:', signerEmail)
    // Return 200 so DocuSeal doesn't retry — this isn't a transient error
    return NextResponse.json({ received: true })
  }

  // Stamp agreement_signed_at on the merchant's store(s)
  const { error } = await supabase
    .from('stores')
    .update({ agreement_signed_at: new Date().toISOString() })
    .eq('merchant_id', merchant.id)

  if (error) {
    console.error('[docuseal-webhook] Failed to update agreement_signed_at:', error.message)
    return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
  }

  console.log('[docuseal-webhook] Agreement signed for merchant:', merchant.id, '(' + signerEmail + ')')
  return NextResponse.json({ received: true })
}
