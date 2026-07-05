/**
 * /merchant/join — Redirects to /merchant/signup.
 *
 * The home page links "For Merchants" here. This is a placeholder redirect
 * until a merchant-facing store finder or onboarding hub is needed.
 */

import { redirect } from 'next/navigation'

export default function MerchantJoinPage() {
  redirect('/merchant/signup')
}
