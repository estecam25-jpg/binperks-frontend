/**
 * POST /api/auth/shorten
 *
 * Creates a short URL that redirects to the given target URL.
 * Used to keep magic link SMS messages under 160 characters (1 SMS segment).
 *
 * Short links expire after 65 minutes and are single-use (deleted on first hit).
 *
 * Request body: { url: string }
 * Response:     { shortUrl: string }  e.g. https://app.binperks.com/s/aB3xYz7q
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

function randomCode(length = 8): string {
  // Unambiguous alphanumeric chars (no 0/O/I/l confusion)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const arr = new Uint8Array(length)
  crypto.getRandomValues(arr)
  let code = ''
  for (let i = 0; i < length; i++) {
    code += chars[arr[i] % chars.length]
  }
  return code
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { url?: string }
  const { url } = body

  if (!url) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()
  const code = randomCode()
  const expiresAt = new Date(Date.now() + 65 * 60 * 1000).toISOString()

  const { error } = await admin
    .from('short_links')
    .insert({ code, url, expires_at: expiresAt })

  if (error) {
    console.error('[/api/auth/shorten] insert error:', error.message)
    return NextResponse.json({ error: 'Failed to create short link' }, { status: 500 })
  }

  return NextResponse.json({
    shortUrl: `https://app.binperks.com/s/${code}`,
  })
}
