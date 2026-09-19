/**
 * GET   /api/admin/marketing-templates — every template and its state
 * POST  /api/admin/marketing-templates — upload/replace one template's artwork
 * PATCH /api/admin/marketing-templates — adjust a template's overlay rectangles
 *
 * The artwork behind every merchant marketing material. Replacing one here
 * changes what every merchant downloads from their next request — the files
 * are built per download, so there is no cache to bust.
 *
 * WHY THE RECTANGLES ARE EDITABLE: they say where a design's [STORE NAME] and
 * [QR CODE] placeholders sit, as fractions of the artwork. A replacement
 * design puts them somewhere else, and without a way to move them the new
 * artwork would be stamped in the old positions. They are normalised so a
 * replacement at a different resolution still lines up.
 *
 * Auth: admin session. Storage and data: admin client — both buckets are
 * private and the table has RLS with no policies.
 *
 * Responses:
 *   GET   200 { templates: [{ slug, label, bucket, hasArtwork, previewUrl, nameRect, qrRect }] }
 *   POST  201 { template: {...} }
 *         400 { error: 'no_file' | 'file_too_large' | 'unreadable_image' }
 *   PATCH 200 { ok: true }
 *   403   { error: 'forbidden' }
 *   404   { error: 'unknown_template' }
 */

import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { verifyAdmin } from '@/lib/admin-auth'
import type { Rect } from '@/lib/marketing-render'

/** Templates are print artwork, so they are left at full resolution rather
 *  than downsized — only pathological uploads are refused. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

const SIGNED_TTL = 60 * 60

interface Row {
  slug: string
  label: string
  bucket: string
  storage_path: string | null
  name_rect: Rect
  qr_rect: Rect
  display_order: number
  updated_at: string | null
}

function validRect(v: unknown): v is Rect {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return (['x', 'y', 'w', 'h'] as const).every(k => {
    const n = r[k]
    return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1
  }) && (r.w as number) > 0 && (r.h as number) > 0
}

export async function GET() {
  const email = await verifyAdmin()
  if (!email) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const admin = createAdminSupabaseClient()
  const { data } = await admin
    .from('marketing_templates')
    .select('slug, label, bucket, storage_path, name_rect, qr_rect, display_order, updated_at')
    .order('display_order', { ascending: true })

  const rows = (data ?? []) as Row[]

  // One signed URL per bucket batch, so the tab can show what is actually
  // stored rather than a filename.
  const byBucket = new Map<string, string[]>()
  for (const r of rows) {
    if (!r.storage_path) continue
    byBucket.set(r.bucket, [...(byBucket.get(r.bucket) ?? []), r.storage_path])
  }
  const signed: Record<string, string> = {}
  for (const [bucket, paths] of byBucket) {
    const { data: urls } = await admin.storage.from(bucket).createSignedUrls(paths, SIGNED_TTL)
    for (let i = 0; i < (urls?.length ?? 0); i++) {
      const u = urls?.[i]?.signedUrl
      if (u) signed[`${bucket}/${paths[i]}`] = u
    }
  }

  return NextResponse.json({
    templates: rows.map(r => ({
      slug: r.slug,
      label: r.label,
      bucket: r.bucket,
      hasArtwork: !!r.storage_path,
      previewUrl: r.storage_path ? signed[`${r.bucket}/${r.storage_path}`] ?? null : null,
      nameRect: r.name_rect,
      qrRect: r.qr_rect,
      updatedAt: r.updated_at,
    })),
  })
}

export async function POST(req: NextRequest) {
  const email = await verifyAdmin()
  if (!email) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const slug = String(form.get('slug') ?? '').trim()
  const file = form.get('file')

  const admin = createAdminSupabaseClient()
  const { data: row } = await admin
    .from('marketing_templates')
    .select('slug, bucket, storage_path')
    .eq('slug', slug)
    .maybeSingle()

  if (!row) return NextResponse.json({ error: 'unknown_template' }, { status: 404 })

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'no_file' }, { status: 400 })
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 400 })
  }

  // Normalised to PNG. These are composited onto rather than displayed, so
  // they stay lossless; re-encoding also rejects anything sharp cannot read
  // before it reaches storage.
  let png: Buffer
  try {
    png = await sharp(Buffer.from(await file.arrayBuffer())).rotate().png().toBuffer()
  } catch (err) {
    console.error('[admin/marketing-templates] re-encode failed:', err)
    return NextResponse.json({ error: 'unreadable_image' }, { status: 400 })
  }

  // A stable path per slug: replacing artwork overwrites in place, so there is
  // never a second file for the same template to go stale.
  const path = `${slug}.png`
  const { error: upErr } = await admin.storage
    .from(row.bucket as string)
    .upload(path, png, { contentType: 'image/png', upsert: true })

  if (upErr) {
    console.error('[admin/marketing-templates] upload failed:', upErr.message)
    return NextResponse.json({ error: 'upload_failed' }, { status: 500 })
  }

  await admin
    .from('marketing_templates')
    .update({ storage_path: path, updated_at: new Date().toISOString(), updated_by: email })
    .eq('slug', slug)

  const { data: urls } = await admin.storage
    .from(row.bucket as string).createSignedUrls([path], SIGNED_TTL)

  const meta = await sharp(png).metadata()

  return NextResponse.json({
    template: {
      slug,
      hasArtwork: true,
      previewUrl: urls?.[0]?.signedUrl ?? null,
      width: meta.width,
      height: meta.height,
    },
  }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const email = await verifyAdmin()
  if (!email) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null) as
    { slug?: unknown; nameRect?: unknown; qrRect?: unknown } | null
  if (!body || typeof body.slug !== 'string') {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (body.nameRect !== undefined) {
    if (!validRect(body.nameRect)) return NextResponse.json({ error: 'invalid_rect' }, { status: 400 })
    updates.name_rect = body.nameRect
  }
  if (body.qrRect !== undefined) {
    if (!validRect(body.qrRect)) return NextResponse.json({ error: 'invalid_rect' }, { status: 400 })
    updates.qr_rect = body.qrRect
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no_fields' }, { status: 400 })
  }

  updates.updated_at = new Date().toISOString()
  updates.updated_by = email

  const admin = createAdminSupabaseClient()
  const { error } = await admin
    .from('marketing_templates').update(updates).eq('slug', body.slug)

  if (error) {
    console.error('[admin/marketing-templates] rect save failed:', error.message)
    return NextResponse.json({ error: 'save_failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
