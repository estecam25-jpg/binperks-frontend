/**
 * POST /api/admin/content/[type]/image — upload one card image
 *
 * Multipart. Returns the STORAGE PATH to put in the form's image_path field,
 * plus a signed URL so the form can show a preview immediately.
 *
 * SEPARATE FROM THE ROW WRITE on purpose: the image is chosen in the add form
 * before any row exists, so it cannot be keyed by a row id. It gets its own
 * uuid, and the row simply points at it.
 *
 * `replaces` carries the path the row pointed at before, if any. Sending it
 * deletes that object once the new one is safely up, so editing a card's image
 * five times leaves one file rather than five.
 *
 * Auth: admin session. Data and storage: admin client — the bucket is private.
 *
 * Responses:
 *   201 { path, url }
 *   400 { error: 'no_file' | 'file_too_large' | 'unreadable_image' }
 *   403 { error: 'forbidden' }
 *   404 { error: 'unknown_type' | 'type_has_no_image' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { verifyAdmin } from '@/lib/admin-auth'
import { contentTypeBySlug } from '@/lib/admin-content'
import {
  CONTENT_IMAGES_BUCKET, MAX_UPLOAD_BYTES, contentImagePath,
  encodeContentImage, signContentImages, typeHasImage, removeContentImage,
} from '@/lib/content-images'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  const adminEmail = await verifyAdmin()
  if (!adminEmail) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { type: slug } = await params
  const type = contentTypeBySlug(slug)
  if (!type) return NextResponse.json({ error: 'unknown_type' }, { status: 404 })
  // Promos and Suggested Perks have no artwork, and this route is what keeps
  // an upload from landing in a folder nothing will ever read.
  if (!typeHasImage(type)) {
    return NextResponse.json({ error: 'type_has_no_image' }, { status: 404 })
  }

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'no_file' }, { status: 400 })
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 400 })
  }

  let encoded: Buffer
  try {
    encoded = await encodeContentImage(Buffer.from(await file.arrayBuffer()))
  } catch (err) {
    console.error(`[admin/content/${slug}/image] re-encode failed:`, err)
    return NextResponse.json({ error: 'unreadable_image' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()
  const path = contentImagePath(slug, randomUUID())

  const { error: uploadError } = await admin.storage
    .from(CONTENT_IMAGES_BUCKET)
    .upload(path, encoded, { contentType: 'image/jpeg', upsert: true })

  if (uploadError) {
    console.error(`[admin/content/${slug}/image] upload failed:`, uploadError.message)
    return NextResponse.json({ error: 'upload_failed' }, { status: 500 })
  }

  // Only after the new object is up. Failing here would otherwise delete the
  // picture the card is still pointing at.
  const replaces = String(form.get('replaces') ?? '').trim()
  if (replaces && replaces !== path && replaces.startsWith(`${slug}/`)) {
    await removeContentImage(admin, replaces)
  }

  const signed = await signContentImages(admin, [path])

  return NextResponse.json({ path, url: signed[path] ?? null }, { status: 201 })
}
