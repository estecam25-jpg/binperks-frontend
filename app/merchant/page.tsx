/**
 * merchant.binperks.com/ — the merchant front door.
 *
 * The subdomain's `/` rewrites here (lib/pwa-manifest homePath), so this one
 * route decides what a visitor to merchant.binperks.com sees:
 *
 *   signed in as a merchant  → their dashboard, as before
 *   anyone else              → the landing page
 *
 * IT USED TO REWRITE STRAIGHT TO THE DASHBOARD, which bounced every signed-out
 * visitor to a login form. That is the right answer for a merchant returning to
 * work and the wrong one for a store owner who just typed the domain off a
 * business card — the address is now the marketing front door as well as the
 * app, and only the session can tell those two people apart.
 *
 * Server component, so the decision happens before anything renders and a
 * signed-in merchant never sees a flash of the sales page.
 *
 * The dashboard keeps its own gate. This is a convenience, not the security
 * boundary: if the session here is somehow wrong, /merchant/dashboard still
 * checks for itself.
 */

import { redirect } from 'next/navigation'
import { findMerchantForRequest } from '@/lib/merchant-auth'
import MerchantLanding from './MerchantLanding'
import { merchantLandingMetadata } from './landing-metadata'

export const metadata = merchantLandingMetadata

export const dynamic = 'force-dynamic'

export default async function MerchantHomePage() {
  // Never throws on a signed-out visitor — it returns null, which is the
  // ordinary case here rather than an error.
  const merchant = await findMerchantForRequest<{ id: string }>('id')
  if (merchant) redirect('/merchant/dashboard')

  return <MerchantLanding />
}
