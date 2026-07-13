/**
 * POST /api/auth/confirm
 *
 * Called by /auth/confirm when the user taps "Tap to Sign In".
 * Looks up the token_hash from Redis using the short code, verifies the OTP,
 * sets session cookies, and returns { redirectUrl }.
 *
 * The token_hash is never sent to the browser — it lives only in Redis until
 * this handler retrieves and deletes it (single-use).
 *
 * Request body: { code: string, next?: string }
 * Response:     { redirectUrl: string } on success
 *               { error: string }       on failure
 */

import { createServerClient } from '@supabase/ssr'
import { Redis } from '@upstash/redis'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    code?: string
    next?: string
  }

  const { code, next = '/member/dashboard' } = body

  if (!code) {
    return NextResponse.json({ error: 'Missing code' }, { status: 400 })
  }

  // Look up token_hash from Redis and delete it (single-use)
  const redis = new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  })

  const token_hash = await redis.get<string>(`token:${code}`)

  if (!token_hash) {
    return NextResponse.json({ error: 'expired' }, { status: 410 })
  }

  await redis.del(`token:${code}`)

  // Verify the OTP and set session cookies
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )

  const { error } = await supabase.auth.verifyOtp({
    token_hash,
    type: 'magiclink',
  })

  if (error) {
    console.error('[/api/auth/confirm] verifyOtp error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Copy session cookies into the response so the browser stores them
  const response = NextResponse.json({ redirectUrl: next })

  cookieStore.getAll().forEach(cookie => {
    response.cookies.set(cookie.name, cookie.value, { path: '/' })
  })

  return response
}
