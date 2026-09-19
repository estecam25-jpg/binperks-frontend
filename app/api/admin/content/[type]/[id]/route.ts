/**
 * PATCH  /api/admin/content/[type]/[id]
 * DELETE /api/admin/content/[type]/[id]
 *
 * Update or remove one content row. See lib/admin-content for the registry and
 * the sibling route for the list/create half.
 *
 * Auth: admin session, verified on every request. Data: admin client.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { verifyAdmin } from '@/lib/admin-auth'
import { contentTypeBySlug, columnsFor, writableColumnsFor } from '@/lib/admin-content'
import { attachImageUrls, typeHasImage, removeContentImage } from '@/lib/content-images'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const adminEmail = await verifyAdmin()
  if (!adminEmail) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { type: slug, id } = await params
  const type = contentTypeBySlug(slug)
  if (!type) return NextResponse.json({ error: 'unknown_type' }, { status: 404 })

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  // Same registry-driven allow-list as POST. Only keys actually present are
  // touched, so the Active/Pinned toggles can PATCH one field on their own.
  const updates: Record<string, unknown> = {}
  for (const col of writableColumnsFor(type)) {
    if (body[col] !== undefined) updates[col] = body[col]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no_fields' }, { status: 400 })
  }

  for (const f of type.fields) {
    if (f.required && updates[f.name] !== undefined && !String(updates[f.name] ?? '').trim()) {
      return NextResponse.json({ error: `${f.label} is required` }, { status: 400 })
    }
  }

  const admin = createAdminSupabaseClient()

  // The image the row points at BEFORE this write. If the update swaps it for
  // a different one — or clears it — the old object is removed afterwards, so
  // the bucket does not keep a copy per edit. Read first, delete last: a failed
  // update must not take the live picture with it.
  let previousImage: string | null = null
  if (typeHasImage(type) && updates.image_path !== undefined) {
    const { data: before } = await admin
      .from(type.table).select('image_path').eq('id', id).maybeSingle()
    previousImage = (before?.image_path as string | null) ?? null
  }

  const { data, error } = await admin
    .from(type.table)
    .update(updates)
    .eq('id', id)
    .select(columnsFor(type).join(', '))
    .single()

  if (error) {
    console.error(`[admin/content/${slug}] PATCH failed:`, error)
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }

  if (previousImage && previousImage !== updates.image_path) {
    await removeContentImage(admin, previousImage)
  }

  const [item] = await attachImageUrls(admin, type, [data as unknown as Record<string, unknown>])

  return NextResponse.json({ item })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const adminEmail = await verifyAdmin()
  if (!adminEmail) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { type: slug, id } = await params
  const type = contentTypeBySlug(slug)
  if (!type) return NextResponse.json({ error: 'unknown_type' }, { status: 404 })

  const admin = createAdminSupabaseClient()

  // Read the path before the row goes, so the object can go with it. A soft
  // orphan here would be a file nothing points at and nobody can find.
  let imagePath: string | null = null
  if (typeHasImage(type)) {
    const { data: before } = await admin
      .from(type.table).select('image_path').eq('id', id).maybeSingle()
    imagePath = (before?.image_path as string | null) ?? null
  }

  const { error } = await admin.from(type.table).delete().eq('id', id)

  if (error) {
    console.error(`[admin/content/${slug}] DELETE failed:`, error)
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 })
  }

  await removeContentImage(admin, imagePath)

  return NextResponse.json({ ok: true })
}
