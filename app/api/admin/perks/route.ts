/**
 * /api/admin/perks — pull a live perk from member view, or put it back
 *
 * GET    every live perk across the network, with its store
 * PATCH  { perkId, hidden: true, reason } | { perkId, hidden: false }
 *
 * The escape hatch for a perk that breaks the rules — one that involves
 * chance, or promises something a store cannot deliver — once it is already
 * live. Hiding takes it off members' screens immediately; the merchant keeps
 * the slot and is shown the reason in their dashboard, so they know to pick
 * something else rather than wondering where their perk went.
 *
 * HIDING IS NOT DELETING. The row stays, so the merchant can see what was
 * hidden and why, and so un-hiding is one click if the call was wrong.
 *
 * A REASON IS REQUIRED TO HIDE, for the same purpose it serves on a declined
 * submission: it is the only thing the merchant is told.
 *
 * Auth: admin allow-list. Data: admin client.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin-auth'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

export async function GET() {
  if (!await verifyAdmin()) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from('perks')
    .select('id, store_id, slot, member_type, title, description, is_active, menu_perk_id, hidden_at, hidden_reason')
    .eq('is_active', true)
    .order('slot', { ascending: true })

  if (error) {
    console.error('[admin/perks] load failed:', error)
    return NextResponse.json({ error: 'load_failed' }, { status: 500 })
  }

  const rows = data ?? []
  const storeIds = [...new Set(rows.map(r => r.store_id as string))]
  const { data: stores } = storeIds.length
    ? await admin.from('stores').select('id, display_name').in('id', storeIds)
    : { data: [] as { id: string; display_name: string | null }[] }
  const nameById = new Map((stores ?? []).map(s => [s.id as string, (s.display_name as string) ?? '—']))

  return NextResponse.json({
    perks: rows.map(r => ({
      id:           r.id,
      storeId:      r.store_id,
      storeName:    nameById.get(r.store_id as string) ?? '—',
      slot:         r.slot,
      memberType:   r.member_type,
      title:        r.title,
      description:  r.description,
      // Null means it predates the perk menu — the merchant's own wording,
      // live until they choose a menu option for that slot.
      fromMenu:     !!r.menu_perk_id,
      hidden:       !!r.hidden_at,
      hiddenReason: r.hidden_reason,
    })),
  })
}

export async function PATCH(req: NextRequest) {
  const adminEmail = await verifyAdmin()
  if (!adminEmail) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const perkId = String(body.perkId ?? '')
  const hidden = body.hidden === true
  const reason = String(body.reason ?? '').trim()

  if (!perkId) return NextResponse.json({ error: 'perkId required' }, { status: 400 })
  if (hidden && !reason) {
    return NextResponse.json({
      error: 'reason_required',
      message: 'Give a reason — the merchant is shown it word for word.',
    }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from('perks')
    .update(hidden
      ? { hidden_at: new Date().toISOString(), hidden_reason: reason }
      : { hidden_at: null, hidden_reason: null })
    .eq('id', perkId)
    .select('id, title, store_id')
    .maybeSingle()

  if (error || !data) {
    console.error('[admin/perks] update failed:', error)
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }

  console.log(`[admin/perks] ${adminEmail} ${hidden ? 'hid' : 'un-hid'} perk ${perkId} ("${data.title}")`)
  return NextResponse.json({ ok: true, hidden })
}
