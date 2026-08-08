/**
 * POST /api/admin/login
 *
 * Step 1 of admin sign-in. Replaces the previous client-side
 * supabase.auth.signInWithOtp() call, which sent a Supabase magic link and
 * left both the code and the email template outside our control. We now mint
 * our own 8-digit code, keep the Supabase magic-link token server-side, and
 * deliver the code by Resend. Email only — there is no admin phone anywhere in
 * the schema.
 *
 * ON SUPABASE EMAIL BRANDING: nothing in this file touches how a Supabase
 * email looks, and it should not. Supabase's own templates (magic link,
 * confirmation, recovery) are edited in the Supabase dashboard under
 * Authentication → Email Templates — not in code, and not through the API.
 * This route bypasses those templates entirely: it sends its own message
 * through Resend, so the copy below is the one an admin actually receives. The
 * Supabase templates still matter for any flow that has not been migrated.
 *
 * WHY THE ALLOW-LIST CHECK COMES FIRST: generateLink({ type: 'magiclink' })
 * CREATES the auth user when none exists — verified against this project, it
 * does not fail on an unknown address. Without the gate this endpoint would
 * let anyone mint auth.users rows at will. Gating first also means the three
 * admin addresses that have no auth row yet are created on their first sign-in
 * with no special-casing.
 *
 * Request body: { email: string }
 *
 * Responses:
 *   200 { ok: true }
 *   400 { error: 'invalid_email' }
 *   403 { error: 'not_admin' }    — address is not on the allow-list
 *   429 { error: string }         — rate limited
 *   500 { error: 'send_failed' }  — code minted but the email did not go out
 */

import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { isAdminEmail } from '@/lib/admin-emails'
import {
  adminOtpKeys,
  normalizeAdminEmail,
  generateOtpCode,
  redisClient,
  OTP_TTL_SECONDS,
} from '@/lib/admin-otp'

const APP_URL = 'https://app.binperks.com'

/** Overridable without a deploy. The default sits on feedback.binperks.com
 *  because that is currently the only Resend-verified sending domain. */
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'BinPerks <noreply@feedback.binperks.com>'

/** Same budget as the merchant and member flows: covers the first send plus
 *  resends without turning this into a free email cannon. */
const MAX_SENDS_PER_WINDOW = 5
const RATE_LIMIT_WINDOW_SECONDS = 15 * 60

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null) as { email?: string } | null
    const email = normalizeAdminEmail(body?.email ?? '')

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
    }

    // Gate before anything else — see the generateLink note above.
    //
    // This is deliberately explicit rather than a silent 200. God Mode is a
    // fixed four-address list, not a public sign-up, so an admin who typo'd
    // their address should be told. It does leak whether an address is an
    // admin; that is a worse trade for a consumer login than it is here, and
    // an attacker who already guessed the address still cannot read the code.
    if (!isAdminEmail(email)) {
      return NextResponse.json({ error: 'not_admin' }, { status: 403 })
    }

    const redis = redisClient()

    const rateLimitKey = `ratelimit:admin_login:${email}`
    const sends = await redis.incr(rateLimitKey)
    if (sends === 1) await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW_SECONDS)
    if (sends > MAX_SENDS_PER_WINDOW) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait 15 minutes before requesting a new sign-in code.' },
        { status: 429 }
      )
    }

    // Public endpoint (no session yet), so this uses the admin client —
    // generateLink requires the service role regardless (CLAUDE.md RLS rule).
    const admin = createAdminSupabaseClient()

    // The Supabase side of auth is still a magic-link token; we simply never
    // send the link. The 8-digit code is our own handle for it, and the token
    // never leaves the server.
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `${APP_URL}/auth/callback?next=/admin/dashboard` },
    })

    if (linkError || !linkData) {
      console.error('[/api/admin/login] generateLink error:', linkError)
      return NextResponse.json({ error: 'send_failed' }, { status: 500 })
    }

    const code = generateOtpCode()
    const keys = adminOtpKeys(email)
    const authUserId = linkData.user?.id ?? null

    try {
      await Promise.all([
        redis.set(keys.code, code, { ex: OTP_TTL_SECONDS }),
        redis.set(keys.token, linkData.properties.hashed_token, { ex: OTP_TTL_SECONDS }),
        authUserId
          ? redis.set(keys.authUser, authUserId, { ex: OTP_TTL_SECONDS })
          : redis.del(keys.authUser),
        redis.del(keys.attempts),
      ])
    } catch (err) {
      // Fatal: with no stored code there is nothing for verify-code to check.
      console.error('[/api/admin/login] Redis write error:', err)
      return NextResponse.json({ error: 'send_failed' }, { status: 500 })
    }

    // Email is the only channel, so this is awaited and its failure is fatal —
    // there is nothing to fall back to.
    if (!process.env.RESEND_API_KEY) {
      console.error('[/api/admin/login] RESEND_API_KEY not configured')
      return NextResponse.json({ error: 'send_failed' }, { status: 500 })
    }

    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const { error: sendError } = await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject: 'Your BinPerks admin sign-in code',
        text: `Your admin sign-in code is: ${code}. Expires in 10 minutes.`,
      })
      if (sendError) {
        console.error('[/api/admin/login] Resend error:', sendError)
        return NextResponse.json({ error: 'send_failed' }, { status: 500 })
      }
    } catch (err) {
      console.error('[/api/admin/login] Resend threw:', err)
      return NextResponse.json({ error: 'send_failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error('[/api/admin/login] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
