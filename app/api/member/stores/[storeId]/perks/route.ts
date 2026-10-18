/**
 * GET /api/member/stores/[storeId]/perks
 *
 * Everything shown when a member expands one store in the store finder: its
 * Starter perks, its VIP perks, and its Store Message.
 *
 * Lazy rather than bundled into /api/member/stores because most members
 * expand one or two stores, and this is the bulk of the payload.
 *
 * WHO GETS WHAT IS DECIDED BY THE SLOT. A Starter slot reaches every member;
 * a VIP slot reaches VIP members only. VIP members therefore have BOTH lists,
 * which is why both are returned and why the UI shows a VIP member the
 * Starter perks as theirs too.
 *
 * VIP perks are also returned to Starter members, but greyed and behind an
 * "Upgrade to VIP to unlock these" link — they are a preview, not an
 * entitlement. Withholding them entirely would remove the main reason a
 * Starter member upgrades.
 *
 * A PERK ADMIN HAS HIDDEN REACHES NOBODY. hidden_at is set when a perk breaks
 * the rules after going live, and this is the gate that makes that immediate —
 * the merchant keeps the slot and is shown the reason in their dashboard, but
 * no member sees the perk again until it is replaced or un-hidden.
 *
 * storeMessage reads the store_message column (formerly member_memo — the
 * old column still exists but nothing reads it; see the migration note).
 *
 * Responses:
 *   200 { storeName, storeMessage, freePerks: [...], vipPerks: [...] }
 *   401 { error: 'not_authenticated' }
 *   404 { error: 'store_not_found' }
 */

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

interface PerkRow {
  id: string
  slot: number
  title: string
  description: string | null
  member_type: string
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ storeId: string }> }
) {
  // Next.js 16 dynamic route params are a Promise.
  const { storeId } = await params

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const admin = createAdminSupabaseClient()

  // Re-check visibility here rather than trusting the id the client sends —
  // otherwise a guessed store id would expose perks for a store an admin has
  // pulled out of network discovery.
  const { data: store } = await admin
    .from('stores')
    .select('id, display_name, store_message')
    .eq('id', storeId)
    .eq('is_active', true)
    .eq('network_visible', true)
    .maybeSingle()

  if (!store) {
    return NextResponse.json({ error: 'store_not_found' }, { status: 404 })
  }

  const { data: perkRows } = await admin
    .from('perks')
    .select('id, slot, title, description, member_type')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .is('hidden_at', null)
    .order('slot', { ascending: true })

  const all = (perkRows ?? []) as PerkRow[]
  const shape = (p: PerkRow) => ({
    id:          p.id,
    slot:        p.slot,
    title:       p.title,
    description: p.description ?? '',
  })

  return NextResponse.json({
    storeName:    store.display_name,
    storeMessage: store.store_message ?? null,
    freePerks:    all.filter(p => p.member_type === 'free').map(shape),
    vipPerks:     all.filter(p => p.member_type === 'vip').map(shape),
  })
}
