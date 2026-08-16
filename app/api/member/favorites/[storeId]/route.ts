/**
 * DELETE /api/member/favorites/[storeId] — removes one favourite.
 *
 * Scoped to the member resolved from the SESSION and the store id in the path,
 * so a member can only ever delete their own row.
 *
 * Deleting something already gone returns ok rather than 404: the heart is
 * optimistic, and a retry after a dropped connection should settle, not error.
 */

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ storeId: string }> },
) {
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

  const { storeId } = await params

  const { error } = await admin
    .from('member_store_favorites')
    .delete()
    .eq('member_id', member.id)
    .eq('store_id', storeId)

  if (error) {
    console.error('[member/favorites] DELETE failed:', error)
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
