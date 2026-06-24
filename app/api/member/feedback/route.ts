/**
 * POST /api/member/feedback
 *
 * Member submits a quick rating ('wow' | 'meh' | 'mad') + optional notes
 * about their experience at their home store. Auth: Supabase session cookie.
 *
 * Request body: { rating: 'wow' | 'meh' | 'mad', notes?: string }
 * Responses:
 *   200 { ok: true }
 *   401 { error: 'not_authenticated' }
 *   400 { error: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const VALID_RATINGS = ['wow', 'meh', 'mad']

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const body = await req.json()
  const { rating, notes } = body as { rating?: string; notes?: string }

  if (!rating || !VALID_RATINGS.includes(rating)) {
    return NextResponse.json({ error: 'Invalid rating' }, { status: 400 })
  }

  const { data: member, error: memberError } = await supabase
    .from('members')
    .select('id, home_store_id')
    .eq('auth_user_id', user.id)
    .single()

  if (memberError || !member) {
    return NextResponse.json({ error: 'member_not_found' }, { status: 404 })
  }

  const { error: insertError } = await supabase
    .from('feedback')
    .insert({
      member_id:    member.id,
      store_id:     member.home_store_id,
      rating,
      notes:        notes?.trim() || null,
      submitted_at: new Date().toISOString(),
    })

  if (insertError) {
    console.error('[/api/member/feedback] Insert error:', insertError)
    return NextResponse.json({ error: 'Failed to submit feedback' }, { status: 500 })
  }

  // TODO: if rating === 'mad', notify the merchant privately (per GHL Integration
  // rules — "Unhappy ones reach you privately") via a GHL webhook once it exists.
  // If rating === 'wow', the review-generation nudge (Google/Facebook review link)
  // belongs here too — also pending GHL workflow setup.

  return NextResponse.json({ ok: true })
}
