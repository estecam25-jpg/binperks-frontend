/**
 * GET  /api/merchant/bin-photos?storeId=… — the merchant's bin photos
 * POST /api/merchant/bin-photos            — upload one (multipart form)
 *
 * "What's In The Bins": merchant-uploaded photos of current stock, shown to
 * members on the store's View Perks panel.
 *
 * OWNERSHIP IS RESOLVED SERVER-SIDE. storeId arrives from the client, so it is
 * checked against the merchant's own stores before anything is read or written.
 * Without that, a merchant could post photos into another merchant's location.
 *
 * Auth: merchant session (lib/merchant-auth, which falls back to owner_email
 * when auth_user_id is stale). Storage and table access use the admin client —
 * the bucket is private and store_bin_photos has RLS with no policies.
 *
 * Responses:
 *   GET  200 { photos: [{ id, storeId, url, caption, displayOrder, createdAt }] }
 *   POST 201 { photo: {...} }
 *        400 { error: 'no_file' | 'unreadable_image' | 'file_too_large' | 'invalid_store' }
 *        409 { error: 'limit_reached' }
 *   401/404 on auth failure
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { findMerchantForRequest } from '@/lib/merchant-auth'
import {
  BIN_PHOTOS_BUCKET, MAX_PHOTOS_PER_STORE, MAX_UPLOAD_BYTES, MAX_CAPTION_LENGTH,
  binPhotoPath, encodeBinPhoto, signBinPhotos, merchantStoreIds,
} from '@/lib/bin-photos'

interface PhotoRow {
  id: string
  store_id: string
  storage_path: string
  caption: string | null
  display_order: number | null
  active: boolean | null
  created_at: string | null
}

export async function GET(req: NextRequest) {
  const merchant = await findMerchantForRequest<{ id: string }>('id')
  if (!merchant) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 })

  const admin = createAdminSupabaseClient()
  const storeIds = await merchantStoreIds(admin, merchant.id)
  if (storeIds.length === 0) return NextResponse.json({ photos: [] })

  // A storeId param narrows to one location; without it the merchant gets
  // every location's photos. Either way the set is bounded to stores they own.
  const requested = req.nextUrl.searchParams.get('storeId')
  const scope = requested
    ? storeIds.filter(id => id === requested)
    : storeIds

  if (scope.length === 0) return NextResponse.json({ photos: [] })

  const { data, error } = await admin
    .from('store_bin_photos')
    .select('id, store_id, storage_path, caption, display_order, active, created_at')
    .in('store_id', scope)
    .eq('active', true)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[merchant/bin-photos] GET failed:', error)
    return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  }

  const rows = (data ?? []) as PhotoRow[]
  const signed = await signBinPhotos(admin, rows.map(r => r.storage_path))

  return NextResponse.json({
    photos: rows.map(r => ({
      id:           r.id,
      storeId:      r.store_id,
      url:          signed[r.storage_path] ?? null,
      caption:      r.caption,
      displayOrder: r.display_order ?? 0,
      createdAt:    r.created_at,
    })),
    maxPerStore: MAX_PHOTOS_PER_STORE,
  })
}

export async function POST(req: NextRequest) {
  const merchant = await findMerchantForRequest<{ id: string }>('id')
  if (!merchant) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 })

  const admin = createAdminSupabaseClient()

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const storeId = String(form.get('storeId') ?? '').trim()
  const caption = String(form.get('caption') ?? '').trim().slice(0, MAX_CAPTION_LENGTH)
  const file = form.get('file')

  const storeIds = await merchantStoreIds(admin, merchant.id)
  if (!storeId || !storeIds.includes(storeId)) {
    return NextResponse.json({ error: 'invalid_store' }, { status: 400 })
  }

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'no_file' }, { status: 400 })
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 400 })
  }

  // Cap enforced here, not only in the UI — the UI hides the control at five,
  // but the route is what actually holds the line.
  const { count } = await admin
    .from('store_bin_photos')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .eq('active', true)

  if ((count ?? 0) >= MAX_PHOTOS_PER_STORE) {
    return NextResponse.json({ error: 'limit_reached' }, { status: 409 })
  }

  let encoded: Buffer
  try {
    encoded = await encodeBinPhoto(Buffer.from(await file.arrayBuffer()))
  } catch (err) {
    console.error('[merchant/bin-photos] re-encode failed:', err)
    return NextResponse.json({ error: 'unreadable_image' }, { status: 400 })
  }

  // The row is created first so the id can key the storage path — that keeps
  // one file per row and makes an orphaned object impossible to mistake for a
  // live photo. If the upload then fails the row is removed again.
  const nextOrder = count ?? 0
  const { data: inserted, error: insertError } = await admin
    .from('store_bin_photos')
    .insert({
      store_id:      storeId,
      storage_path:  'pending',
      caption:       caption || null,
      display_order: nextOrder,
      active:        true,
    })
    .select('id')
    .single()

  if (insertError || !inserted) {
    console.error('[merchant/bin-photos] insert failed:', insertError)
    return NextResponse.json({ error: 'save_failed' }, { status: 500 })
  }

  const path = binPhotoPath(storeId, inserted.id)

  const { error: uploadError } = await admin.storage
    .from(BIN_PHOTOS_BUCKET)
    .upload(path, encoded, { contentType: 'image/jpeg', upsert: true })

  if (uploadError) {
    console.error('[merchant/bin-photos] upload failed:', uploadError.message)
    await admin.from('store_bin_photos').delete().eq('id', inserted.id)
    return NextResponse.json({ error: 'upload_failed' }, { status: 500 })
  }

  const { error: pathError } = await admin
    .from('store_bin_photos')
    .update({ storage_path: path })
    .eq('id', inserted.id)

  if (pathError) {
    console.error('[merchant/bin-photos] path update failed:', pathError.message)
    await admin.storage.from(BIN_PHOTOS_BUCKET).remove([path])
    await admin.from('store_bin_photos').delete().eq('id', inserted.id)
    return NextResponse.json({ error: 'save_failed' }, { status: 500 })
  }

  const signed = await signBinPhotos(admin, [path])

  return NextResponse.json({
    photo: {
      id:           inserted.id,
      storeId,
      url:          signed[path] ?? null,
      caption:      caption || null,
      displayOrder: nextOrder,
      createdAt:    new Date().toISOString(),
    },
  }, { status: 201 })
}
