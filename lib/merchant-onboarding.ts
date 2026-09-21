/**
 * Merchant onboarding: payment → merchant record → DocuSeal signing →
 * activation.
 *
 * SERVER ONLY — takes the service-role client, calls Stripe and DocuSeal.
 *
 * ── The order of things ────────────────────────────────────────────────────
 *   1. /api/merchant/apply     validates the form, opens a Stripe checkout.
 *                              Writes NOTHING to the database — an application
 *                              that is never paid for leaves no merchant behind.
 *                              The form travels in the checkout's metadata.
 *   2. payment                 createMerchantAfterPayment() writes the merchant
 *                              and store rows, billing_status 'pending_signature'.
 *   3. ensureDocusealSubmission() opens the merchant's signing session.
 *   4. /merchant/signup/sign   the merchant signs in-app.
 *   5. activateAfterSignature() makes them live.
 *
 * ── Why several callers, each able to finish the job ───────────────────────
 * Step 2 runs from checkout.session.completed, customer.subscription.created
 * AND the thank-you page. Stripe does not promise which event comes first, and
 * this endpoint has previously gone months receiving only one of them. The
 * page is there because the browser holds proof of payment (its checkout
 * session id) the moment Stripe sends it back, which may be before either
 * event. A unique index on merchants.stripe_customer_id means whichever arrives
 * first writes the row and the rest find it.
 *
 * Step 5 runs from the DocuSeal webhook AND the signing page's onComplete. The
 * page never vouches for the signature itself — the server asks DocuSeal. It
 * exists because the webhook is the single thing standing between a merchant
 * who has paid and signed and their dashboard, and until 2026-09-21 it rejected
 * every request DocuSeal sent (it verified the signature in the wrong format).
 * One path failing must not strand anyone.
 *
 * ── Idempotency ────────────────────────────────────────────────────────────
 *   merchant row        unique stripe_customer_id; the loser re-reads
 *   DocuSeal submission docuseal_requested_at claimed with a compare-and-set
 *   activation          billing_status pending_signature → active, claimed the
 *                       same way; only the winner sends notices
 */

import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { postToGhl } from '@/lib/ghl-webhook'

type Admin = SupabaseClient

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' })

/** Status of a merchant who has paid but not yet signed. Gates the dashboard. */
export const PENDING_SIGNATURE = 'pending_signature'

/** Marks a checkout as a merchant signup, as opposed to a member VIP checkout,
 *  which reaches the same Stripe account and the same events. */
export const MERCHANT_SIGNUP_TYPE = 'merchant_signup'

/** Overridable only so tests can stand in for DocuSeal; production never sets it. */
const DOCUSEAL_API = process.env.DOCUSEAL_API_URL || 'https://api.docuseal.com'
const DOCUSEAL_FORM_HOST = 'https://docuseal.com'

/** Where the internal "new merchant" alert goes. */
const ALERT_TO = 'support@binperks.com'
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'BinPerks <noreply@feedback.binperks.com>'

// ── The signup form, carried through Stripe ─────────────────────────────────

/** What /api/merchant/apply collects and the payment step needs. */
export interface SignupForm {
  firstName: string
  lastName: string
  email: string
  phone: string
  companyName: string
  storeName: string
  address: string
  city: string
  state: string
  zip: string
  locationCount: number
  binCount: number | null
}

/**
 * The form as Stripe metadata: strings only, each under Stripe's 500-character
 * limit. Put on BOTH the checkout session and the subscription, because the two
 * events that can create the merchant each see only their own object.
 */
export function signupMetadata(form: SignupForm): Record<string, string> {
  const s = (v: unknown) => String(v ?? '').slice(0, 500)
  return {
    type:          MERCHANT_SIGNUP_TYPE,
    firstName:     s(form.firstName),
    lastName:      s(form.lastName),
    email:         s(form.email),
    phone:         s(form.phone),
    companyName:   s(form.companyName),
    storeName:     s(form.storeName),
    address:       s(form.address),
    city:          s(form.city),
    state:         s(form.state),
    zip:           s(form.zip),
    locationCount: String(form.locationCount),
    binCount:      form.binCount == null ? '' : String(form.binCount),
  }
}

