/**
 * POST /api/auth/confirm
 *
 * Called by the /auth/confirm page when the user taps "Tap to Sign In".
 * Verifies the OTP token, sets session cookies, and returns the redirect URL.
 *
 * Using a POST (not GET) means SMS link-preview bots cannot consume the token
 * by pre-fetching the URL — bots only follow GET requests.
 *
 * Request body: { token_hash: string, type: string, next: string }
 * Response:     { redirectUrl: string } on success
 *               { error: string }       on failure
 */

import { createServerClient } from '@supabase/ssr'
import type { EmailOtpType } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    token_hash?: string
    type?: string
    next?: string
  }

  const { token_hash, type, next = '/member/dashboard' } = body

  if (!token_hash || !type) {
    return NextResponse.json({ error: 'Missing token_hash or type' }, { status: 400 })
  }

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
    type: type as EmailOtpType,
  })

  if (error) {
    console.error('[/api/auth/confirm] verifyOtp error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Build response with session cookies so the browser stores them
  // before the client navigates to the dashboard
  const response = NextResponse.json({ redirectUrl: next })

  cookieStore.getAll().forEach(cookie => {
    response.cookies.set(cookie.name, cookie.value, { path: '/' })
  })

  return response
}
