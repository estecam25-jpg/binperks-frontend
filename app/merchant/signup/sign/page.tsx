/**
 * /merchant/signup/sign?session=<Stripe checkout session id>
 *
 * Where a merchant who has paid accepts the Merchant Agreement. This replaced
 * the embedded DocuSeal form: the agreement is now rendered in-app from the
 * versioned source, accepted with a typed name, title and tick, and recorded
 * in merchant_agreement_acceptances with a hash of the exact text shown.
 *
 * THE SESSION ID IS THE CREDENTIAL, as it was for the thank-you page before
 * it: a merchant who has just paid has no sign-in yet. It is verified with
 * Stripe server-side, never trusted as-is. A merchant who comes back later and
 * signs in reaches the same page without it, because the dashboard gate sends
 * them here and the API also accepts a merchant session.
 *
 * Deliberately thin: everything that decides what is shown lives in the API,
 * so the page cannot display one thing and hash another.
 */

import AcceptAgreement from './accept-agreement'

export const dynamic = 'force-dynamic'

export default async function MerchantSignPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { session } = await searchParams
  const checkoutSession = typeof session === 'string' ? session : null

  return <AcceptAgreement checkoutSession={checkoutSession} />
}
