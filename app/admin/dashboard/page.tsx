/**
 * /admin/dashboard
 *
 * Server component, so a non-admin can never render the dashboard at all.
 *
 * WHY THIS EXISTS: the dashboard used to gate itself in a client effect that
 * ran once on mount and set a flag. The browser holds a SINGLE Supabase
 * session, so signing into the merchant or member app replaces the admin one —
 * and the already-open dashboard kept rendering from that stale flag while
 * every /api/admin/* call came back 403. That is what surfaced as "forbidden"
 * on save and as an empty Members tab: not a broken route, a stale session.
 *
 * The gate here stops it at the door; adminFetch in AdminDashboard catches the
 * case where the session changes after the page is already open.
 */

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin-emails'
import AdminDashboard from './AdminDashboard'

export const dynamic = 'force-dynamic'

export default async function AdminDashboardPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Same allow-list the API routes check, so the page and its data cannot
  // disagree about who is an admin.
  if (!isAdminEmail(user?.email)) redirect('/admin/login')

  return <AdminDashboard />
}
