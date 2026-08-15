/**
 * /merchant/login
 *
 * Server component, so the "already signed in" check runs BEFORE anything
 * paints. A merchant with a live session is redirected to the dashboard
 * without ever seeing the form.
 *
 * This used to be a client component that probed getSession() in an effect,
 * which could only redirect after the page had already rendered — and its
 * Suspense boundary had no fallback, so the prerendered HTML was empty. The
 * combination is what produced a blank screen for a signed-in merchant.
 *
 * The session cookie alone is not enough to send someone to the dashboard:
 * it proves a Supabase identity, not that the identity is a merchant. An
 * admin or member session hitting this page must still see the login form
 * rather than be bounced to a dashboard that will reject them.
 */

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { findMerchantForRequest } from '@/lib/merchant-auth'
import MerchantLoginForm from './LoginForm'

export const dynamic = 'force-dynamic'

export default async function MerchantLoginPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    // Resolved through lib/merchant-auth so a stale merchants.auth_user_id
    // falls back to owner_email rather than stranding a real merchant here.
    const merchant = await findMerchantForRequest<{ id: string }>('id')
    if (merchant) redirect('/merchant/dashboard')
  }

  return <MerchantLoginForm />
}
