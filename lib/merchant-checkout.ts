/**
 * Stripe line items for a merchant platform checkout.
 *
 * Shared by /api/merchant/apply (first signup) and /api/merchant/resume-checkout
 * (abandoned signup). Those two routes used to carry identical copies of this
 * list, and both broke the same way when it was wrong.
 *
 * WHAT THE MERCHANT IS CHARGED
 *
 *   STRIPE_PRICE_IMPLEMENTATION  $200.00 setup fee, ONE-TIME     quantity 1
 *   STRIPE_PRICE_PLATFORM        $99.99/month, RECURRING         quantity 1
 *   STRIPE_PRICE_LOCATION        $49.99/month, RECURRING         quantity = locations - 1
 *
 *   Month 1 for one location = $200.00 + $99.99 = $299.99. $99.99/month after.
 *
 * WHY THE PLATFORM PRICE IS ALWAYS PRESENT
 *
 * Checkout runs in `subscription` mode, and Stripe refuses a subscription
 * checkout with no recurring price in it ("You must provide at least one
 * recurring price in `subscription` mode"). The old list sent only the one-time
 * setup fee for a single-location merchant — so every single-location signup
 * failed at Stripe. A one-time price is allowed alongside a recurring one: Stripe
 * adds it to the first invoice only.
 *
 * Test vs live is chosen by the secret key's prefix, matching the rest of the
 * merchant billing code.
 *
 * Returns null when any required price is unset, so callers can refuse BEFORE
 * they create anything rather than after.
 */

type LineItem = { price: string; quantity: number }

export function merchantCheckoutLineItems(locationCount: number): LineItem[] | null {
  const isTest = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test')

  const setupFee = isTest ? process.env.STRIPE_PRICE_IMPLEMENTATION_TEST : process.env.STRIPE_PRICE_IMPLEMENTATION
  const platform = isTest ? process.env.STRIPE_PRICE_PLATFORM_TEST       : process.env.STRIPE_PRICE_PLATFORM
  const location = isTest ? process.env.STRIPE_PRICE_LOCATION_TEST       : process.env.STRIPE_PRICE_LOCATION

  const count = Math.max(1, Math.floor(locationCount) || 1)
  const additional = count - 1

  if (!setupFee || !platform) return null
  if (additional > 0 && !location) return null

  return [
    { price: setupFee, quantity: 1 },
    { price: platform, quantity: 1 },
    ...(additional > 0 ? [{ price: location!, quantity: additional }] : []),
  ]
}
