/**
 * POST /api/member/verify-code
 *
 * Step 2 of passwordless member sign-in. The member types the 8-digit code
 * they received by SMS. We compare it against the code /api/member/login
 * stored in Redis, then redeem the Supabase hashed_token that was stored
 * alongside it — the token itself is never exposed to the browser.
 *
 * On success the Supabase session cookies are set on the response, so the
 * client can do a full-page navigation to the dashboard (same pattern as
 * /api/merchant/verify-code).
 *
 * Both Redis keys are deleted on success, so a code is strictly single-use.
 * Failed attempts are counted; after MAX_ATTEMPTS the code is burned and the
 * member has to request a new one.
 *
 * Request body: { phone: string (digits), code: string (8 digits) }
 *
 * Responses:
 *   200 { ok: true, redirectUrl: string }
 *   400 { error: 'invalid_code' }        — wrong code, attempts remain
 *   409 { error: 'account_conflict' }    — code signed in the wrong auth identity
 *   410 { error: 'expired' }             — no live code for this phone
 *   429 { error: 'too_many_attempts' }   — code burned, request a new one
 *   500 { error: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { otpKeys, redisClient } from '@/lib/member-otp'

/** Wrong guesses allowed before the code is burned. 8 digits is 100M
 *  combinations, but an uncapped endpoint is still worth closing off. */
const MAX_ATTEMPTS = 5

const REDIRECT_URL = '/member/dashboard'

function codesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { phone?: string; code?: string }
    const phone = body.phone?.replace(/\D/g, '')
    const code = body.code?.replace(/\D/g, '')

    if (!phone || phone.length !== 10 || !code || code.length !== 8) {
      return NextResponse.json({ error: 'invalid_code' }, { status: 400 })
    }

    const redis = redisClient()

    const {
      code: otpKey,
      token: tokenKey,
      authUser: authUserKey,
      attempts: attemptsKey,
    } = otpKeys(phone)

    // Upstash JSON-decodes stored values, so an all-digit code comes back as a
    // number. Coerce before comparing.
    const storedRaw = await redis.get<string | number>(otpKey)
    if (storedRaw === null || storedRaw === undefined) {
      return NextResponse.json({ error: 'expired' }, { status: 410 })
    }
    const storedCode = String(storedRaw)

    // Count this attempt before checking it, so a crash mid-request can't
    // hand back a free guess.
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
      console.error('[/api/member/verify-code] verifyOtp error:', error.message)
      await redis.del(otpKey, tokenKey, authUserKey, attemptsKey)
      return NextResponse.json({ error: 'expired' }, { status: 410 })
    }

    // The session is real, but is it the right identity? generateLink targets
    // by email and Supabase matches email case-insensitively, so two auth.users
    // rows differing only in case can send the token to the wrong one. Signing
    // in as an auth user with no members row produces a dashboard that 404s and
    // bounces straight back to sign-in — an endless loop. Refuse instead.
    const expectedRaw = await redis.get<string>(authUserKey)
    const expectedAuthUserId = expectedRaw == null ? null : String(expectedRaw)
    const actualAuthUserId = verified.user?.id ?? null

    if (expectedAuthUserId && actualAuthUserId && expectedAuthUserId !== actualAuthUserId) {
      console.error(
        '[/api/member/verify-code] identity mismatch — expected auth user',
        expectedAuthUserId, 'but signed in', actualAuthUserId,
        '(duplicate email in auth.users?)'
      )
      // Drop the session we just created; leaving it would let the member sit
      // signed in as an account that is not theirs.
      await supabase.auth.signOut()
      await redis.del(otpKey, tokenKey, authUserKey, attemptsKey)
      return NextResponse.json({ error: 'account_conflict' }, { status: 409 })
    }

    // Single-use: burn the code and its token now that the session exists.
    await redis.del(otpKey, tokenKey, authUserKey, attemptsKey)

    return NextResponse.json({ ok: true, redirectUrl: REDIRECT_URL })

  } catch (err) {
    console.error('[/api/member/verify-code] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
