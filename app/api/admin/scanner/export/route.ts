/**
 * GET /api/admin/scanner/export
 *
 * Downloads every scanner_events row as CSV. Admin-only, read-only.
 *
 * This exports member names alongside scan activity. That is deliberate and
 * permitted: BinPerks owns all member data (CLAUDE.md rule 16). The rule bars
 * MERCHANTS from exporting member data — this route is behind the admin
 * allow-list and must never be reachable from a merchant session.
 *
 * Responses:
 *   200 text/csv attachment
 *   401 { error: 'forbidden' }
 */

import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin-auth'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

const COLUMNS = [
  'scan_id', 'member_id', 'member_name', 'store_id', 'store_name', 'scanned_at',
  'identified_product', 'identified_category', 'ai_confidence',
  'estimated_retail_price', 'member_choice', 'choice_recorded_at',
] as const

/**
 * RFC 4180 field encoding, plus a guard against spreadsheet formula injection.
 *
 * A cell beginning with = + - @ or a control character is executed as a
 * formula by Excel and Sheets. Product names here come from a vision model
 * reading member-supplied photos, so they are not trusted input. The leading
 * apostrophe is the standard neutraliser and is stripped on display by both
 * applications.
 */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  const risky = /^[=+\-@\t\r]/.test(s)
  const escaped = (risky ? `'${s}` : s).replace(/"/g, '""')
  return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped
}

/**
 * Unwrap an embedded to-one relation.
 *
 * CLAUDE.md rule 9 says joins always return arrays. That holds for to-many
 * embeds, but NOT for a to-one embed through a foreign-key column: on
 * supabase-js 2.108.2 `members:member_id ( ... )` comes back as a plain object.
 * Indexing [0] on it yields undefined, which is how you end up silently
 * exporting blank names for every row. Verified directly against this project.
 *
 * Handles both shapes so the export survives a client upgrade either way.
 */
function toOne<T>(rel: T | T[] | null | undefined): T | undefined {
  if (!rel) return undefined
  return Array.isArray(rel) ? rel[0] : rel
}

export async function GET() {
  const adminEmail = await verifyAdmin()
  if (!adminEmail) return NextResponse.json({ error: 'forbidden' }, { status: 401 })

  const admin = createAdminSupabaseClient()

  const { data, error } = await admin
    .from('scanner_events')
    .select(`
      id, member_id, store_id, scanned_at,
      identified_product, identified_category, ai_confidence,
      estimated_retail_price, member_choice, choice_recorded_at,
      members:member_id ( first_name, last_name ),
      stores:store_id ( display_name )
    `)
    .order('scanned_at', { ascending: false })

  if (error) {
    console.error('[admin/scanner/export] query failed:', error)
    return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  }

  const rows = (data ?? []).map(r => {
    const member = toOne(r.members as { first_name?: string; last_name?: string } | { first_name?: string; last_name?: string }[] | null)
    const store  = toOne(r.stores  as { display_name?: string } | { display_name?: string }[] | null)
    const name   = [member?.first_name, member?.last_name].filter(Boolean).join(' ')

    return [
      r.id,
      r.member_id,
      name,
      r.store_id,
      store?.display_name ?? '',
      r.scanned_at,
      r.identified_product,
      r.identified_category,
      r.ai_confidence,
      r.estimated_retail_price,
      r.member_choice,
      r.choice_recorded_at,
    ].map(csvCell).join(',')
  })

  const csv = [COLUMNS.join(','), ...rows].join('\r\n') + '\r\n'

  // Local date, so the filename matches the day the admin actually clicked.
  const d = new Date()
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  return new NextResponse(csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="binperks-scanner-${stamp}.csv"`,
      'Cache-Control':       'no-store',
    },
  })
}
