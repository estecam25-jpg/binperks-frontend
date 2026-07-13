/**
 * GET /s/[code]
 *
 * URL shortener redirect handler.
 * Checks that the code exists in Redis, then redirects to the /auth/confirm
 * page with ONLY the code — the token_hash never appears in the URL, so
 * SMS link-preview bots cannot follow it and consume the token.
 *
 * The actual token_hash is stored in Redis under token:[code] and is only
 * retrieved when the member taps the "Sign In" button on /auth/confirm.
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

    // Verify the token exists — don't consume it yet (that happens on button tap)
    const tokenExists = await redis.exists(`token:${code}`)

    if (!tokenExists) {
      return NextResponse.redirect(expired)
    }

    // Redirect to confirm page with only the code — token_hash stays in Redis
    return NextResponse.redirect(new URL(`/auth/confirm?code=${code}`, request.url))
  } catch (err) {
    console.error('[/s/[code]] Redis error:', err)
    return NextResponse.redirect(expired)
  }
}
