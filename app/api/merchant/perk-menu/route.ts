/**
 * GET /api/merchant/perk-menu — the options a merchant may choose from
 *
 * Selectable options only: a retired option is dropped here, which is exactly
 * what retiring means — gone from the dropdown, still live at every store
 * already offering it.
 *
 * NO MEMBER TYPE ON ANY OPTION. The slot decides who gets the perk, so the
 * same option is offered for Starter and VIP slots alike.
 *
 * REVEALS NOTHING ABOUT WHO PROPOSED WHAT. An option added by approving a
 * submission looks exactly like one BinPerks seeded; the submitting store is
 * recorded in perk_submissions and never joined to the menu outside admin.
 *
 * Auth: merchant session. Data: admin client (RLS, no policies).
 */

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { findMerchantForRequest } from '@/lib/merchant-auth'
import { MENU_COLUMNS, toMenuPerk, groupMenu, MENU_SEARCH_THRESHOLD } from '@/lib/perk-menu'

export async function GET() {
  const merchant = await findMerchantForRequest<{ id: string }>('id')
  if (!merchant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from('perk_menu')
    .select(MENU_COLUMNS)
    .is('retired_at', null)
    .order('group_order', { ascending: true })
    .order('display_order', { ascending: true })

  if (error) {
    console.error('[merchant/perk-menu] load failed:', error)
    return NextResponse.json({ error: 'load_failed' }, { status: 500 })
  }

  const perks = (data ?? []).map(r => toMenuPerk(r as Record<string, unknown>))

  return NextResponse.json({
    groups: groupMenu(perks),
    count: perks.length,
    // The form shows a search box past this many options. Sent rather than
    // duplicated in the component so the rule lives in one file.
    searchThreshold: MENU_SEARCH_THRESHOLD,
  })
}
