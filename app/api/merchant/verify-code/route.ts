/**
 * POST /api/merchant/verify-code
 *
 * Verifies a 6-digit email OTP code submitted by a merchant on the login page.
 * Sets the Supabase session cookies on success so subsequent server-side API
 * calls (e.g. /api/merchant/dashboard) can read the authenticated user.
 *
 * Body: { email: string, code: string }
 * Response: { ok: true } | { error: string }
 */

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: Request) {
  const { email, code } = await req.json() as { email?: string; code?: string }

  if (!email || !code) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase.auth.verifyOtp({
    email: email.toLowerCase().trim(),
    token: code.trim(),
    type: 'email',
  })

  if (error) {
    console.error('[merchant/verify-code] verifyOtp error:', error.message)
    return NextResponse.json({ error: 'invalid_code' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
