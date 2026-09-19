/**
 * GET   /api/admin/social-graphics — the whole kit: images + caption
 * POST  /api/admin/social-graphics — upload one image (multipart form)
 * PATCH /api/admin/social-graphics — save the caption, or reorder the images
 *
 * Admin-only. These rows are network-wide: what is written here appears on
 * EVERY merchant's Marketing tab immediately, with no per-merchant copy to
 * keep in sync. There is no publish step and no draft — a save is live.
 *
 * Auth: admin session (lib/admin-auth). Data: admin client, because the bucket
 * is private and both tables have RLS on with no policies.
 *
 * Responses:
 *   GET   200 { images: [{ id, url, displayOrder }], caption, maxImages, token }
 *   POST  201 { image: { id, url, displayOrder } }
 *         400 { error: 'no_file' | 'file_too_large' | 'unreadable_image' }
 *         409 { error: 'limit_reached' }
 *   PATCH 200 { ok: true, caption? }
 *         400 { error: 'invalid_request' }
 *   401   { error: 'forbidden' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { verifyAdmin } from '@/lib/admin-auth'
import {
  SOCIAL_GRAPHICS_BUCKET, MAX_SOCIAL_GRAPHICS, MAX_UPLOAD_BYTES, MAX_CAPTION_LENGTH,
  REFERRAL_LINK_TOKEN, socialGraphicPath, encodeSocialGraphic, signSocialGraphics,
  loadSocialKit,
} from '@/lib/social-graphics'

export async function GET() {
  const email = await verifyAdmin()
  if (!email) return NextResponse.json({ error: 'forbidden' }, { status: 401 })

  const admin = createAdminSupabaseClient()
  const kit = await loadSocialKit(admin)

  return NextResponse.json({
    ...kit,
    maxImages: MAX_SOCIAL_GRAPHICS,
    // Sent rather than hardcoded in the tab, so the string admin is told to
    // type is literally the one the substitution looks for.
    token: REFERRAL_LINK_TOKEN,
  })
}

export async function POST(req: NextRequest) {
  const email = await verifyAdmin()
  if (!email) return NextResponse.json({ error: 'forbidden' }, { status: 401 })

  const admin = createAdminSupabaseClient()

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'no_file' }, { status: 400 })
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 400 })
  }

  // The cap is held HERE, not only in the UI. The tab hides the picker at ten,
  // but the route is what actually holds the line.
  const { count } = await admin
    .from('binperks_social_graphics')
    .select('id', { count: 'exact', head: true })

  if ((count ?? 0) >= MAX_SOCIAL_GRAPHICS) {
    return NextResponse.json({ error: 'limit_reached' }, { status: 409 })
  }

  let encoded: Buffer
  try {
    encoded = await encodeSocialGraphic(Buffer.from(await file.arrayBuffer()))
  } catch (err) {
    console.error('[admin/social-graphics] re-encode failed:', err)
    return NextResponse.json({ error: 'unreadable_image' }, { status: 400 })
  }

  // Row first, so its id keys the storage path: one file per row, and an
  // orphaned object can never be mistaken for a live image. If the upload then
  // fails the row is removed again.
  const nextOrder = count ?? 0
  const { data: inserted, error: insertError } = await admin
    .from('binperks_social_graphics')
    .insert({ storage_path: 'pending', display_order: nextOrder })
    .select('id')
    .single()

  if (insertError || !inserted) {
    console.error('[admin/social-graphics] insert failed:', insertError)
    return NextResponse.json({ error: 'save_failed' }, { status: 500 })
  }

  const path = socialGraphicPath(inserted.id)

  const { error: uploadError } = await admin.storage
    .from(SOCIAL_GRAPHICS_BUCKET)
    .upload(path, encoded, { contentType: 'image/jpeg', upsert: true })

  if (uploadError) {
    console.error('[admin/social-graphics] upload failed:', uploadError.message)
    await admin.from('binperks_social_graphics').delete().eq('id', inserted.id)
    return NextResponse.json({ error: 'upload_failed' }, { status: 500 })
  }

  const { error: pathError } = await admin
    .from('binperks_social_graphics')
    .update({ storage_path: path })
    .eq('id', inserted.id)

  if (pathError) {
    console.error('[admin/social-graphics] path update failed:', pathError.message)
    await admin.storage.from(SOCIAL_GRAPHICS_BUCKET).remove([path])
    await admin.from('binperks_social_graphics').delete().eq('id', inserted.id)
    return NextResponse.json({ error: 'save_failed' }, { status: 500 })
  }

  const signed = await signSocialGraphics(admin, [path])

  return NextResponse.json({
    image: { id: inserted.id, url: signed[path] ?? null, displayOrder: nextOrder },
  }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const email = await verifyAdmin()
  if (!email) return NextResponse.json({ error: 'forbidden' }, { status: 401 })

  const body = await req.json().catch(() => null) as
    { caption?: unknown; order?: unknown } | null
  if (!body) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const admin = createAdminSupabaseClient()

  // ── Caption ──
  // An explicit empty string clears it; an absent key leaves it alone. Saving
  // an empty caption is a real intent — it is how admin takes the caption down
  // without deleting the artwork.
  if (typeof body.caption === 'string') {
    const trimmed = body.caption.trim().slice(0, MAX_CAPTION_LENGTH)
    const { error } = await admin
      .from('binperks_social_settings')
      .update({
        caption:    trimmed || null,
        updated_at: new Date().toISOString(),
        updated_by: email,
      })
      .eq('id', 'default')

    if (error) {
      console.error('[admin/social-graphics] caption save failed:', error.message)
      return NextResponse.json({ error: 'save_failed' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, caption: trimmed || null })
  }

  // ── Order ──
  // The full list of ids in their new order. Rewriting every row is what keeps
  // the sequence dense and total: a swap that only touched two rows would
  // drift as images are added and deleted around it.
  if (Array.isArray(body.order)) {
    const ids = body.order.filter((v): v is string => typeof v === 'string')
    if (ids.length === 0 || ids.length > MAX_SOCIAL_GRAPHICS) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
    }

    // Sequential rather than parallel: ten rows at most, and a partial reorder
    // is easier to reason about when the failure point is known.
    for (let i = 0; i < ids.length; i++) {
      const { error } = await admin
        .from('binperks_social_graphics')
        .update({ display_order: i })
        .eq('id', ids[i])
      if (error) {
        console.error('[admin/social-graphics] reorder failed:', error.message)
        return NextResponse.json({ error: 'save_failed' }, { status: 500 })
      }
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
}