function formFromMetadata(m: Stripe.Metadata | null | undefined): SignupForm | null {
  if (!m || m.type !== MERCHANT_SIGNUP_TYPE) return null
  if (!m.email || !m.companyName || !m.storeName) return null
  return {
    firstName:     m.firstName ?? '',
    lastName:      m.lastName ?? '',
    email:         m.email.toLowerCase().trim(),
    phone:         m.phone ?? '',
    companyName:   m.companyName.trim(),
    storeName:     m.storeName.trim(),
    address:       m.address ?? '',
    city:          m.city ?? '',
    state:         m.state ?? '',
    zip:           m.zip ?? '',
    locationCount: Math.max(1, Number(m.locationCount) || 1),
    binCount:      m.binCount ? Number(m.binCount) : null,
  }
}

/** STATE-City-StoreName, no spaces — the /join/[storeKey] slug. BinPerks admin
 *  reviews it during provisioning. Unchanged from the apply route. */
function canonicalKeyFor(form: SignupForm): string {
  return [
    form.state.toUpperCase(),
    form.city.replace(/\s+/g, ''),
    form.storeName.replace(/\s+/g, ''),
  ].join('-')
}

// ── Step 2: the merchant record ─────────────────────────────────────────────

export interface MerchantRef {
  id: string
  billing_status: string
  docuseal_slug: string | null
}

const REF_COLUMNS = 'id, billing_status, docuseal_slug'

/**
 * Writes the merchant and store rows for a paid checkout, once.
 *
 * Returns the merchant, whether this call wrote it or found it already there.
 * Returns null when there is nothing to create: not a merchant signup, or a
 * subscription that is not paid yet.
 *
 * EXISTING MERCHANTS ARE LEFT ALONE unless they are mid-signup. A row created
 * by the previous version of the apply route (billing_status 'pending', paid
 * for after this change shipped) is moved to pending_signature so it signs like
 * everyone else. Anything past that — active, in a grace period, cancelled — is
 * returned untouched: a payment is not a signature, and no one is activated or
 * reactivated here.
 */
export async function createMerchantAfterPayment(
  admin: Admin,
  args: {
    customerId: string
    subscriptionId: string | null
    checkoutSessionId: string | null
    metadata: Stripe.Metadata | null | undefined
  },
): Promise<MerchantRef | null> {
  const { customerId, subscriptionId, checkoutSessionId } = args

  // Already there? One merchant per Stripe customer.
  const { data: existing } = await admin
    .from('merchants').select(REF_COLUMNS).eq('stripe_customer_id', customerId).maybeSingle()
  if (existing) return adoptLegacyPending(admin, existing as MerchantRef, subscriptionId, checkoutSessionId)

  // A checkout opened by the OLD apply route carries a merchantId instead of
  // the form — its row already exists.
  if (args.metadata?.merchantId) {
    const { data: legacy } = await admin
      .from('merchants').select(REF_COLUMNS).eq('id', args.metadata.merchantId).maybeSingle()
    if (legacy) return adoptLegacyPending(admin, legacy as MerchantRef, subscriptionId, checkoutSessionId)
  }

  const form = formFromMetadata(args.metadata)
  if (!form) return null   // a member VIP checkout, or something else entirely

  // Auth user for dashboard sign-in. An email already registered (a re-apply,
  // or someone who is also a member) leaves auth_user_id null; lib/merchant-auth
  // resolves by owner_email at sign-in and repairs it. Same as the old apply.
  let authUserId: string | null = null
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: form.email, email_confirm: true,
  })
  if (authData?.user?.id) authUserId = authData.user.id
  else if (authError && !authError.message.toLowerCase().includes('already')) {
    console.error('[merchant-onboarding] auth user create failed:', authError)
  }

  const now = new Date().toISOString()
  const ownerName = `${form.firstName} ${form.lastName}`.trim()

  const { data: merchant, error: insertError } = await admin
    .from('merchants')
    .insert({
      auth_user_id:               authUserId,
      owner_email:                form.email,
      owner_name:                 ownerName || null,
      phone:                      form.phone ? form.phone.replace(/\D/g, '') || null : null,
      company_name:               form.companyName,
      name:                       form.companyName,
      stripe_customer_id:         customerId,
      stripe_subscription_id:     subscriptionId,
      stripe_checkout_session_id: checkoutSessionId,
      // PAID, NOT LIVE. The column defaults to 'active', so this must be
      // explicit — the whole point is that no one is live before signing.
      subscription_status:        'active',
      billing_status:             PENDING_SIGNATURE,
      plan:                       'standard',
      location_count:             form.locationCount,
      commission_eligible:        false,
      implementation_fee_paid:    true,
      implementation_fee_paid_at: now,
      created_at:                 now,
    })
    .select(REF_COLUMNS)
    .single()

  if (insertError) {
    // Another caller wrote this customer's row a moment ago. Theirs stands.
    if (insertError.code === '23505') {
      const { data: winner } = await admin
        .from('merchants').select(REF_COLUMNS).eq('stripe_customer_id', customerId).maybeSingle()
      return (winner as MerchantRef) ?? null
    }
    throw new Error(`merchant insert failed: ${insertError.message}`)
  }

  const { error: storeError } = await admin.from('stores').insert({
    merchant_id:       merchant.id,
    canonical_key:     canonicalKeyFor(form),
    brand_name:        form.storeName,
    display_name:      form.storeName,
    address:           form.address.trim(),
    city:              form.city.trim(),
    state:             form.state.trim().toUpperCase(),
    zip:               form.zip.trim(),
    timezone:          'America/New_York',
    brand_color:       '#4A4B98',
    fiscal_week_start: 'friday',
    bin_count:         form.binCount,
    // Not live, not listed, not enrolling until the agreement is signed.
    is_active:          false,
    network_visible:    false,
    enrollment_enabled: false,
    created_at:         now,
  })
  if (storeError) {
    // The merchant exists and has paid; a missing store is fixable by admin
    // and must not make Stripe retry into a second merchant.
    console.error(`[merchant-onboarding] store insert failed for merchant ${merchant.id}:`, storeError)
  }

  console.log(`[merchant-onboarding] merchant ${merchant.id} created after payment (customer ${customerId})`)
  return merchant as MerchantRef
}

