/**
 * GET /api/member/alerts — this member's alerts, newest first.
 *
 * The unread count also comes back in an X-Unread-Count header, so the bell can
 * read it without parsing the body.
 *
 * Auth: member session for identity, admin client for the read —
 * member_alerts has RLS on with no policies.
 */

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

const MAX_ALERTS = 50

export async function GET() {
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

  const [listRes, countRes] = await Promise.all([
    admin
      .from('member_alerts')
      .select('id, alert_type, title, body, read, store_id, created_at')
      .eq('member_id', member.id)
      .order('created_at', { ascending: false })
      .limit(MAX_ALERTS),
    // Counted separately so it reflects EVERY unread alert, not just the unread
    // ones inside the 50 returned.
    admin
      .from('member_alerts')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', member.id)
      .eq('read', false),
  ])

  if (listRes.error) {
    console.error('[member/alerts] query failed:', listRes.error)
    return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  }

  const unread = countRes.count ?? 0

  return NextResponse.json(
    {
      alerts: (listRes.data ?? []).map(a => ({
        id:        a.id,
        type:      a.alert_type,
        title:     a.title,
        body:      a.body,
        read:      a.read,
        storeId:   a.store_id,
        createdAt: a.created_at,
      })),
      unreadCount: unread,
    },
    { headers: { 'X-Unread-Count': String(unread) } },
  )
}
