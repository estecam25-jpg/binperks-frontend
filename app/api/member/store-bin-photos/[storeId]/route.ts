/**
 * GET /api/member/store-bin-photos/[storeId]
 *
 * The active "What's In The Bins" photos for one store, for the member-facing
 * View Perks panel.
 *
 * MEMBER SESSION REQUIRED, matching the sibling perks route: this is member
 * app content, not public marketing, and an unauthenticated endpoint returning
 * signed URLs for every store would be a scraping surface. Admin client for
 * the reads (CLAUDE.md CRITICAL RLS RULE).
 *
 * Signed URLs expire in an hour and are minted per request — never stored.
 *
 * An empty list is a 200, not a 404. Most stores will have no photos and the
 * member UI hides the section entirely; an error status for the normal case
 * would put noise in the console on nearly every store a member opens.
 *
 * Responses:
 *   200 { photos: [{ id, url, caption }] }
 *   401 { error: 'not_authenticated' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { MAX_PHOTOS_PER_STORE, signBinPhotos } from '@/lib/bin-photos'

interface PhotoRow {
  id: string
  storage_path: string
  caption: string | null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ storeId: string }> },
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const { storeId } = await params
  const admin = createAdminSupabaseClient()

  const { data: member } = await admin
    .from('members')
    .select('id, is_blacklisted')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!member || member.is_blacklisted) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const { data, error } = await admin
    .from('store_bin_photos')
    .select('id, storage_path, caption')
    .eq('store_id', storeId)
    .eq('active', true)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(MAX_PHOTOS_PER_STORE)

  if (error) {
    console.error('[member/store-bin-photos] query failed:', error)
    return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  }

  const rows = (data ?? []) as PhotoRow[]
  const signed = await signBinPhotos(admin, rows.map(r => r.storage_path))

  return NextResponse.json({
    photos: rows
      // A row whose signed URL failed is dropped rather than sent with a null
      // url for the client to special-case.
      .filter(r => signed[r.storage_path])
      .map(r => ({
        id:      r.id,
        url:     signed[r.storage_path],
        caption: r.caption,
      })),
  })
}