/** A merchant from the old flow ('pending', paid for now) joins the new one. */
async function adoptLegacyPending(
  admin: Admin,
  m: MerchantRef,
  subscriptionId: string | null,
  checkoutSessionId: string | null,
): Promise<MerchantRef> {
  if (m.billing_status !== 'pending') return m
  const { data } = await admin
    .from('merchants')
    .update({
      billing_status:             PENDING_SIGNATURE,
      subscription_status:        'active',
      stripe_subscription_id:     subscriptionId,
      stripe_checkout_session_id: checkoutSessionId,
      implementation_fee_paid:    true,
      implementation_fee_paid_at: new Date().toISOString(),
    })
    .eq('id', m.id)
    .eq('billing_status', 'pending')
    .select(REF_COLUMNS)
    .maybeSingle()
  return (data as MerchantRef) ?? m
}

/**
 * The same, starting from a Stripe checkout session id — what the thank-you
 * page holds. Verified with Stripe, never taken on the browser's word: the
 * session must be complete and paid (or free, for a fully discounted
 * checkout).
 */
export async function createMerchantFromCheckoutSession(
  admin: Admin,
  checkoutSessionId: string,
): Promise<MerchantRef | null> {
  const session = await stripe.checkout.sessions.retrieve(checkoutSessionId)
  if (session.status !== 'complete') return null
  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') return null

  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
  if (!customerId) return null
  const subscriptionId = typeof session.subscription === 'string'
    ? session.subscription : session.subscription?.id ?? null

  return createMerchantAfterPayment(admin, {
    customerId, subscriptionId, checkoutSessionId: session.id, metadata: session.metadata,
  })
}

// ── Step 3: the DocuSeal signing session ────────────────────────────────────

/** The in-app signing page for a slug. */
export function signPagePath(slug: string): string {
  return `/merchant/signup/sign?session=${encodeURIComponent(slug)}`
}

/** The DocuSeal form the signing page embeds. */
export function docusealFormUrl(slug: string): string {
  return `${DOCUSEAL_FORM_HOST}/s/${encodeURIComponent(slug)}`
}

