/**
 * GET  /api/admin/content/[type]
 * POST /api/admin/content/[type]
 *
 * Admin CRUD for BinPerks-owned content. One dynamic route serves every type —
 * the URLs are exactly the per-type paths (/api/admin/content/promos,
 * /api/admin/content/suggested-perks, …); only the implementation is shared.
 * See lib/admin-content for the type registry.
 *
 * GET returns ALL rows including inactive ones — this is the management view,
 * not the feed. The member-facing routes filter to active.
 *
 * Auth: admin session, verified on every request. Data: admin client.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { verifyAdmin } from '@/lib/admin-auth'
import { contentTypeBySlug, columnsFor, writableColumnsFor, applyFeedOrder } from '@/lib/admin-content'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  const adminEmail = await verifyAdmin()
  if (!adminEmail) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { type: slug } = await params
  const type = contentTypeBySlug(slug)
  if (!type) return NextResponse.json({ error: 'unknown_type' }, { status: 404 })

  const admin = createAdminSupabaseClient()
  const { data, error } = await applyFeedOrder(
    admin.from(type.table).select(columnsFor(type).join(', ')),
    type,
  )

  if (error) {
    console.error(`[admin/content/${slug}] GET failed:`, error)
    return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  }

  return NextResponse.json({ items: data ?? [] })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  const adminEmail = await verifyAdmin()
  if (!adminEmail) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { type: slug } = await params
  const type = contentTypeBySlug(slug)
  if (!type) return NextResponse.json({ error: 'unknown_type' }, { status: 404 })

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  // Built from the registry, never from the body's own keys: an unexpected key
  // cannot reach the table, so a caller can't set id or created_at.
  const row: Record<string, unknown> = {}
  for (const col of writableColumnsFor(type)) {
    if (body[col] !== undefined) row[col] = body[col]
  }

  for (const f of type.fields) {
    if (f.required && !String(row[f.name] ?? '').trim()) {
      return NextResponse.json({ error: `${f.label} is required` }, { status: 400 })
    }
  }

  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from(type.table)
    .insert(row)
    .select(columnsFor(type).join(', '))
    .single()

  if (error) {
    console.error(`[admin/content/${slug}] POST failed:`, error)
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 })
  }

  return NextResponse.json({ item: data }, { status: 201 })
}
