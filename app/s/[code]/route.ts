/**
 * GET /s/[code]
 *
 * DEPRECATED — magic-link short URL handler, kept for backward compatibility.
 *
 * Member sign-in now uses an 8-digit SMS code entered on
 * /member/login/[storeKey] (see /api/member/login and
 * /api/member/verify-code). Nothing writes token:[code] any more, so this
 * route only still resolves for magic-link SMS messages that were sent
 * before the cutover and are inside their 65-minute Redis TTL. Once that
 * window has passed with no traffic here, this route and /auth/confirm can
 * both be deleted.
 *
 * Checks that the code exists in Redis, then redirects to the /auth/confirm
 * page with ONLY the code -- the token_hash never appears in the URL, so
 * SMS link-preview bots cannot follow it and consume the token.
 */

import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const expired = new URL('/member/login?error=expired', request.url)

  try {
    const redis = new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    })

    // Verify the token exists -- don't consume it yet (that happens on button tap)
    console.log(`[/s/[code]] checking token:${code} in Redis`)
    const tokenExists = await redis.exists(`token:${code}`)
    console.log(`[/s/[code]] tokenExists:`, tokenExists)

    if (!tokenExists) {
      return NextResponse.redirect(expired)
    }

    // Redirect to confirm page with only the code -- token_hash stays in Redis
    return NextResponse.redirect(new URL(`/auth/confirm?code=${code}`, request.url))
  } catch (err) {
    console.error('[/s/[code]] Redis error:', err)
    return NextResponse.redirect(expired)
  }
}
