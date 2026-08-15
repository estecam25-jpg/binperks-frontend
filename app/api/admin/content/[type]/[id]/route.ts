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

  return NextResponse.json({ item: data })
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
  const { error } = await admin.from(type.table).delete().eq('id', id)

  if (error) {
    console.error(`[admin/content/${slug}] DELETE failed:`, error)
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
