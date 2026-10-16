/**
 * /merchant/signup — the merchant landing page, at its original address.
 *
 * KEPT SO NOTHING BREAKS. This URL is on printed material and in old links,
 * and it is where the funnel has always started. On app.binperks.com the
 * middleware now sends it to merchant.binperks.com, which is the page's real
 * home; on merchant.binperks.com it renders here, unchanged.
 *
 * The page itself lives in app/merchant/MerchantLanding so this route and
 * merchant.binperks.com/ cannot drift apart — they are the same component.
 */

import MerchantLanding from '../MerchantLanding'

export default function MerchantSignupLandingPage() {
  return <MerchantLanding />
}
