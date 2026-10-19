/**
 * GET  /api/merchant/agreement — the merchant's copy, and whether it's accepted
 * POST /api/merchant/agreement — accept it, and activate
 *
 * Replaces the DocuSeal embed. The agreement is rendered from the versioned
 * in-app source with this merchant's Order Form filled in, accepted with a
 * typed name, title and tick, and recorded in merchant_agreement_acceptances.
 *
 * ── ACCEPTING IS WHAT ACTIVATES ────────────────────────────────────────────
 * Same as before: paying does not make a merchant live, accepting does. This
 * calls the very same activateAfterSignature() the DocuSeal webhook calls, so
 * every downstream consequence — stores live, commission eligibility, the
 * history row, the GHL notice, the support alert, the print kit — happens
 * exactly as it always has, and is idempotent.
 *
 * ── ONE ROW, ONE ACTIVATION, WHATEVER THE BROWSER DOES ─────────────────────
 * A unique index on (merchant_id, agreement_version) is the guard. The route
 * inserts first and reads a conflict as "already accepted", which is safe for
 * a double-click, a refresh mid-request, or two tabs — a read-then-write check
 * would leave a window between the two.
 *
 * ── THE RECORD IS WRITTEN ONCE ─────────────────────────────────────────────
 * The PDF is built and uploaded BEFORE the row is inserted, so pdf_path is set
 * at insert time and the row is never updated afterwards. A PDF that fails to
 * build does not block the acceptance: the row lands with pdf_path null, the
 * hash still proves what was agreed, and the copy can be regenerated.
 *
 * ── IF ACTIVATION FAILS ────────────────────────────────────────────────────
 * The acceptance still stands. The response says so, and the acceptance page
 * retries activation on load for anyone accepted-but-not-active — which is
 * what replaces DocuSeal's second route in.
 */

import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { Resend } from 'resend'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { merchantForAgreementRequest } from '@/lib/agreement-access'
import {
  CURRENT_AGREEMENT_VERSION, fieldsForMerchant, renderAgreement,
  canonicalAgreementText, sha256Hex, acceptanceStatement,
  type MerchantAgreementSource,
} from '@/lib/agreements'
import { buildAgreementPdf } from '@/lib/agreement-pdf'
import { PENDING_SIGNATURE, activateAfterSignature, sendActivationNotices } from '@/lib/merchant-onboarding'

const BUCKET = 'merchant-agreements'
const SUPPORT_TO = 'support@binperks.com'
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'BinPerks <noreply@feedback.binperks.com>'

const MERCHANT_COLUMNS = 'id, company_name, owner_name, owner_email, phone, billing_status'
const STORE_COLUMNS =
  'display_name, address, address_line2, city, state, zip, website_url, google_review_url'

type Admin = ReturnType<typeof createAdminSupabaseClient>

async function loadSource(admin: Admin, merchantId: string) {
  const [{ data: m }, { data: stores }] = await Promise.all([
    admin.from('merchants').select(MERCHANT_COLUMNS).eq('id', merchantId).maybeSingle(),
    admin.from('stores').select(STORE_COLUMNS).eq('merchant_id', merchantId)
      .order('created_at', { ascending: true }),
  ])
  if (!m) return null
  const source: MerchantAgreementSource = {
    companyName: m.company_name as string | null,
    ownerName:   m.owner_name as string | null,
    ownerEmail:  m.owner_email as string | null,
    phone:       m.phone as string | null,
    stores: (stores ?? []).map(s => ({
      displayName:     s.display_name as string | null,
      address:         s.address as string | null,
      addressLine2:    s.address_line2 as string | null,
      city:            s.city as string | null,
      state:           s.state as string | null,
      zip:             s.zip as string | null,
      websiteUrl:      s.website_url as string | null,
      googleReviewUrl: s.google_review_url as string | null,
    })),
  }
  return { merchant: m, source }
}

export async function GET(req: NextRequest) {
  const admin = createAdminSupabaseClient()
  // Either credential: the Stripe checkout session straight after paying, or
  // a merchant session for someone who signed in later.
  const merchant = await merchantForAgreementRequest(
    admin, req.nextUrl.searchParams.get('session'),
  )
  if (!merchant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const loaded = await loadSource(admin, merchant.id)
  if (!loaded) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 })

  const { data: existing } = await admin
    .from('merchant_agreement_acceptances')
    .select('agreement_version, accepted_at, signer_name, signer_title, pdf_path')
    .eq('merchant_id', merchant.id)
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // An already-accepted merchant is shown their own copy as of acceptance, so
  // the page is a record rather than a form.
  const at = existing ? new Date(existing.accepted_at as string) : new Date()
  const version = (existing?.agreement_version as string) ?? CURRENT_AGREEMENT_VERSION
  const fields = fieldsForMerchant(loaded.source, at)
  const blocks = renderAgreement(version, fields)
  if (!blocks) return NextResponse.json({ error: 'unknown_version' }, { status: 500 })

  return NextResponse.json({
    version,
    blocks,
    merchantLegalName: fields.MERCHANT_LEGAL_NAME,
    statement: acceptanceStatement(fields.MERCHANT_LEGAL_NAME, version),
    billingStatus: loaded.merchant.billing_status,
    accepted: existing ? {
      acceptedAt:  existing.accepted_at,
      signerName:  existing.signer_name,
      signerTitle: existing.signer_title,
      hasPdf:      !!existing.pdf_path,
    } : null,
  })
}

