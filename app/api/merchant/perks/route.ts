/**
 * GET  /api/merchant/perks?storeId=...
 * POST /api/merchant/perks  body: { storeId, freePerks: [...], vipPerks: [...] }
 *
 * Rules, from Merchant Agreement V3.6 section 6.2:
 *   - Starter (free): 3 slots, the FIRST ONE REQUIRED, the other two optional
 *   - VIP:            5 slots, the FIRST THREE REQUIRED, the other two optional
 *   - member_type distinguishes 'free' from 'vip' rows, and THE SLOT IS WHAT
 *     DECIDES WHO GETS THE PERK — a Starter slot reaches every member, a VIP
 *     slot only VIP members
 *   - POST deletes existing perks for the store and re-inserts, to avoid
 *     depending on a specific unique constraint shape
 *
 * ── MENU-ONLY, WITH ONE EXCEPTION THAT MATTERS ─────────────────────────────
 * A slot is filled by choosing a perk_menu option; there is no free typing.
 * The chosen option's title and sentence are SNAPSHOT onto the perk row rather
 * than read through a join, so re-wording a menu entry later never silently
 * rewrites what a store has already been promising its members.
 *
 * The exception is every perk that existed before the menu did. Those rows
 * have menu_perk_id null and their own wording, and they STAY LIVE EXACTLY AS
 * THEY ARE until the merchant picks something else for that slot — which is
 * why the POST carries a legacy slot forward verbatim instead of reading "no
 * menu id" as "empty". Treating them as empty would have pulled live perks off
 * real stores the moment this shipped.
 *
 * ── REQUIRED MEANS FILLED ──────────────────────────────────────────────────
 * Checked here, not only in the form: a stale tab, a double submit or a direct
 * POST all reach this route. A required slot is also stored active whatever
 * the request says, because an empty or switched-off required perk is the same
 * broken promise either way.
 *
 * ── CARRY-OVER IS UNCHANGED ────────────────────────────────────────────────
 * There is no monthly job and never was: perks persist until the merchant
 * changes them, which is what the dashboard's "last month's carry over
 * automatically" describes. Nothing here expires anything.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { findMerchantForRequest } from '@/lib/merchant-auth'
import {
  FREE_SLOTS, FREE_REQUIRED, VIP_SLOTS, VIP_REQUIRED,
  missingPerksMessage,
} from '@/lib/perks'

/** See lib/merchant-auth — resilient to a stale merchants.auth_user_id. */
async function getMerchantId() {
  const m = await findMerchantForRequest()
  return m?.id ?? null
}

/** One slot as the form sends it back. */
interface SlotInput {
  slot: number
  /** The chosen perk_menu row. Null for an empty slot, or for a legacy perk
   *  the merchant has not replaced. */
  menuPerkId?: string | null
  /** Carried for legacy slots only — the wording already live at this store. */
  title?: string
  description?: string
  isActive?: boolean
}

/** Is this slot filled? Either a menu choice, or legacy wording still in place. */
function isFilled(s: SlotInput | undefined): boolean {
  if (!s) return false
  return !!s.menuPerkId || !!String(s.title ?? '').trim()
}

function missingSlots(slots: SlotInput[], required: number): number[] {
  const out: number[] = []
  for (let slot = 1; slot <= required; slot++) {
    if (!isFilled(slots.find(s => Number(s.slot) === slot))) out.push(slot)
  }
  return out
}

