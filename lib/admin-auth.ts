import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * Admin allow-list.
 *
 * ADMIN_EMAILS (comma-separated) overrides the built-in list when set, so a
 * second admin can be added in Vercel without a deploy. Falls back to the
 * historical single address used by the existing /api/admin/* routes, so
 * behaviour is unchanged if the env var is absent.
 */
const FALLBACK_ADMIN_EMAILS = ['enina@estecam.com']

function adminEmails(): string[] {
  const fromEnv = process.env.ADMIN_EMAILS
  if (!fromEnv) return FALLBACK_ADMIN_EMAILS
  const parsed = fromEnv.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  return parsed.length > 0 ? parsed : FALLBACK_ADMIN_EMAILS
}

/**
 * Returns the signed-in admin's email, or null if the caller is not an admin.
 *
 * Uses the server client (session cookie) for identity only. Every table read
 * or write in the calling route must still use the admin client — see CLAUDE.md
 * CRITICAL RLS RULE.
 */
export async function verifyAdmin(): Promise<string | null> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const email = user?.email?.toLowerCase()
  if (!email) return null
  return adminEmails().includes(email) ? email : null
}
