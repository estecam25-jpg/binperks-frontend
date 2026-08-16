/**
 * POST /api/member/alerts/read
 *
 * Body: { alert_id } to mark one, or { all: true } to mark every unread one.
 *
 * Always scoped to the member from the SESSION as well as the alert id, so a
 * guessed id belonging to someone else matches no row rather than marking
 * their alert read.
 *
 * Returns the remaining unread count, in the body and in X-Unread-Count, so
 * the bell updates from the same response that did the marking.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const admin = createAdminSupabaseClient()
  const { data: member } = await admin
    .from('members')
    .select('id, is_blacklisted, status')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!member || member.is_blacklisted || member.status !== 'active') {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const body = await req.json().catch(() => null) as
    { alert_id?: string; all?: boolean } | null

  if (!body?.all && !body?.alert_id) {
    return NextResponse.json({ error: 'alert_id or all required' }, { status: 400 })
  }

  let q = admin.from('member_alerts').update({ read: true }).eq('member_id', member.id)
  if (!body.all) q = q.eq('id', body.alert_id!)

  const { error } = await q
  if (error) {
    console.error('[member/alerts/read] update failed:', error)
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }

  const { count } = await admin
    .from('member_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', member.id)
    .eq('read', false)

  const unread = count ?? 0
  return NextResponse.json(
    { ok: true, unreadCount: unread },
    { headers: { 'X-Unread-Count': String(unread) } },
  )
}
