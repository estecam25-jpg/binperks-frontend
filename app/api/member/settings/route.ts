/**
 * PATCH /api/member/settings
 *
 * Updates settings for the logged-in member. Auth: Supabase session cookie.
 *
 * Request body (either or both):
 *   { smsOptIn?: boolean, deactivate?: true }
 *
 * Deactivation never deletes data — it only flips status, per the locked
 * rule "Member data never deleted — only deactivated."
 *
 * Responses:
 *   200 { ok: true }
 *   401 { error: 'not_authenticated' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const { data: member } = await supabase
    .from('members')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!member) {
    return NextResponse.json({ error: 'member_not_found' }, { status: 404 })
  }

  const body = await req.json() as { smsOptIn?: boolean; deactivate?: boolean }
  const update: Record<string, unknown> = {}

  if (typeof body.smsOptIn === 'boolean') {
    update.sms_opt_in = body.smsOptIn
  }
  if (body.deactivate === true) {
    update.status = 'deactivated'
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { error } = await supabase
    .from('members')
    .update(update)
    .eq('id', member.id)

  if (error) {
    console.error('[/api/member/settings] Update error:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
