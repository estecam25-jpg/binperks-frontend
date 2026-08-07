/**
 * POST /api/merchant/verify-code
 *
 * Step 2 of merchant sign-in. The merchant types the 8-digit code delivered
 * by /api/merchant/login; we compare it against Redis and redeem the Supabase
 * hashed_token stored alongside it. The token never reaches the browser.
 *
 * This replaces the previous implementation, which passed the merchant's
 * typed code straight to supabase.auth.verifyOtp({type: 'email'}) — that only
 * worked while Supabase itself generated and emailed the code. The code is
 * ours now, so the comparison has to be ours too.
 *
 * Keyed by email (merchants have no phone; see /api/merchant/login).
 * Both keys are deleted on success, so a code is strictly single-use.
 *
 * Request body: { email: string, code: string (8 digits) }
 *
 * Responses:
 *   200 { ok: true, redirectUrl: '/merchant/dashboard' }
 *   400 { error: 'invalid_code' }        — wrong code, attempts remain
 *   409 { error: 'account_conflict' }    — code signed in the wrong auth identity
 *   410 { error: 'expired' }             — no live code for this email
 *   429 { error: 'too_many_attempts' }   — code burned, request a new one
 *   500 { error: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { merchantOtpKeys, normalizeMerchantEmail, redisClient } from '@/lib/merchant-otp'

/** Wrong guesses allowed before the code is burned. 8 digits is 100M
 *  combinations, but an uncapped endpoint is still worth closing off. */
const MAX_ATTEMPTS = 5

const REDIRECT_URL = '/merchant/dashboard'

function codesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null) as { email?: string; code?: string } | null
    const email = normalizeMerchantEmail(body?.email ?? '')
    const code = body?.code?.replace(/\D/g, '') ?? ''

    if (!email || code.length !== 8) {
      return NextResponse.json({ error: 'invalid_code' }, { status: 400 })
    }

    const redis = redisClient()
    const {
      code: otpKey,
      token: tokenKey,
      authUser: authUserKey,
      attempts: attemptsKey,
    } = merchantOtpKeys(email)

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
      console.error('[/api/merchant/verify-code] verifyOtp error:', error.message)
      await redis.del(otpKey, tokenKey, authUserKey, attemptsKey)
      return NextResponse.json({ error: 'expired' }, { status: 410 })
    }

    // Right code, but is it the right identity? generateLink targets by email
    // and Supabase matches email case-insensitively, so two auth.users rows
    // differing only in case can hand the token to the wrong account. Signing
    // a merchant into an identity with no merchants row produces a dashboard
    // that bounces straight back to sign-in. Refuse instead of looping.
    const expectedRaw = await redis.get<string>(authUserKey)
    const expectedAuthUserId = expectedRaw == null ? null : String(expectedRaw)
    const actualAuthUserId = verified.user?.id ?? null

    if (expectedAuthUserId && actualAuthUserId && expectedAuthUserId !== actualAuthUserId) {
      console.error(
        '[/api/merchant/verify-code] identity mismatch — expected auth user',
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
    console.error('[/api/merchant/verify-code] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
