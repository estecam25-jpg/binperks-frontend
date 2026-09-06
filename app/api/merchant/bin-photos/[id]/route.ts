/**
 * PATCH  /api/merchant/bin-photos/[id] — update caption or display order
 * DELETE /api/merchant/bin-photos/[id] — remove a photo
 *
 * OWNERSHIP IS CHECKED ON EVERY CALL. The photo id comes from the client, so
 * the row's store must belong to the calling merchant before anything is
 * changed — otherwise a merchant could recaption or delete a competitor's
 * photos by guessing an id.
 *
 * DELETE removes the stored object as well as the row. A soft delete would
 * leave a member's signed URL working and the merchant's storage bill growing
 * for a photo they believe they took down.
 *
 * Responses:
 *   200 { ok: true }
 *   400 { error: 'invalid_request' }
 *   404 { error: 'not_found' }  — also returned for a photo owned by someone
 *                                 else, which is the right amount to disclose
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { findMerchantForRequest } from '@/lib/merchant-auth'
import { BIN_PHOTOS_BUCKET, MAX_CAPTION_LENGTH, merchantStoreIds } from '@/lib/bin-photos'

/** Resolves the photo only when it belongs to the calling merchant. */
async function ownedPhoto(id: string) {
  const merchant = await findMerchantForRequest<{ id: string }>('id')
  if (!merchant) return null

  const admin = createAdminSupabaseClient()
  const storeIds = await merchantStoreIds(admin, merchant.id)
  if (storeIds.length === 0) return null

  const { data } = await admin
    .from('store_bin_photos')
    .select('id, store_id, storage_path')
    .eq('id', id)
    .maybeSingle()

  if (!data || !storeIds.includes(data.store_id)) return null
  return { admin, photo: data as { id: string; store_id: string; storage_path: string } }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const owned = await ownedPhoto(id)
  if (!owned) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const body = await req.json().catch(() => null) as
    { caption?: unknown; displayOrder?: unknown } | null
  if (!body) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const updates: Record<string, unknown> = {}

  // An explicit empty string clears the caption; an absent key leaves it alone.
  if (typeof body.caption === 'string') {
    const trimmed = body.caption.trim().slice(0, MAX_CAPTION_LENGTH)
    updates.caption = trimmed || null
  }

  if (body.displayOrder !== undefined) {
    const n = Number(body.displayOrder)
    if (!Number.isInteger(n) || n < 0 || n > 100) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
    }
    updates.display_order = n
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const { error } = await owned.admin
    .from('store_bin_photos')
    .update(updates)
    .eq('id', id)

  if (error) {
    console.error('[merchant/bin-photos] PATCH failed:', error)
    return NextResponse.json({ error: 'save_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const owned = await ownedPhoto(id)
  if (!owned) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Object first, then the row. The other order can leave a row pointing at a
  // file that is already gone, which renders as a broken thumbnail forever.
  // This order can at worst orphan an object, which is invisible to members.
  const { error: rmError } = await owned.admin.storage
    .from(BIN_PHOTOS_BUCKET)
    .remove([owned.photo.storage_path])

  if (rmError) {
    console.error('[merchant/bin-photos] object delete failed:', rmError.message)
  }

  const { error } = await owned.admin
    .from('store_bin_photos')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[merchant/bin-photos] row delete failed:', error)
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
