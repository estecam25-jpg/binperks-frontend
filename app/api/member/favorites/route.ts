/**
 * GET  /api/member/favorites   — the member's favourited store ids
 * POST /api/member/favorites   — { store_id } adds one
 *
 * DELETE lives at /api/member/favorites/[storeId].
 *
 * Auth: member session (server client for identity), admin client for the
 * reads and writes — member_store_favorites has RLS on with no policies, so
 * the service role is the only way in.
 *
 * Scoped to the member resolved from the SESSION, never to a member id in the
 * body. Trusting the body would let anyone favourite stores on someone else's
 * account.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

/** Resolves the signed-in member, or null. */
async function currentMember() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminSupabaseClient()
  const { data: member } = await admin
    .from('members')
    .select('id, is_blacklisted, status')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!member || member.is_blacklisted || member.status !== 'active') return null
  return { id: member.id as string, admin }
}

export async function GET() {
  const m = await currentMember()
  if (!m) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const { data, error } = await m.admin
    .from('member_store_favorites')
    .select('store_id')
    .eq('member_id', m.id)

  if (error) {
    console.error('[member/favorites] GET failed:', error)
    return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  }

  return NextResponse.json({ storeIds: (data ?? []).map(r => r.store_id) })
}

export async function POST(req: NextRequest) {
  const m = await currentMember()
  if (!m) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const body = await req.json().catch(() => null) as { store_id?: string } | null
  const storeId = body?.store_id
  if (!storeId) return NextResponse.json({ error: 'store_id required' }, { status: 400 })

  // upsert, not insert: the heart is optimistic on the client, so a double tap
  // or a retry must not 409 at a member who already got what they asked for.
  const { error } = await m.admin
    .from('member_store_favorites')
    .upsert({ member_id: m.id, store_id: storeId }, { onConflict: 'member_id,store_id' })

  if (error) {
    // A bad store_id trips the foreign key rather than silently storing junk.
    console.error('[member/favorites] POST failed:', error)
    return NextResponse.json({ error: 'save_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
