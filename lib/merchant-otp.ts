/**
 * Merchant sign-in code keys.
 *
 * Mirrors lib/member-otp.ts, with one deliberate difference: merchants are
 * keyed by email, members by phone. A merchant's stable identifier here is
 * owner_email — merchants have no phone column at all (see the note in
 * /api/merchant/login), so email is the only thing every merchant has.
 *
 * Redis keys, all expiring together:
 *   merchant_otp:{email}          → the 8-digit code
 *   merchant_token:{email}        → the Supabase hashed_token it unlocks
 *   merchant_authuser:{email}     → auth.users id the code should sign in
 *   merchant_otp_attempts:{email} → wrong-guess counter, cleared on each issue
 *
 * merchant_authuser exists for the same reason the member one does:
 * generateLink resolves by email and Supabase matches email
 * case-insensitively, so two auth.users rows differing only in case can hand
 * the token to the wrong identity. Recording the intended auth user lets
 * verify-code refuse rather than sign someone into the wrong account.
 */

/** Generic OTP primitives. They live in member-otp for historical reasons —
 *  nothing about them is member-specific. */
export { generateOtpCode, redisClient, OTP_TTL_SECONDS } from '@/lib/member-otp'

/**
 * Normalize an email into a Redis key segment.
 *
 * Lowercased so `Owner@Shop.com` and `owner@shop.com` cannot end up holding
 * two different live codes for the same account.
 */
export function normalizeMerchantEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function merchantOtpKeys(email: string) {
  const key = normalizeMerchantEmail(email)
  return {
    code:     `merchant_otp:${key}`,
    token:    `merchant_token:${key}`,
    authUser: `merchant_authuser:${key}`,
    attempts: `merchant_otp_attempts:${key}`,
  }
}
