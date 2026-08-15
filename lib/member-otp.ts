/**
 * Member sign-in codes.
 *
 * Shared by /api/member/login (returning member) and /api/join/create (member
 * who just enrolled), so both paths deliver the same 8-digit SMS code and both
 * are verified by /api/member/verify-code.
 *
 * Supabase's phone provider is OFF permanently — GHL/Twilio sends all member
 * SMS. So the Supabase side of auth is still a magic-link token minted against
 * the member's email; we simply never send that link anywhere. The 8-digit
 * code is our own handle for it, and the token itself never leaves the server.
 *
 * Redis keys, all keyed by phone and expiring together:
 *   member_otp:{phone}          → the 8-digit code
 *   member_token:{phone}        → the Supabase hashed_token it unlocks
 *   member_authuser:{phone}     → auth.users id the code is supposed to sign in
 *   member_otp_attempts:{phone} → wrong-guess counter, cleared on each issue
 *
 * Why member_authuser exists: generateLink resolves its target by email, and
 * Supabase matches email case-insensitively. If auth.users somehow holds two
 * rows whose emails differ only by case, generateLink can mint a token for the
 * wrong one — and the member then signs in as an identity with no members row,
 * which reads as an endless bounce back to the login screen. Recording the
 * intended auth user lets verify-code refuse that instead of looping.
 */

import { Redis } from '@upstash/redis'
import { randomInt } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { postToGhl } from '@/lib/ghl-webhook'

const APP_URL = 'https://app.binperks.com'

/** Same sender the merchant OTP uses. Overridable without a deploy; the
 *  default sits on feedback.binperks.com because that is currently the only
 *  Resend-verified sending domain. */
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'BinPerks <noreply@feedback.binperks.com>'

/** A member row can carry a blank or malformed email — it is collected at
 *  signup and never verified — and Resend rejects the whole send on a bad
 *  address. Checked here so a typo costs the email channel, not the SMS. */
function isSendableEmail(email: string | null | undefined): email is string {
  return !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

/** Code lifetime. Shorter than Supabase's own token expiry (~60 min) so the
 *  code is always the binding constraint. */
export const OTP_TTL_SECONDS = 10 * 60

export function otpKeys(phone: string) {
  return {
    code:     `member_otp:${phone}`,
    token:    `member_token:${phone}`,
    authUser: `member_authuser:${phone}`,
    attempts: `member_otp_attempts:${phone}`,
  }
}

export function redisClient(): Redis {
  return new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  })
}

/** 8-digit numeric code, 10000000–99999999. Uses crypto rather than
 *  Math.random() because this value is an authentication credential. */
export function generateOtpCode(): string {
  return randomInt(10_000_000, 100_000_000).toString()
}

interface IssueParams {
  /** Admin Supabase client — generateLink requires the service role. */
  admin: SupabaseClient
  memberId: string
  /** 10 digits, already normalized. */
  phone: string
  firstName: string
  email: string
  /** auth.users id this member is linked to. Recorded so verify-code can
   *  confirm the session it just created belongs to the right identity. */
  authUserId: string | null
  /** Reuse the caller's client when it already has one. */
  redis?: Redis
}

type IssueResult =
  | { ok: true; sentEmail: boolean }
  | { ok: false; reason: 'generate_link_failed' | 'redis_failed' }

/**
 * Mint a sign-in code, store it, and deliver it by SMS (GHL) and email
 * (Resend). Both carry the same code; whichever arrives first works.
 *
 * Neither delivery failure is fatal: the code is already valid in Redis, so a
 * member who misses one channel can use the other rather than be told the
 * whole sign-in failed. A Redis failure IS fatal — without it there is no code
 * to verify against.
 */
export async function issueMemberOtp(params: IssueParams): Promise<IssueResult> {
  const { admin, memberId, phone, firstName, email, authUserId } = params
  const redis = params.redis ?? redisClient()
  const keys = otpKeys(phone)

  // Lowercased because that is the only form we ever write to auth.users, and
  // matching what is stored keeps generateLink's case-insensitive lookup from
  // having to disambiguate.
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: email.trim().toLowerCase(),
    options: { redirectTo: `${APP_URL}/auth/callback?next=/member/dashboard` },
  })

  if (linkError || !linkData) {
    console.error('[member-otp] generateLink error:', linkError)
    return { ok: false, reason: 'generate_link_failed' }
  }

  const code = generateOtpCode()
  try {
    await Promise.all([
      redis.set(keys.code, code, { ex: OTP_TTL_SECONDS }),
      redis.set(keys.token, linkData.properties.hashed_token, { ex: OTP_TTL_SECONDS }),
      // Written only when known. An absent key means "cannot check", which
      // verify-code treats as pass — an older member row with no auth_user_id
      // must not be locked out by a guard meant for duplicate identities.
      authUserId
        ? redis.set(keys.authUser, authUserId, { ex: OTP_TTL_SECONDS })
        : redis.del(keys.authUser),
      redis.del(keys.attempts),
    ])
  } catch (err) {
    console.error('[member-otp] Redis write error:', err)
    return { ok: false, reason: 'redis_failed' }
  }

  // ── SMS (GHL → Twilio) ────────────────────────────────────────────────────
  // GHL template: "Your BinPerks sign-in code is: {{code}}. Expires in 10 minutes."
  //
  // Awaited so Vercel can't freeze the instance out from under the request —
  // dropping this means the member never receives a code. postToGhl bounds it
  // at 5s, which the raw fetch here did not: a hung GHL could previously hold
  // the function open until Vercel's own limit killed the login outright.
  const ghlWebhook = process.env.GHL_MAGIC_LINK_WEBHOOK_URL
  if (ghlWebhook) {
    await postToGhl(ghlWebhook, { memberId, phone, firstName, code }, 'member-otp')
  }

  // ── Email (Resend) ────────────────────────────────────────────────────────
  // A second delivery channel for the SAME code, matching the merchant flow.
  // Never fatal: the code is already valid in Redis and the SMS has already
  // gone out, so a member with a stale address on file still signs in by text.
  // A member with no usable email simply skips this, silently by design.
  let sentEmail = false
  if (isSendableEmail(email) && process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const { error: sendError } = await resend.emails.send({
        from: FROM_EMAIL,
        to: email.trim(),
        subject: 'Your BinPerks sign-in code',
        text: `Your BinPerks sign-in code is: ${code}. Expires in 10 minutes.`,
      })
      if (sendError) console.error('[member-otp] Resend error:', sendError)
      else sentEmail = true
    } catch (err) {
      console.error('[member-otp] Resend threw:', err)
    }
  }

  return { ok: true, sentEmail }
}
