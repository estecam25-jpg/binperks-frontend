/**
 * /admin/login
 *
 * Server component, so the "already signed in" decision happens before
 * anything paints.
 *
 * THE LOOP THIS FIXES: the old client effect redirected to the dashboard
 * whenever ANY Supabase session existed, but the dashboard checks the email
 * against the admin allow-list and bounces anyone else back here. A merchant
 * or member with a live session — signing in as a merchant and then opening
 * an admin link — ping-ponged between the two pages.
 *
 * The session alone is not the question; being an ADMIN is. A non-admin
 * session now simply sees the login form.
 */

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin-emails'
import AdminLoginForm from './LoginForm'

export const dynamic = 'force-dynamic'

export default async function AdminLoginPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (isAdminEmail(user?.email)) redirect('/admin/dashboard')

  return <AdminLoginForm />
}
