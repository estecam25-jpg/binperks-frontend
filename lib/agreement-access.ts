/**
 * Who is allowed to see and accept an agreement — and how we know.
 *
 * SERVER ONLY.
 *
 * A merchant who has just paid HAS NO SESSION YET. The auth user is created at
 * payment, but nobody has signed in, so the acceptance page cannot rely on a
 * cookie. DocuSeal solved this with a bearer slug in the URL; this does the
 * same job with the credential the browser already holds — the Stripe checkout
 * session id from the success URL — which is checked with Stripe rather than
 * trusted, exactly as /api/merchant/signup/status already does.
 *
 * TWO WAYS IN, ON PURPOSE:
 *   checkout session   straight after paying, before any sign-in
 *   merchant session   signing in later and being sent to the agreement by
 *                      the dashboard gate
 * Both resolve to the same merchant, so the page works from either direction
 * and a merchant who closes the tab has lost nothing.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { findMerchantForRequest } from '@/lib/merchant-auth'
import { createMerchantFromCheckoutSession } from '@/lib/merchant-onboarding'

/** The shape Stripe checkout session ids take. Checked before any lookup so a
 *  junk value never reaches Stripe or the database. */
export function isCheckoutSessionId(v: unknown): v is string {
  return typeof v === 'string' && /^cs_(test_|live_)?[A-Za-z0-9]+$/.test(v)
}

export interface AgreementMerchant {
  id: string
  billing_status: string
}

/**
 * Resolve the merchant this request may act on, or null.
 *
 * The checkout session wins when present: it is the post-payment path, and it
 * also creates the merchant row if neither Stripe event has arrived yet — the
 * same idempotent step the webhook performs, so a slow webhook cannot strand
 * someone who has paid.
 */
export async function merchantForAgreementRequest(
  admin: SupabaseClient,
  checkoutSessionId?: string | null,
): Promise<AgreementMerchant | null> {
  if (isCheckoutSessionId(checkoutSessionId)) {
    try {
      const m = await createMerchantFromCheckoutSession(admin, checkoutSessionId)
      if (m) return { id: m.id, billing_status: m.billing_status }
    } catch (err) {
      // An unknown id, or Stripe unreachable. Fall through to the session —
      // a signed-in merchant with a stale link should still get their page.
      console.error('[agreement-access] checkout session lookup failed:', err)
    }
  }

  const m = await findMerchantForRequest<AgreementMerchant>('id, billing_status')
  return m ?? null
}
