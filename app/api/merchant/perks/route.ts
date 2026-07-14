/**
 * GET  /api/merchant/perks?storeId=...
 * POST /api/merchant/perks  body: { storeId, freePerks: [...], vipPerks: [...] }
 *
 * Rules:
 *   - Free perks: 2 slots, at least 1 must be active (enforced client-side)
 *   - VIP perks:  5 slots, at least 3 must be active (enforced client-side)
 *   - member_type column distinguishes 'free' vs 'vip' rows
 *   - POST deletes existing perks for the store and re-inserts to avoid
 *     dependency on a specific unique constraint shape
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

async function getMerchantId() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminSupabaseClient()
  const { data: m } = await admin.from('merchants').select('id').eq('auth_user_id', user.id).single()
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

  // Free perks: 2 slots
  const freePerks = Array.from({ length: 2 }, (_, i) => {
    const slot = i + 1
    const p = all.find(r => r.slot === slot && r.member_type === 'free')
    return p
      ? { slot, title: p.title, description: p.description, isActive: p.is_active }
      : { slot, title: '', description: '', isActive: false }
  })

  // VIP perks: 5 slots
  const vipPerks = Array.from({ length: 5 }, (_, i) => {
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

  const now = new Date().toISOString()

  const rows = [
    ...freePerks
      .filter((p: { slot: number }) => p.slot >= 1 && p.slot <= 2)
      .map((p: { slot: number; title: string; description: string; isActive: boolean }) => ({
        store_id:    storeId,
        merchant_id: merchantId,
        slot:        p.slot,
        member_type: 'free',
        title:       (p.title ?? '').trim(),
        description: (p.description ?? '').trim(),
        is_active:   p.isActive ?? false,
        updated_at:  now,
      })),
    ...vipPerks
      .filter((p: { slot: number }) => p.slot >= 1 && p.slot <= 5)
      .map((p: { slot: number; title: string; description: string; isActive: boolean }) => ({
        store_id:    storeId,
        merchant_id: merchantId,
        slot:        p.slot,
        member_type: 'vip',
        title:       (p.title ?? '').trim(),
        description: (p.description ?? '').trim(),
        is_active:   p.isActive ?? false,
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
