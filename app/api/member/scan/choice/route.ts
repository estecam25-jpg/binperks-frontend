/**
 * POST /api/member/scan/choice
 *
 * Records the member's Shopping Cart vs Back to Bins decision for a scan.
 *
 * This is a statement of interest, not a purchase record. It never awards
 * stamps, issues rewards, or touches the settlement ledger.
 *
 * Body: { scanEventId, choice: 'shopping_cart' | 'back_to_bins' }
 *
 * Responses:
 *   200 { ok: true, choice, choiceRecordedAt }
 *   400 { error: 'missing_fields' | 'invalid_choice' }
 *   401 { error: 'not_authenticated' }
 *   404 { error: 'scan_not_found' }   — also returned for another member's scan
 *   409 { error: 'choice_already_recorded', choice }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

// 'no_choice' is a valid column value but is never set from here — it exists
// for a future sweep that closes out scans the member abandoned.
const MEMBER_CHOICES = ['shopping_cart', 'back_to_bins'] as const
type MemberChoice = typeof MEMBER_CHOICES[number]

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const { scanEventId, choice } = await req.json().catch(() => ({})) as {
    scanEventId?: string; choice?: string
  }

  if (!scanEventId || !choice) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
  }
  // Allow-listed before it reaches the UPDATE — the column has a CHECK
  // constraint, but a bad value should be a 400 here rather than a 500 there.
  if (!MEMBER_CHOICES.includes(choice as MemberChoice)) {
    return NextResponse.json({ error: 'invalid_choice' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()

  const { data: member } = await admin
    .from('members')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!member) return NextResponse.json({ error: 'scan_not_found' }, { status: 404 })

  // Scoped to this member's own scan — a member can never write a choice onto
  // someone else's scan, and a mismatch reads as not-found rather than
  // confirming the scan exists.
  const { data: scan } = await admin
    .from('scanner_events')
    .select('id, member_choice')
    .eq('id', scanEventId)
    .eq('member_id', member.id)
    .maybeSingle()

  if (!scan) return NextResponse.json({ error: 'scan_not_found' }, { status: 404 })

  // First answer wins — the choice is a point-in-time signal, so a double-tap
  // or a replayed request must not overwrite it.
  if (scan.member_choice) {
    return NextResponse.json(
      { error: 'choice_already_recorded', choice: scan.member_choice },
      { status: 409 },
    )
  }

  const choiceRecordedAt = new Date().toISOString()

  const { error } = await admin
    .from('scanner_events')
    .update({ member_choice: choice, choice_recorded_at: choiceRecordedAt })
    .eq('id', scanEventId)
    .eq('member_id', member.id)
    .is('member_choice', null)   // re-checked here so concurrent taps can't both win

  if (error) {
    console.error('[member/scan/choice] update failed:', error)
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, choice, choiceRecordedAt })
}