export async function POST(req: NextRequest) {
  const admin = createAdminSupabaseClient()
  const merchant = await merchantForAgreementRequest(
    admin, req.nextUrl.searchParams.get('session'),
  )
  if (!merchant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const signerName  = String(body.signerName ?? '').trim().slice(0, 120)
  const signerTitle = String(body.signerTitle ?? '').trim().slice(0, 120)
  const agreed      = body.agreed === true

  if (!signerName || !signerTitle || !agreed) {
    return NextResponse.json({
      error: 'incomplete',
      message: 'Enter your full name and title, and tick the box to accept.',
    }, { status: 400 })
  }

  const loaded = await loadSource(admin, merchant.id)
  if (!loaded) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 })

  const version = CURRENT_AGREEMENT_VERSION
  const acceptedAt = new Date()
  const fields = fieldsForMerchant(loaded.source, acceptedAt)
  const blocks = renderAgreement(version, fields)
  if (!blocks) return NextResponse.json({ error: 'unknown_version' }, { status: 500 })

  const documentSha256 = await sha256Hex(canonicalAgreementText(blocks))

  const acceptance = {
    signerName,
    signerTitle,
    signerEmail: (loaded.merchant.owner_email as string | null) ?? null,
    acceptedAt: acceptedAt.toISOString(),
    merchantLegalName: fields.MERCHANT_LEGAL_NAME,
    agreementVersion: version,
    ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0].trim()
            ?? req.headers.get('x-real-ip') ?? null,
    userAgent: req.headers.get('user-agent'),
    documentSha256,
  }

  // ── PDF first, so the row is written complete and never updated ──────────
  let pdfPath: string | null = null
  let pdf: Buffer | null = null
  try {
    pdf = await buildAgreementPdf({ blocks, acceptance })
    const path = `${merchant.id}/${version}-${acceptedAt.toISOString().slice(0, 10)}.pdf`
    const { error: upErr } = await admin.storage.from(BUCKET)
      .upload(path, new Uint8Array(pdf), { contentType: 'application/pdf', upsert: true })
    if (upErr) throw new Error(upErr.message)
    pdfPath = path
  } catch (err) {
    // The acceptance is the record; the PDF is a copy of it. Losing the copy
    // must not lose the acceptance.
    console.error(`[merchant/agreement] PDF failed for ${merchant.id}:`, err)
  }

  const { data: inserted, error: insErr } = await admin
    .from('merchant_agreement_acceptances')
    .insert({
      merchant_id:       merchant.id,
      agreement_version: version,
      accepted_at:       acceptance.acceptedAt,
      signer_name:       signerName,
      signer_title:      signerTitle,
      signer_email:      acceptance.signerEmail,
      ip_address:        acceptance.ipAddress,
      user_agent:        acceptance.userAgent,
      document_sha256:   documentSha256,
      pdf_path:          pdfPath,
    })
    .select('id, accepted_at')
    .maybeSingle()

  // 23505 = the unique index did its job: this merchant already accepted this
  // version. Not an error — finish the job and report success.
  const alreadyAccepted = !!insErr && insErr.code === '23505'
  if (insErr && !alreadyAccepted) {
    console.error('[merchant/agreement] insert failed:', insErr)
    return NextResponse.json({ error: 'save_failed' }, { status: 500 })
  }

  // The signature date on the store, as before.
  if (!alreadyAccepted) {
    await admin.from('stores')
      .update({ agreement_signed_at: acceptance.acceptedAt })
      .eq('merchant_id', merchant.id)
      .is('agreement_signed_at', null)
  }

  // ── Activate, exactly as the DocuSeal webhook did ────────────────────────
  let activated = false
  let activationFailed = false
  try {
    activated = await activateAfterSignature(admin, merchant.id, 'signing_page')
    if (activated) waitUntil(sendActivationNotices(admin, merchant.id))
  } catch (err) {
    activationFailed = true
    console.error(`[merchant/agreement] activation failed for ${merchant.id}:`, err)
  }

  // The merchant's copy, to them and to support. Deferred: a slow mail API
  // must not hold up the page that is about to send them to their dashboard.
  if (!alreadyAccepted && pdf) {
    const to = (loaded.merchant.owner_email as string | null)?.trim()
    waitUntil((async () => {
      if (!process.env.RESEND_API_KEY) {
        console.warn('[merchant/agreement] RESEND_API_KEY is not set — copies not sent')
        return
      }
      try {
        const resend = new Resend(process.env.RESEND_API_KEY)
        const attachments = [{
          filename: `BinPerks-Merchant-Agreement-${version}.pdf`,
          content: pdf!.toString('base64'),
        }]
        const text = 'Thanks for joining BinPerks! Attached is a copy of the agreement '
                   + 'you accepted. Keep it for your records.'
        const recipients = [to, SUPPORT_TO].filter((e): e is string => !!e)
        for (const recipient of recipients) {
          const { error } = await resend.emails.send({
            from: FROM_EMAIL, to: recipient,
            subject: 'Your BinPerks Merchant Agreement',
            text, attachments,
          })
          if (error) console.error(`[merchant/agreement] copy to ${recipient} failed:`, error)
        }
      } catch (err) {
        console.error('[merchant/agreement] copies threw:', err)
      }
    })())
  }

  console.log(
    `[merchant/agreement] ${merchant.id} accepted ${version}`
    + `${alreadyAccepted ? ' (already recorded)' : ''}`
    + ` — activated=${activated}`,
  )

  return NextResponse.json({
    ok: true,
    alreadyAccepted,
    activated,
    // The page shows the "we're finishing setup" message on this.
    activationPending: activationFailed || (!activated && loaded.merchant.billing_status === PENDING_SIGNATURE),
    acceptedAt: inserted?.accepted_at ?? acceptance.acceptedAt,
  })
}
