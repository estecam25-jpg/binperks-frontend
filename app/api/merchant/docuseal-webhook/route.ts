/**
 * POST /api/merchant/docuseal-webhook
 *
 * DocuSeal calls this when a merchant signs the Merchant Agreement. A signature
 * from a merchant who has paid and is waiting (billing_status
 * 'pending_signature') ACTIVATES them — see
 * lib/merchant-onboarding.activateAfterSignature(). For anyone else it records
 * the signature on their store (stores.agreement_signed_at) and nothing more.
 *
 * NOT THE ONLY WAY IN. The signing page confirms with DocuSeal's API when the
 * merchant finishes, and activates by the same function. Whichever lands first
 * wins; the other is a no-op.
 *
 * ── Signature ──────────────────────────────────────────────────────────────
 * DocuSeal sends  X-Docuseal-Signature: <unix timestamp>.<hex signature>
 * where the signature is HMAC-SHA256 over "<timestamp>.<raw body>", keyed with
 * the whsec_… secret exactly as DocuSeal shows it (prefix included), and a
 * request more than 5 minutes old is refused. (docuseal.com/resources/use-webhooks)
 *
 * The previous version hashed the body alone and compared the result with the
 * whole header, so it could never match — every webhook DocuSeal ever sent was
 * rejected with a 400, which is why no merchant has an agreement_signed_at.
 *
 * ── Which merchant ─────────────────────────────────────────────────────────
 * In order: the external_id BinPerks sets to the merchant id when it opens the
 * submission; the signer's DocuSeal slug; the submitter id; the submission id;
 * then, for agreements sent before this flow existed, the signer's email.
 *
 * ── Responses ──────────────────────────────────────────────────────────────
 * 400 only for a bad signature or body. Anything else DocuSeal cannot fix by
 * retrying (an event this does not use, a merchant not found) is a 200, so
 * DocuSeal does not retry it for days.
 *
 * Env: DOCUSEAL_WEBHOOK_SECRET (live), DOCUSEAL_WEBHOOK_SECRET_TEST (test —
 * chosen when STRIPE_SECRET_KEY is a test key, as elsewhere).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { activateAfterSignature, sendActivationNotices } from '@/lib/merchant-onboarding'
import { verifyDocusealSignature } from '@/lib/docuseal-signature'

const isTest = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test')
const webhookSecret = isTest
  ? process.env.DOCUSEAL_WEBHOOK_SECRET_TEST
  : process.env.DOCUSEAL_WEBHOOK_SECRET

interface Submitter {
  id?: number
  submission_id?: number
  slug?: string
  email?: string
  role?: string
  status?: string
  external_id?: string | null
  completed_at?: string | null
}

interface DocusealEvent {
  event_type?: string
  data?: Submitter & {
    submitters?: Submitter[]
    status?: string
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Admin = ReturnType<typeof createAdminSupabaseClient>

/** The first merchant any of the event's identifiers points at. */
async function findMerchant(admin: Admin, signers: Submitter[], submissionId: number | undefined) {
  const one = async (col: string, val: string | number) => {
    const { data } = await admin.from('merchants').select('id').eq(col, val).limit(1).maybeSingle()
    return (data?.id as string | undefined) ?? null
  }
  for (const s of signers) {
    if (s.external_id && UUID.test(s.external_id)) {
      const id = await one('id', s.external_id); if (id) return id
    }
    if (s.slug)  { const id = await one('docuseal_slug', s.slug);        if (id) return id }
    if (s.id)    { const id = await one('docuseal_submitter_id', s.id);  if (id) return id }
  }
  if (submissionId) { const id = await one('docuseal_submission_id', submissionId); if (id) return id }
  for (const s of signers) {
    const email = s.email?.toLowerCase().trim()
    if (email) { const id = await one('owner_email', email); if (id) return id }
  }
  return null
}

export async function POST(req: NextRequest) {
  const body = await req.text()

  if (!verifyDocusealSignature(body, req.headers.get('x-docuseal-signature'), webhookSecret)) {
    console.error('[docuseal-webhook] invalid or missing signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let event: DocusealEvent
  try {
    event = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const type = event.event_type
  const data = event.data ?? {}

  // form.completed — one signer has finished (data is that submitter).
  // submission.completed — every signer has finished (data is the submission).
  // Either is the merchant having signed. Nothing else is used.
  let signers: Submitter[]
  let submissionId: number | undefined
  if (type === 'form.completed') {
    if (data.status && data.status !== 'completed' && !data.completed_at) {
      return NextResponse.json({ received: true })
    }
    signers = [data]
    // Deliberately NOT the submission id: if the template ever gains a second
    // signer (a BinPerks countersignature, say), THEIR form.completed shares
    // the merchant's submission and must not activate the merchant. Only this
    // signer's own identifiers count.
    submissionId = undefined
  } else if (type === 'submission.completed') {
    signers = data.submitters ?? []
    submissionId = data.id
  } else {
    return NextResponse.json({ received: true })
  }

  const admin = createAdminSupabaseClient()
  const merchantId = await findMerchant(admin, signers, submissionId)
  if (!merchantId) {
    console.error(`[docuseal-webhook] ${type}: no merchant for submission ${submissionId ?? '?'}`)
    return NextResponse.json({ received: true })
  }

  try {
    const activated = await activateAfterSignature(admin, merchantId, 'docuseal_webhook')
    // Server-to-server: nobody is waiting on this response, so the notices are
    // simply awaited. They never throw.
    if (activated) await sendActivationNotices(admin, merchantId)
    console.log(`[docuseal-webhook] ${type}: merchant ${merchantId} ${activated ? 'activated' : 'signature recorded (already past signing)'}`)
  } catch (err) {
    // A database failure here IS worth DocuSeal retrying.
    console.error(`[docuseal-webhook] activation failed for merchant ${merchantId}:`, err)
    return NextResponse.json({ error: 'activation_failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
