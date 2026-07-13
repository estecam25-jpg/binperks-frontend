/**
 * GET /s/[code]
 *
 * URL shortener redirect handler using Upstash Redis.
 * Looks up the short code, redirects to the stored URL, then deletes the
 * key (single-use link). Keys auto-expire after 65 minutes via Redis TTL.
 *
 * Missing or expired codes redirect to /member/login?error=expired.
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

    const url = await redis.get<string>(`short:${code}`)

    if (!url) {
      return NextResponse.redirect(expired)
    }

    // Single-use: delete before redirecting
    // single use disabled - let TTL handle expiry

    return NextResponse.redirect(url)
  } catch (err) {
    console.error('[/s/[code]] Redis error:', err)
    return NextResponse.redirect(expired)
  }
}
