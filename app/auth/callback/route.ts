/**
 * /auth/callback
 *
 * Handles two Supabase auth flows:
 *
 * 1. OTP / token-hash flow (what the magic link email template sends):
 *      ?token_hash=<hash>&type=magiclink&next=/member/dashboard
 *    → calls supabase.auth.verifyOtp({ token_hash, type })
 *
 * 2. PKCE code-exchange flow (used by OAuth and some Supabase email flows):
 *      ?code=<code>&next=/member/dashboard
 *    → calls supabase.auth.exchangeCodeForSession(code)
 *
 * Both flows write the session into the `sb-*` cookies via the SSR client's
 * setAll handler so that subsequent server-side calls (e.g. /api/member/me)
 * can read the session.
 *
 * IMPORTANT: must use NEXT_PUBLIC_SUPABASE_ANON_KEY (the eyJ... JWT).
 * The NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is a different key format that
 * breaks auth — never use it here or in any server-side Supabase client.
 */

import { createServerClient } from '@supabase/ssr'
import type { EmailOtpType } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const next = searchParams.get('next') ?? '/member/dashboard'

  // OTP / token-hash flow — sent by the magic link email template
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  // PKCE code-exchange flow
  const code = searchParams.get('code')

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,  // ← must be the eyJ... JWT, NOT PUBLISHABLE_KEY
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

  if (token_hash && type) {
    // Magic link (and signup OTP, recovery, etc.) — use verifyOtp
    const { error } = await supabase.auth.verifyOtp({ token_hash, type })
    if (!error) {
      return NextResponse.redirect(new URL(next, origin))
    }
    console.error('[auth/callback] verifyOtp error:', error.message)
  } else if (code) {
    // PKCE exchange
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(next, origin))
    }
    console.error('[auth/callback] exchangeCodeForSession error:', error.message)
  }

  // Auth failed — send back to the correct login page with an error flag
  // so the page can show a "link expired, request a new one" message.
  // Detect merchant vs member by the `next` destination.
  const loginPage = next.startsWith('/merchant')
    ? '/merchant/login?error=auth'
    : '/member/login?error=auth'
  return NextResponse.redirect(new URL(loginPage, origin))
}