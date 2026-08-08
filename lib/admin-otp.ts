/**
 * Admin sign-in code keys.
 *
 * Mirrors lib/merchant-otp.ts — keyed by email, since an admin is identified
 * by their address on the allow-list and there is no admins table.
 *
 * Redis keys, all expiring together:
 *   admin_otp:{email}          → the 8-digit code
 *   admin_token:{email}        → the Supabase hashed_token it unlocks
 *   admin_authuser:{email}     → auth.users id the code should sign in
 *   admin_otp_attempts:{email} → wrong-guess counter, cleared on each issue
 *
 * admin_authuser exists for the same reason the merchant one does:
 * generateLink resolves by email and Supabase matches email
 * case-insensitively, so two auth.users rows differing only in case could hand
 * the token to the wrong identity. verify-code refuses on mismatch rather than
 * signing someone into an account they did not ask for.
 */

/** Generic OTP primitives. They live in member-otp for historical reasons —
 *  nothing about them is member-specific. */
export { generateOtpCode, redisClient, OTP_TTL_SECONDS } from '@/lib/member-otp'

/**
 * Normalize an email into a Redis key segment.
 *
 * Lowercased so `Admin@BinPerks.com` and `admin@binperks.com` cannot hold two
 * different live codes for the same account. Matches the normalisation the
 * allow-list check uses in lib/admin-emails.
 */
export function normalizeAdminEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function adminOtpKeys(email: string) {
  const key = normalizeAdminEmail(email)
  return {
    code:     `admin_otp:${key}`,
    token:    `admin_token:${key}`,
    authUser: `admin_authuser:${key}`,
    attempts: `admin_otp_attempts:${key}`,
  }
}
