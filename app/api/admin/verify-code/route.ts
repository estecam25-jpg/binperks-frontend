/**
 * POST /api/admin/verify-code
 *
 * Step 2 of admin sign-in. The admin types the 8-digit code delivered by
 * /api/admin/login; we compare it against Redis and redeem the Supabase
 * hashed_token stored alongside it. The token never reaches the browser.
 *
 * Both keys are deleted on success, so a code is strictly single-use.
 *
 * THE ALLOW-LIST IS CHECKED TWICE, on purpose:
 *   1. Before doing any work, against the submitted email — a non-admin should
 *      never reach the Redis lookup or a token redemption.
 *   2. After verifyOtp, against the email on the session that was actually
 *      created. That second check is the one that matters: generateLink
 *      resolves by email and Supabase matches case-insensitively, so the
 *      identity the token opens is not guaranteed to be the address that was
 *      typed. Re-checking the verified session closes the gap between "an
 *      allow-listed address asked for a code" and "an allow-listed account is
 *      now signed in".
 *
 * Request body: { email: string, code: string (8 digits) }
 *
 * Responses:
 *   200 { ok: true, redirectUrl: '/admin/dashboard' }
 *   400 { error: 'invalid_code' }        — wrong code, attempts remain
 *   403 { error: 'not_admin' }           — address is not on the allow-list
 *   409 { error: 'account_conflict' }    — code signed in the wrong auth identity
 *   410 { error: 'expired' }             — no live code for this email
 *   429 { error: 'too_many_attempts' }   — code burned, request a new one
 *   500 { error: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin-emails'
import { adminOtpKeys, normalizeAdminEmail, redisClient } from '@/lib/admin-otp'

/** Wrong guesses allowed before the code is burned. 8 digits is 100M
 *  combinations, but an uncapped endpoint is still worth closing off. */
const MAX_ATTEMPTS = 5

const REDIRECT_URL = '/admin/dashboard'

function codesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null) as { email?: string; code?: string } | null
    const email = normalizeAdminEmail(body?.email ?? '')
    const code = body?.code?.replace(/\D/g, '') ?? ''

    if (!email || code.length !== 8) {
      return NextResponse.json({ error: 'invalid_code' }, { status: 400 })
    }

    // Check 1 of 2 — see the header note.
    if (!isAdminEmail(email)) {
      return NextResponse.json({ error: 'not_admin' }, { status: 403 })
    }

    const redis = redisClient()
    const {
      code: otpKey,
      token: tokenKey,
      authUser: authUserKey,
      attempts: attemptsKey,
    } = adminOtpKeys(email)

    // Upstash JSON-decodes stored values, so an all-digit code comes back as a
    // number. Coerce before comparing.
    const storedRaw = await redis.get<string | number>(otpKey)
    if (storedRaw === null || storedRaw === undefined) {
      return NextResponse.json({ error: 'expired' }, { status: 410 })
    }
    const storedCode = String(storedRaw)

    // Count this attempt before checking it, so a crash mid-request can't hand
    // back a free guess.
    const attempts = await redis.incr(attemptsKey)
    if (attempts === 1) {
      await redis.expire(attemptsKey, 10 * 60)
    }
    if (attempts > MAX_ATTEMPTS) {
      await redis.del(otpKey, tokenKey, authUserKey, attemptsKey)
      return NextResponse.json({ error: 'too_many_attempts' }, { status: 429 })
    }

    if (!codesMatch(code, storedCode)) {
      return NextResponse.json({ error: 'invalid_code' }, { status: 400 })
    }

    const tokenRaw = await redis.get<string>(tokenKey)
    const hashedToken = tokenRaw == null ? null : String(tokenRaw)
    if (!hashedToken) {
      // Code was live but its paired token expired or was already redeemed.
      await redis.del(otpKey, authUserKey, attemptsKey)
      return NextResponse.json({ error: 'expired' }, { status: 410 })
    }

    // Redeem the Supabase magic-link token. createServerSupabaseClient writes
    // the session cookies through next/headers, which propagate to the
    // response from a Route Handler.
    const supabase = await createServerSupabaseClient()
    const { data: verified, error } = await supabase.auth.verifyOtp({
      token_hash: hashedToken,
      type: 'magiclink',
    })

    if (error) {
      console.error('[/api/admin/verify-code] verifyOtp error:', error.message)
      await redis.del(otpKey, tokenKey, authUserKey, attemptsKey)
      return NextResponse.json({ error: 'expired' }, { status: 410 })
    }

    // Check 2 of 2 — the session that now exists must itself be an admin.
    // This is the authoritative check: everything before it trusted a value
    // the caller supplied.
    const signedInEmail = verified.user?.email ?? null
    if (!isAdminEmail(signedInEmail)) {
      console.error(
        '[/api/admin/verify-code] token opened a non-admin identity:',
        signedInEmail, '— refusing and signing out',
      )
      await supabase.auth.signOut()
      await redis.del(otpKey, tokenKey, authUserKey, attemptsKey)
      return NextResponse.json({ error: 'account_conflict' }, { status: 409 })
    }

    // And it must be the specific identity the code was minted for. Guards the
    // duplicate-email-by-case case, where both rows could be allow-listed.
    const expectedRaw = await redis.get<string>(authUserKey)
    const expectedAuthUserId = expectedRaw == null ? null : String(expectedRaw)
    const actualAuthUserId = verified.user?.id ?? null

    if (expectedAuthUserId && actualAuthUserId && expectedAuthUserId !== actualAuthUserId) {
      console.error(
        '[/api/admin/verify-code] identity mismatch — expected auth user',
        expectedAuthUserId, 'but signed in', actualAuthUserId,
        '(duplicate email in auth.users?)'
      )
      await supabase.auth.signOut()
      await redis.del(otpKey, tokenKey, authUserKey, attemptsKey)
      return NextResponse.json({ error: 'account_conflict' }, { status: 409 })
    }

    // Single-use: burn the code and its token now that the session exists.
    await redis.del(otpKey, tokenKey, authUserKey, attemptsKey)

    return NextResponse.json({ ok: true, redirectUrl: REDIRECT_URL })

  } catch (err) {
    console.error('[/api/admin/verify-code] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