export async function GET(req: NextRequest) {
  const merchantId = await getMerchantId()
  if (!merchantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminSupabaseClient()
  const storeId = new URL(req.url).searchParams.get('storeId')
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

  const { data: store } = await admin
    .from('stores').select('id').eq('id', storeId).eq('merchant_id', merchantId).single()
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

  const { data: rows } = await admin
    .from('perks')
    .select('slot, title, description, is_active, member_type, menu_perk_id, hidden_at, hidden_reason')
    .eq('store_id', storeId)
    .order('slot')

  const all = rows ?? []

  const build = (type: 'free' | 'vip', count: number) =>
    Array.from({ length: count }, (_, i) => {
      const slot = i + 1
      const p = all.find(r => r.slot === slot && r.member_type === type)
      return {
        slot,
        menuPerkId:  (p?.menu_perk_id as string | null) ?? null,
        title:       p?.title ?? '',
        description: p?.description ?? '',
        isActive:    p?.is_active ?? false,
        // True for a perk chosen before the menu existed. The form shows it as
        // the current choice and says it stays until the merchant replaces it.
        legacy:      !!p && !p.menu_perk_id && !!String(p.title ?? '').trim(),
        // Admin pulled this one from member view; the merchant is told why.
        hidden:       !!p?.hidden_at,
        hiddenReason: (p?.hidden_reason as string | null) ?? null,
      }
    })

  return NextResponse.json({
    freePerks: build('free', FREE_SLOTS),
    vipPerks:  build('vip',  VIP_SLOTS),
  })
}

export async function POST(req: NextRequest) {
  const merchantId = await getMerchantId()
  if (!merchantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminSupabaseClient()
  const { storeId, freePerks, vipPerks } = await req.json()

  if (!storeId || !Array.isArray(freePerks) || !Array.isArray(vipPerks)) {
    return NextResponse.json({ error: 'storeId, freePerks[], and vipPerks[] required' }, { status: 400 })
  }

  const { data: store } = await admin
    .from('stores').select('id').eq('id', storeId).eq('merchant_id', merchantId).single()
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

  const free = freePerks as SlotInput[]
  const vip  = vipPerks  as SlotInput[]

  const missingFree = missingSlots(free, FREE_REQUIRED)
  const missingVip  = missingSlots(vip,  VIP_REQUIRED)
  if (missingFree.length > 0 || missingVip.length > 0) {
    return NextResponse.json({
      error:   'required_perks_missing',
      message: missingPerksMessage(missingFree, missingVip),
      missingFree,
      missingVip,
    }, { status: 400 })
  }

  // ── Resolve every menu choice in one query ───────────────────────────────
  // Checked against the menu rather than trusted: the id arrives from the
  // browser, and a retired option must not become newly selectable however the
  // request was assembled.
  const chosenIds = [...new Set(
    [...free, ...vip].map(s => s.menuPerkId).filter((id): id is string => !!id),
  )]

  const menuById = new Map<string, { title: string; description: string }>()
  if (chosenIds.length > 0) {
    const { data: menuRows } = await admin
      .from('perk_menu')
      .select('id, title, description, retired_at')
      .in('id', chosenIds)

    for (const m of menuRows ?? []) {
      if (m.retired_at) continue          // retired: not newly selectable
      menuById.set(m.id as string, {
        title:       (m.title as string) ?? '',
        description: (m.description as string) ?? '',
      })
    }

    if (chosenIds.some(id => !menuById.has(id))) {
      return NextResponse.json({
        error: 'unknown_perk',
        message: 'One of the perks you chose is no longer available. Reload the page and pick again.',
      }, { status: 400 })
    }
  }

  // ── Keep what admin hid, and what predates the menu ──────────────────────
  // hidden_at is an admin decision; a merchant saving their form must not
  // clear it, and the delete-and-reinsert below would. Read it first and put
  // it back on any slot the merchant has not actually changed.
  const { data: existingRows } = await admin
    .from('perks')
    .select('slot, member_type, menu_perk_id, hidden_at, hidden_reason')
    .eq('store_id', storeId)
  const existing = new Map(
    (existingRows ?? []).map(r => [`${r.member_type}:${r.slot}`, r]),
  )

  const now = new Date().toISOString()

  const rowsFor = (slots: SlotInput[], type: 'free' | 'vip', count: number) =>
    slots
      .filter(s => s.slot >= 1 && s.slot <= count)
      .map(s => {
        const chosen = s.menuPerkId ? menuById.get(s.menuPerkId) : null
        const prior  = existing.get(`${type}:${s.slot}`)
        const unchanged = (prior?.menu_perk_id ?? null) === (s.menuPerkId ?? null)

        return {
          store_id:    storeId,
          merchant_id: merchantId,
          slot:        s.slot,
          member_type: type,
          // A menu choice snapshots the menu's wording. A slot with no menu id
          // keeps whatever was already there — the legacy perk, live and
          // unchanged.
          title:        chosen ? chosen.title       : (s.title ?? '').trim(),
          description:  chosen ? chosen.description : (s.description ?? '').trim(),
          menu_perk_id: s.menuPerkId ?? null,
          // CHOOSING IS PUBLISHING. A filled slot is live; an empty one is
          // not. The old separate "active" toggle made sense when a slot was
          // free text a merchant drafted over several sittings, but a slot is
          // now filled in one click from a reviewed menu — and a merchant who
          // picked a perk and saw it saved reasonably expects members to see
          // it. Leaving the toggle in meant an optional slot was chosen and
          // then silently never shown.
          is_active:    isFilled(s),
          // Carried over only while the slot still holds the same perk.
          // Choosing something else is the merchant replacing it, and the
          // replacement has not been hidden by anyone.
          hidden_at:     unchanged ? (prior?.hidden_at ?? null) : null,
          hidden_reason: unchanged ? (prior?.hidden_reason ?? null) : null,
          updated_at:   now,
        }
      })

  const rows = [
    ...rowsFor(free, 'free', FREE_SLOTS),
    ...rowsFor(vip,  'vip',  VIP_SLOTS),
  ]

  const { error: delError } = await admin.from('perks').delete().eq('store_id', storeId)
  if (delError) {
    console.error('[/api/merchant/perks POST] delete error', delError)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }

  const { error: insError } = await admin.from('perks').insert(rows)
  if (insError) {
    console.error('[/api/merchant/perks POST] insert error', insError)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
