/**
 * GET  /api/merchant/perks?storeId=...
 * POST /api/merchant/perks  body: { storeId, perks: [{slot,title,description,isActive}] }
 *
 * Rules (from brief):
 *   - 5 slots max, enforced by UNIQUE(store_id, slot) + CHECK(slot BETWEEN 1 AND 5)
 *   - Merchant writes their own perks — no presets
 *   - If not updated, previous month's perks auto-roll over (they just persist)
 *   - No merchant self-serve provisioning of logo/brand — that's BinPerks admin
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

type SupabaseServerClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

async function getMerchantId(supabase: SupabaseServerClient) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: m } = await supabase.from('merchants').select('id').eq('auth_user_id', user.id).single()
  return m?.id ?? null
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const merchantId = await getMerchantId(supabase)
  if (!merchantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeId = new URL(req.url).searchParams.get('storeId')
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

  // Verify store belongs to merchant
  const { data: store } = await supabase
    .from('stores').select('id').eq('id', storeId).eq('merchant_id', merchantId).single()
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

  const { data: perks } = await supabase
    .from('perks')
    .select('slot, title, description, is_active, updated_at')
    .eq('store_id', storeId)
    .order('slot')

  // Return all 5 slots, filling blanks with empty objects
  const slots = Array.from({ length: 5 }, (_, i) => {
    const slot = i + 1
    const existing = (perks ?? []).find(p => p.slot === slot)
    return existing
      ? { slot, title: existing.title, description: existing.description, isActive: existing.is_active, updatedAt: existing.updated_at }
      : { slot, title: '', description: '', isActive: false, updatedAt: null }
  })

  return NextResponse.json({ perks: slots })
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const merchantId = await getMerchantId(supabase)
  if (!merchantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { storeId, perks } = await req.json()
  if (!storeId || !Array.isArray(perks)) {
    return NextResponse.json({ error: 'storeId and perks[] required' }, { status: 400 })
  }

  // Verify store belongs to merchant
  const { data: store } = await supabase
    .from('stores').select('id').eq('id', storeId).eq('merchant_id', merchantId).single()
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

  // Upsert all provided perks
  const upserts = perks
    .filter((p: { slot: number }) => p.slot >= 1 && p.slot <= 5)
    .map((p: { slot: number; title: string; description: string; isActive: boolean }) => ({
      store_id:    storeId,
      merchant_id: merchantId,
      slot:        p.slot,
      title:       (p.title ?? '').trim(),
      description: (p.description ?? '').trim(),
      is_active:   p.isActive ?? false,
      updated_at:  new Date().toISOString(),
    }))

  const { error } = await supabase
    .from('perks')
    .upsert(upserts, { onConflict: 'store_id,slot' })

  if (error) {
    console.error('[/api/merchant/perks POST]', error)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
