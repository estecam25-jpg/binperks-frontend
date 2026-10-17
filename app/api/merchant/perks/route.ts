/**
 * GET  /api/merchant/perks?storeId=...
 * POST /api/merchant/perks  body: { storeId, freePerks: [...], vipPerks: [...] }
 *
 * Rules, from Merchant Agreement V3.6 section 6.2:
 *   - Starter (free): 3 slots, the FIRST ONE REQUIRED, the other two optional
 *   - VIP:            5 slots, the FIRST THREE REQUIRED, the other two optional
 *   - member_type column distinguishes 'free' vs 'vip' rows
 *   - POST deletes existing perks for the store and re-inserts to avoid
 *     dependency on a specific unique constraint shape
 *
 * ── REQUIRED MEANS IT HAS A TITLE ──────────────────────────────────────────
 * The old rule counted ACTIVE perks, which a merchant satisfied by toggling an
 * empty perk on: the agreement's minimum was met on paper while members saw a
 * blank card. A required slot now has to carry a title, and is stored active
 * whatever the toggle says, because an empty or switched-off required perk is
 * the same broken promise either way.
 *
 * ENFORCED HERE, not only in the form. The form is where it is explained; this
 * is where it is true. A stale tab, a double submit or a direct POST all reach
 * this check.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { findMerchantForRequest } from '@/lib/merchant-auth'
import {
  FREE_SLOTS, FREE_REQUIRED, VIP_SLOTS, VIP_REQUIRED,
  missingRequiredPerks, missingPerksMessage, type PerkInput,
} from '@/lib/perks'

/** See lib/merchant-auth — resilient to a stale merchants.auth_user_id. */
async function getMerchantId() {
  const m = await findMerchantForRequest()
  return m?.id ?? null
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
    .select('slot, title, description, is_active, member_type')
    .eq('store_id', storeId)
    .order('slot')

  const all = rows ?? []

  // Starter perks: 3 slots
  const freePerks = Array.from({ length: FREE_SLOTS }, (_, i) => {
    const slot = i + 1
    const p = all.find(r => r.slot === slot && r.member_type === 'free')
    return p
      ? { slot, title: p.title, description: p.description, isActive: p.is_active }
      : { slot, title: '', description: '', isActive: false }
  })

  // VIP perks: 5 slots
  const vipPerks = Array.from({ length: VIP_SLOTS }, (_, i) => {
    const slot = i + 1
    const p = all.find(r => r.slot === slot && r.member_type === 'vip')
    return p
      ? { slot, title: p.title, description: p.description, isActive: p.is_active }
      : { slot, title: '', description: '', isActive: false }
  })

  return NextResponse.json({ freePerks, vipPerks })
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

  // The agreement's minimum, checked before anything is written.
  const missingFree = missingRequiredPerks(freePerks as PerkInput[], FREE_REQUIRED)
  const missingVip  = missingRequiredPerks(vipPerks  as PerkInput[], VIP_REQUIRED)
  if (missingFree.length > 0 || missingVip.length > 0) {
    return NextResponse.json({
      error:   'required_perks_missing',
      message: missingPerksMessage(missingFree, missingVip),
      missingFree,
      missingVip,
    }, { status: 400 })
  }

  const now = new Date().toISOString()

  const rows = [
    ...(freePerks as PerkInput[])
      .filter(p => p.slot >= 1 && p.slot <= FREE_SLOTS)
      .map(p => ({
        store_id:    storeId,
        merchant_id: merchantId,
        slot:        p.slot,
        member_type: 'free',
        title:       (p.title ?? '').trim(),
        description: (p.description ?? '').trim(),
        // A required slot is always live. It passed the check above, so it has
        // a title, and leaving it switched off would hide the perk the
        // agreement requires this store to offer.
        is_active:   p.slot <= FREE_REQUIRED ? true : (p.isActive ?? false),
        updated_at:  now,
      })),
    ...(vipPerks as PerkInput[])
      .filter(p => p.slot >= 1 && p.slot <= VIP_SLOTS)
      .map(p => ({
        store_id:    storeId,
        merchant_id: merchantId,
        slot:        p.slot,
        member_type: 'vip',
        title:       (p.title ?? '').trim(),
        description: (p.description ?? '').trim(),
        is_active:   p.slot <= VIP_REQUIRED ? true : (p.isActive ?? false),
        updated_at:  now,
      })),
  ]

  // Delete existing perks for this store, then insert fresh rows.
  // This avoids any dependency on which unique constraint shape is in place.
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
