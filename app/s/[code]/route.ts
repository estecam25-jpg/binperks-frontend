/**
 * GET /s/[code]
 *
 * URL shortener redirect handler.
 * Looks up the short code in the short_links table, redirects to the stored
 * URL, then deletes the record (single-use link).
 *
 * Expired or missing codes redirect to /member/login?error=expired
 * so the member can request a fresh magic link.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const admin = createAdminSupabaseClient()

  const { data } = await admin
    .from('short_links')
    .select('id, url, expires_at')
    .eq('code', code)
    .maybeSingle()

  const expired = new URL('/member/login?error=expired', request.url)

  if (!data) {
    return NextResponse.redirect(expired)
  }

  if (new Date(data.expires_at) < new Date()) {
    await admin.from('short_links').delete().eq('id', data.id)
    return NextResponse.redirect(expired)
  }

  const destination = data.url

  // Single-use: delete before redirecting
  await admin.from('short_links').delete().eq('id', data.id)

  return NextResponse.redirect(destination)
}
