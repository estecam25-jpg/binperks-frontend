import { createServerSupabaseClient } from '@/lib/supabase-server'
import { ADMIN_EMAIL_ALLOWLIST } from '@/lib/admin-emails'

/**
 * Server-side admin check.
 *
 * The allow-list itself lives in lib/admin-emails so the client guard on
 * /admin/dashboard can share it — see that file.
 *
 * ADMIN_EMAILS (comma-separated) overrides the built-in list when set, so an
 * admin can be added in Vercel without a deploy.
 *
 * CAVEAT: the env override is server-side only. process.env.ADMIN_EMAILS is
 * not exposed to the browser, so an admin added that way passes every API
 * route but is bounced by the dashboard's client-side guard, which can only
 * see the built-in list. Add such an admin to lib/admin-emails too, or make
 * the var NEXT_PUBLIC_ if that ever becomes the primary mechanism.
 */
function adminEmails(): readonly string[] {
  const fromEnv = process.env.ADMIN_EMAILS
  if (!fromEnv) return ADMIN_EMAIL_ALLOWLIST
  const parsed = fromEnv.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  return parsed.length > 0 ? parsed : ADMIN_EMAIL_ALLOWLIST
}

/**
 * Returns the signed-in admin's email (lowercased), or null if the caller is
 * not an admin.
 *
 * Comparison is case-insensitive: Supabase stores the address as registered,
 * so an admin who signed up as Admin@BinPerks.com must still match.
 *
 * Uses the server client (session cookie) for identity only. Every table read
 * or write in the calling route must still use the admin client — see CLAUDE.md
 * CRITICAL RLS RULE.
 */
export async function verifyAdmin(): Promise<string | null> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const email = user?.email?.toLowerCase().trim()
  if (!email) return null
  return adminEmails().includes(email) ? email : null
}
