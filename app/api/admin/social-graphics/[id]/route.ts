/**
 * DELETE /api/admin/social-graphics/[id] — remove one image
 *
 * Admin-only, and network-wide: the image disappears from every merchant's
 * Marketing tab at once.
 *
 * The stored object goes with the row. A soft delete would leave an
 * already-minted signed URL working and the storage bill growing for artwork
 * admin believes they took down.
 *
 * The remaining images are re-numbered so display_order stays dense. Left
 * alone, repeated deletes would leave gaps that make a later reorder read
 * strangely, since the UI sends positions rather than offsets.
 *
 * Responses:
 *   200 { ok: true }
 *   401 { error: 'forbidden' }
 *   404 { error: 'not_found' }
 */

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { verifyAdmin } from '@/lib/admin-auth'
import { SOCIAL_GRAPHICS_BUCKET } from '@/lib/social-graphics'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const email = await verifyAdmin()
  if (!email) return NextResponse.json({ error: 'forbidden' }, { status: 401 })

  const { id } = await params
  const admin = createAdminSupabaseClient()

  const { data: row } = await admin
    .from('binperks_social_graphics')
    .select('id, storage_path')
    .eq('id', id)
    .maybeSingle()

  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { error: delError } = await admin
    .from('binperks_social_graphics')
    .delete()
    .eq('id', id)

  if (delError) {
    console.error('[admin/social-graphics] delete failed:', delError.message)
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 })
  }

  // Storage after the row. If this fails the image is already gone from every
  // merchant's view, which is what was asked for — an orphaned object is a
  // cleanup task, not a reason to put the image back.
  const { error: storageError } = await admin.storage
    .from(SOCIAL_GRAPHICS_BUCKET)
    .remove([row.storage_path as string])

  if (storageError) {
    console.error('[admin/social-graphics] storage remove failed:', storageError.message)
  }

  // Re-number what is left, in the order it already had.
  const { data: rest } = await admin
    .from('binperks_social_graphics')
    .select('id')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })

  for (let i = 0; i < (rest?.length ?? 0); i++) {
    await admin
      .from('binperks_social_graphics')
      .update({ display_order: i })
      .eq('id', rest![i].id)
  }

  return NextResponse.json({ ok: true })
}
