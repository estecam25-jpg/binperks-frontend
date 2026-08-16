/**
 * Server-side session gate for every merchant dashboard route.
 *
 * A layout rather than a check inside the page: it covers any route added under
 * /merchant/dashboard without each one remembering, and it runs before anything
 * paints, so an expired session never shows a dashboard shell that then fails
 * every request behind it.
 *
 * The RETURN URL matters. A merchant whose session lapses mid-task is usually
 * deep in a tab with a location selected — /merchant/dashboard?tab=perks&store=…
 * Sending them to a bare dashboard after signing back in loses that place, so
 * the full path and query are handed to the login page and restored afterwards.
 */

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { findMerchantForRequest } from '@/lib/merchant-auth'

export const dynamic = 'force-dynamic'

export default async function MerchantDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  // A session alone is not enough: it proves a Supabase identity, not a
  // merchant. A member or admin session must land on the login form rather
  // than a dashboard that will reject every call it makes.
  const merchant = user
    ? await findMerchantForRequest<{ id: string }>('id')
    : null

  if (!merchant) {
    // Set by middleware.ts, which is the only place that can see the URL.
    // Falls back to the bare dashboard if the header is ever missing.
    const h = await headers()
    const path  = h.get('x-binperks-path') ?? '/merchant/dashboard'
    const query = h.get('x-binperks-query') ?? ''
    const target = `${path}${query}`
    redirect(`/merchant/login?return=${encodeURIComponent(target)}`)
  }

  return <>{children}</>
}
