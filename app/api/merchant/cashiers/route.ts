/**
 * GET  /api/merchant/cashiers?storeId=...
 * POST /api/merchant/cashiers    — create cashier (owner only)
 *
 * DELETE (deactivate) lives at /api/merchant/cashiers/[id]/route.ts
 *
 * Rules (from brief):
 *   - Only owners can add/remove/reset cashier PINs
 *   - Role is 'owner' or 'cashier' — no manager role
 *   - A cashier CANNOT be a BinPerks member (merchant must enforce)
 *   - PINs are per-cashier (not shared store PIN)
 *   - Every stamp_event records cashier_id for full audit trail
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

type SupabaseServerClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

async function getOwnerMerchant(supabase: SupabaseServerClient) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: m } = await supabase.from('merchants').select('id').eq('auth_user_id', user.id).single()
  return m?.id ? { merchantId: m.id } : null
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const owner = await getOwnerMerchant(supabase)
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeId = new URL(req.url).searchParams.get('storeId')

  let query = supabase
    .from('staff_users')
    .select('id, name, email, role, pin, is_active, created_at, stores(display_name)')
    .eq('merchant_id', owner.merchantId)
    .order('role')
    .order('name')

  if (storeId) query = query.eq('store_id', storeId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })

  return NextResponse.json({
    cashiers: (data ?? []).map((c: {
      id: string; name: string; email: string; role: string
      pin: string; is_active: boolean; created_at: string
      stores: { display_name: string }[]
    }) => ({
      id:        c.id,
      name:      c.name,
      email:     c.email,
      role:      c.role,
      pin:       c.pin,    // shown to owner only — never to members
      isActive:  c.is_active,
      createdAt: c.created_at,
      storeName: c.stores[0]?.display_name ?? null,
    })),
  })
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const owner = await getOwnerMerchant(supabase)
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { storeId, name, email, pin, role } = await req.json()

  if (!storeId || !name || !pin) {
    return NextResponse.json({ error: 'storeId, name, and pin are required' }, { status: 400 })
  }

  // PIN must be 4 digits
  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 })
  }

  // Verify store belongs to merchant
  const { data: store } = await supabase
    .from('stores').select('id').eq('id', storeId).eq('merchant_id', owner.merchantId).single()
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

  // Check PIN not already in use at this store
  const { data: existing } = await supabase
    .from('staff_users')
    .select('id')
    .eq('store_id', storeId)
    .eq('pin', pin)
    .eq('is_active', true)
    .single()
  if (existing) {
    return NextResponse.json({ error: 'PIN already in use at this location' }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('staff_users')
    .insert({
      merchant_id: owner.merchantId,
      store_id:    storeId,
      name:        name.trim(),
      email:       email?.trim().toLowerCase() ?? null,
      pin,
      role:        role === 'owner' ? 'owner' : 'cashier',
      is_active:   true,
      created_at:  new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) {
    console.error('[/api/merchant/cashiers POST]', error)
    return NextResponse.json({ error: 'Failed to create cashier' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id })
}