async function docuseal<T>(path: string, init?: RequestInit): Promise<T> {
  const key = process.env.DOCUSEAL_API_KEY
  if (!key) throw new Error('DOCUSEAL_API_KEY is not set')
  const res = await fetch(`${DOCUSEAL_API}${path}`, {
    ...init,
    headers: { 'X-Auth-Token': key, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`DocuSeal ${init?.method ?? 'GET'} ${path} → ${res.status} ${body.slice(0, 300)}`)
  }
  return res.json() as Promise<T>
}

interface DocusealTemplate {
  submitters?: { name?: string; uuid?: string }[]
  fields?: { name?: string; submitter_uuid?: string }[]
}

interface DocusealSubmitter {
  id: number
  submission_id: number
  slug: string
  status?: string
  external_id?: string | null
  email?: string
  role?: string
}

/**
 * Which template fields to pre-fill, by NAME — only names the template really
 * has. DocuSeal is sent nothing it does not recognise, and a field the
 * template does not have is simply skipped rather than guessed at.
 */
const PREFILL: { names: string[]; value: (f: PrefillSource) => string }[] = [
  { names: ['legal business name', 'business name', 'company name', 'company', 'legal name', 'merchant legal name'],
    value: f => f.companyName },
  { names: ['store name', 'dba', 'doing business as', 'store name (dba)'],
    value: f => f.storeName },
  { names: ['name', 'full name', 'owner name', 'merchant name', 'signer name', 'printed name'],
    value: f => f.ownerName },
  { names: ['email', 'email address', 'owner email'],
    value: f => f.email },
]

interface PrefillSource { companyName: string; storeName: string; ownerName: string; email: string }

/**
 * Opens this merchant's DocuSeal signing session, once. Returns the slug, or
 * null if it could not be opened this time — every caller can try again, and
 * the thank-you page does, until it works.
 */
export async function ensureDocusealSubmission(admin: Admin, merchantId: string): Promise<string | null> {
  const { data: m } = await admin
    .from('merchants')
    .select('id, owner_email, owner_name, company_name, billing_status, docuseal_slug, docuseal_requested_at')
    .eq('id', merchantId)
    .single()
  if (!m) return null
  if (m.docuseal_slug) return m.docuseal_slug as string
  if (m.billing_status !== PENDING_SIGNATURE) return null

  // Claim. A claim older than two minutes is treated as abandoned — a caller
  // that died mid-request must not lock the merchant out of signing for good.
  const now = new Date()
  const stale = new Date(now.getTime() - 2 * 60_000).toISOString()
  const { data: claimed } = await admin
    .from('merchants')
    .update({ docuseal_requested_at: now.toISOString() })
    .eq('id', merchantId)
    .is('docuseal_slug', null)
    .or(`docuseal_requested_at.is.null,docuseal_requested_at.lt."${stale}"`)
    .select('id')
  if (!claimed || claimed.length === 0) return null   // someone else is on it

  try {
    const templateId = Number(process.env.DOCUSEAL_TEMPLATE_ID)
    if (!templateId) throw new Error('DOCUSEAL_TEMPLATE_ID is not set')

    const { data: store } = await admin
      .from('stores').select('display_name').eq('merchant_id', merchantId)
      .order('created_at', { ascending: true }).limit(1).maybeSingle()

    const source: PrefillSource = {
      companyName: (m.company_name as string) ?? '',
      storeName:   (store?.display_name as string) ?? '',
      ownerName:   (m.owner_name as string) ?? '',
      email:       (m.owner_email as string) ?? '',
    }

    // The template decides the role name and which fields exist. Read it
    // rather than hard-coding either, so editing the template in DocuSeal
    // cannot silently break signups.
    //
    // BEST-EFFORT. It only chooses the role and the pre-fill; if it cannot be
    // read, the submission goes without them (DocuSeal assigns the template's
    // first role) rather than leaving a merchant who has paid unable to sign.
    let template: DocusealTemplate = {}
    try {
      template = await docuseal<DocusealTemplate>(`/templates/${templateId}`)
    } catch (err) {
      console.warn(`[merchant-onboarding] template ${templateId} not readable; submitting without role/pre-fill:`, err)
    }
    const role = template.submitters?.[0]?.name
    const roleUuid = template.submitters?.[0]?.uuid
    const fieldNames = new Map<string, string>()   // lowercased → actual
    for (const f of template.fields ?? []) {
      if (!f.name) continue
      if (roleUuid && f.submitter_uuid && f.submitter_uuid !== roleUuid) continue
      fieldNames.set(f.name.toLowerCase().trim(), f.name)
    }
    const values: Record<string, string> = {}
    for (const rule of PREFILL) {
      const hit = rule.names.map(n => fieldNames.get(n)).find(Boolean)
      const v = rule.value(source)
      if (hit && v) values[hit] = v
    }

    const created = await docuseal<DocusealSubmitter[] | { submitters?: DocusealSubmitter[] }>('/submissions', {
      method: 'POST',
      body: JSON.stringify({
        template_id: templateId,
        // Signed in the app, not from an emailed link.
        send_email: false,
        submitters: [{
          ...(role ? { role } : {}),
          email:       source.email,
          name:        source.ownerName || undefined,
          // Echoed back in every DocuSeal webhook — the most direct way to
          // find this merchant again when they have signed.
          external_id: merchantId,
          ...(Object.keys(values).length ? { values } : {}),
        }],
      }),
    })

    const submitter = Array.isArray(created) ? created[0] : created.submitters?.[0]
    if (!submitter?.slug) throw new Error('DocuSeal returned no submitter slug')

    await admin
      .from('merchants')
      .update({
        docuseal_slug:          submitter.slug,
        docuseal_submission_id: submitter.submission_id ?? null,
        docuseal_submitter_id:  submitter.id ?? null,
      })
      .eq('id', merchantId)

    console.log(`[merchant-onboarding] DocuSeal submission ${submitter.submission_id} for merchant ${merchantId}; prefilled: ${Object.keys(values).join(', ') || 'none'}`)
    return submitter.slug
  } catch (err) {
    // Release the claim so the next caller can try.
    await admin.from('merchants').update({ docuseal_requested_at: null }).eq('id', merchantId).is('docuseal_slug', null)
    console.error(`[merchant-onboarding] DocuSeal submission failed for merchant ${merchantId}:`, err)
    return null
  }
}

/** Asks DocuSeal — the authority — whether this merchant's signer has signed. */
export async function hasSignedWithDocuseal(submitterId: number): Promise<boolean> {
  const s = await docuseal<{ status?: string; completed_at?: string | null }>(`/submitters/${submitterId}`)
  return s.status === 'completed' || !!s.completed_at
}

// ── Step 5: activation ──────────────────────────────────────────────────────

/**
 * Makes a signed merchant live. Returns true only for the call that actually
 * activated them — that one sends the notices; every other call is a no-op.
 *
 * Only ever moves a merchant OUT OF pending_signature. A signature webhook for
 * a merchant who is already active (a DocuSeal retry, or one of the merchants
 * who signed before this flow existed) records the signature on the store and
 * changes nothing else.
 */
export async function activateAfterSignature(
  admin: Admin,
  merchantId: string,
  trigger: 'docuseal_webhook' | 'signing_page',
): Promise<boolean> {
  const now = new Date().toISOString()

  // The signature itself is worth recording in every case.
  await admin.from('stores')
    .update({ agreement_signed_at: now })
    .eq('merchant_id', merchantId)
    .is('agreement_signed_at', null)

  // Claim: pending_signature → active, once.
  const { data: won } = await admin
    .from('merchants')
    .update({ billing_status: 'active', subscription_status: 'active' })
    .eq('id', merchantId)
    .eq('billing_status', PENDING_SIGNATURE)
    .select('id')
  if (!won || won.length === 0) return false

  await admin.from('stores')
    .update({ is_active: true, network_visible: true, enrollment_enabled: true })
    .eq('merchant_id', merchantId)

  // Commission eligibility — never over an admin suspension, and the history
  // row only for the call that actually flipped it.
  const { data: flipped } = await admin
    .from('merchants')
    .update({ commission_eligible: true, commission_eligible_from: now })
    .eq('id', merchantId)
    .not('admin_suspended', 'is', true)
    .or('commission_eligible.is.null,commission_eligible.eq.false,commission_eligible_from.is.null')
    .select('id')
  if (flipped && flipped.length > 0) {
    // triggered_by is CHECK-constrained to stripe_webhook | admin_action |
    // system. Activation-on-signature is 'system'; which path did it goes in
    // the reason. Checked, not assumed — this is the audit trail for when a
    // merchant started earning commission.
    const { error: histError } = await admin.from('origin_eligibility_history').insert({
      merchant_id:         merchantId,
      event_type:          'activated',
      effective_at:        now,
      triggered_by:        'system',
      reason:              `Merchant Agreement signed (${trigger}) — merchant activated`,
      commission_eligible: true,
    })
    if (histError) console.error(`[merchant-onboarding] eligibility history insert failed for ${merchantId}:`, histError)
  }

  console.log(`[merchant-onboarding] merchant ${merchantId} activated after signature (${trigger})`)
  return true
}

/**
 * The two notices that follow activation: GHL's "BinPerks Merchant Activation"
 * workflow for the merchant, and an internal alert to support@. Never throws —
 * the merchant is already live, and a notice failing must not say otherwise.
 * The caller decides whether to wait for it.
 */
export async function sendActivationNotices(admin: Admin, merchantId: string): Promise<void> {
  try {
    const { data: m } = await admin
      .from('merchants')
      .select('owner_email, owner_name, company_name, location_count, stripe_subscription_id')
      .eq('id', merchantId).single()
    if (!m) return
    const { data: store } = await admin
      .from('stores').select('display_name').eq('merchant_id', merchantId)
      .order('created_at', { ascending: true }).limit(1).maybeSingle()

    let nextBillingDate: string | null = null
    if (m.stripe_subscription_id) {
      try {
        const sub = await stripe.subscriptions.retrieve(m.stripe_subscription_id as string)
        nextBillingDate = new Date(sub.current_period_end * 1000).toISOString()
      } catch { /* the payload goes without it */ }
    }

    // GHL — claimed on ghl_onboarding_sent_at so it goes once, released on
    // failure so a retry can send it. Same payload the workflow already expects.
    const ghlUrl = process.env.GHL_MERCHANT_ACTIVATED_WEBHOOK_URL
    if (ghlUrl) {
      const stamp = new Date().toISOString()
      const { data: claimed } = await admin
        .from('merchants').update({ ghl_onboarding_sent_at: stamp })
        .eq('id', merchantId).is('ghl_onboarding_sent_at', null).select('id')
      if (claimed && claimed.length > 0) {
        const delivered = await postToGhl(ghlUrl, {
          merchantId,
          merchantEmail:  m.owner_email ?? '',
          companyName:    m.company_name ?? '',
          subscriptionId: m.stripe_subscription_id ?? '',
          locationCount:  m.location_count ?? 1,
          nextBillingDate,
        }, 'merchant-onboarding activated')
        if (!delivered) {
          await admin.from('merchants').update({ ghl_onboarding_sent_at: null })
            .eq('id', merchantId).eq('ghl_onboarding_sent_at', stamp)
        }
      }
    } else {
      console.warn('[merchant-onboarding] GHL_MERCHANT_ACTIVATED_WEBHOOK_URL is not set — activation notice not sent')
    }

    // Internal alert.
    if (process.env.RESEND_API_KEY) {
      const name  = (m.owner_name as string) || '(no name given)'
      const shop  = (store?.display_name as string) || '(no store name)'
      const email = (m.owner_email as string) || '(no email)'
      const resend = new Resend(process.env.RESEND_API_KEY)
      const { error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: ALERT_TO,
        subject: `New merchant signed and activated: ${m.company_name ?? name}`,
        text:
          `New merchant signed and activated: ${name}, ${shop}, ${email}\n\n` +
          `Business: ${m.company_name ?? '—'}\n` +
          `Locations: ${m.location_count ?? 1}\n` +
          `Merchant ID: ${merchantId}\n`,
      })
      if (error) console.error('[merchant-onboarding] support alert failed:', error)
    } else {
      console.warn('[merchant-onboarding] RESEND_API_KEY is not set — support alert not sent')
    }
  } catch (err) {
    console.error(`[merchant-onboarding] activation notices failed for merchant ${merchantId}:`, err)
  }
}
