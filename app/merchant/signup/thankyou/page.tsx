/**
 * /merchant/signup/thankyou
 *
 * Server component. Reads the Stripe checkout session named by ?session_id so
 * the page shows what the merchant was ACTUALLY charged, rather than a
 * list-price estimate — a FOUNDING100 merchant pays $0 for Implementation &
 * Launch and must not be told they paid $299.99.
 *
 * Merchant activation is handled asynchronously by the Stripe webhook at
 * /api/merchant/webhook. Nothing on this page grants access or changes state;
 * it is display only.
 */

import Stripe from 'stripe'
import ThankYouContent from './thankyou-content'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' })

export default async function MerchantThankYouPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { session_id: sessionIdParam } = await searchParams
  const sessionId = typeof sessionIdParam === 'string' ? sessionIdParam : null

  let chargedToday: number | null = null
  let locationCountFromStripe: number | null = null
  let discountApplied = false

  if (sessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId)

      if (typeof session.amount_total === 'number') {
        chargedToday = session.amount_total / 100
      }

      const metaCount = Number(session.metadata?.locationCount)
      if (Number.isFinite(metaCount) && metaCount > 0) {
        locationCountFromStripe = metaCount
      }

      discountApplied = (session.total_details?.amount_discount ?? 0) > 0
    } catch (err) {
      // Unknown or expired session_id — fall back to the list-price estimate
      // rather than failing the page. The merchant has already paid.
      console.error('[/merchant/signup/thankyou] Stripe session retrieve failed:', err)
    }
  }

  return (
    <ThankYouContent
      chargedToday={chargedToday}
      locationCountFromStripe={locationCountFromStripe}
      discountApplied={discountApplied}
    />
  )
}
