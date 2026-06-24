/**
 * GET /api/join/ref/[code]
 *
 * Resolves a referral_code to the referrer's first name and member ID.
 * Used by Page 1 to show the referral banner ("You were invited by Sarah!").
 *
 * Returns:
 *   200 { referrerMemberId, referrerFirstName }
 *   404 { error: 'not_found' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const supabase = await createServerSupabaseClient()

  const { data } = await supabase
    .from('members')
    .select('id, first_name')
    .eq('referral_code', code)
    .eq('status', 'active')
    .single()

  if (!data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  return NextResponse.json({
    referrerMemberId:  data.id,
    referrerFirstName: data.first_name,
  })
}
