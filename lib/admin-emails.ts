/**
 * The BinPerks admin allow-list.
 *
 * Kept in its own module with no server-only imports so the client-side guard
 * on /admin/dashboard can share it with the server-side check in
 * lib/admin-auth. Before this existed the list was duplicated as a hardcoded
 * constant across six files, which is how they drifted apart.
 *
 * All entries MUST be lowercase — every comparison lowercases the session
 * email and matches against these verbatim.
 */
export const ADMIN_EMAIL_ALLOWLIST = [
  'binperksnetwork@gmail.com',
  'enina@binperks.com',
  'support@binperks.com',
  'admin@binperks.com',
] as const

/** Case-insensitive membership test. Accepts the raw session email. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return (ADMIN_EMAIL_ALLOWLIST as readonly string[]).includes(email.toLowerCase().trim())
}
