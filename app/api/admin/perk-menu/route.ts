/**
 * /api/admin/perk-menu — the shared list every merchant chooses from
 *
 * GET    every option, retired ones included, in display order
 * POST   add one
 * PATCH  edit one, or retire / un-retire it
 *
 * ── RETIRE, NEVER DELETE ───────────────────────────────────────────────────
 * There is no DELETE. A menu row may be referenced by live perks at any number
 * of stores, and removing it would either strip those perks off members'
 * screens or leave the rows orphaned. Retiring takes the option out of the
 * dropdown and leaves every store already offering it untouched — which is the
 * only behaviour that is safe once a perk has been promised to a member.
 *
 * ── EDITING DOES NOT REWRITE HISTORY ───────────────────────────────────────
 * Perks snapshot the menu's wording when they are chosen (see
 * /api/merchant/perks), so fixing a typo here changes what future merchants
 * select and leaves current promises exactly as they were made. That is
 * deliberate: a member who was told "10% off" should not find out later that
 * the wording moved under them.
 *
 * Auth: admin allow-list. Data: admin client.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin-auth'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { MENU_COLUMNS, toMenuPerk } from '@/lib/perk-menu'

export async function GET() {
  if (!await verifyAdmin()) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from('perk_menu')
    .select(MENU_COLUMNS)
    .order('group_order', { ascending: true })
    .order('display_order', { ascending: true })

  if (error) {
    console.error('[admin/perk-menu] load failed:', error)
    return NextResponse.json({ error: 'load_failed' }, { status: 500 })
  }

  const perks = (data ?? []).map(r => toMenuPerk(r as Record<string, unknown>))

  // How many stores offer each option, so retiring is an informed decision.
  const { data: usage } = await admin.from('perks').select('menu_perk_id').not('menu_perk_id', 'is', null)
  const inUse = new Map<string, number>()
  for (const u of usage ?? []) {
    const id = u.menu_perk_id as string
    inUse.set(id, (inUse.get(id) ?? 0) + 1)
  }

  return NextResponse.json({
    perks: perks.map(p => ({ ...p, inUseCount: inUse.get(p.id) ?? 0 })),
  })
}

export async function POST(req: NextRequest) {
  const adminEmail = await verifyAdmin()
  if (!adminEmail) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const groupName   = String(body.groupName ?? '').trim()
  const title       = String(body.title ?? '').trim()
  const description = String(body.description ?? '').trim()

  if (!groupName || !title || !description) {
    return NextResponse.json({ error: 'groupName, title and description are required' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()

  // Inherit the group's existing order, and land at the end of it, so adding
  // an option never reshuffles the menu a merchant is used to.
  const { data: sibling } = await admin
    .from('perk_menu')
    .select('group_order, display_order')
    .eq('group_name', groupName)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: lastGroup } = await admin
    .from('perk_menu')
    .select('group_order')
    .order('group_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const groupOrder = sibling
    ? Number(sibling.group_order)
    : Number(lastGroup?.group_order ?? 0) + 1

  const { data: created, error } = await admin
    .from('perk_menu')
    .insert({
      group_name:    groupName,
      group_order:   groupOrder,
      title,
      description,
      display_order: Number(sibling?.display_order ?? 0) + 1,
    })
    .select(MENU_COLUMNS)
    .single()

  if (error || !created) {
    console.error('[admin/perk-menu] insert failed:', error)
    return NextResponse.json({ error: 'create_failed' }, { status: 500 })
  }

  console.log(`[admin/perk-menu] ${adminEmail} added "${title}" to ${groupName}`)
  return NextResponse.json({ perk: toMenuPerk(created as Record<string, unknown>) })
}

export async function PATCH(req: NextRequest) {
  const adminEmail = await verifyAdmin()
  if (!adminEmail) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const id = String(body.id ?? '')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.groupName    !== undefined) patch.group_name    = String(body.groupName).trim()
  if (body.title        !== undefined) patch.title         = String(body.title).trim()
  if (body.description  !== undefined) patch.description   = String(body.description).trim()
  if (body.groupOrder   !== undefined) patch.group_order   = Number(body.groupOrder)
  if (body.displayOrder !== undefined) patch.display_order = Number(body.displayOrder)
  // retired: true/false — the only way an option leaves the dropdown.
  if (body.retired      !== undefined) patch.retired_at    = body.retired ? new Date().toISOString() : null

  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from('perk_menu').update(patch).eq('id', id).select(MENU_COLUMNS).maybeSingle()

  if (error || !data) {
    console.error('[admin/perk-menu] update failed:', error)
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }

  console.log(`[admin/perk-menu] ${adminEmail} updated ${id}${body.retired !== undefined ? ` (retired=${!!body.retired})` : ''}`)
  return NextResponse.json({ perk: toMenuPerk(data as Record<string, unknown>) })
}
