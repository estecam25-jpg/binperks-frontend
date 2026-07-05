/**
 * GET  /api/merchant/store?storeId=...
 * PATCH /api/merchant/store
 *
 * GET  — returns current branding for one store (brand_color, font_family, logo_url)
 * PATCH — updates brand_color, font_family, and/or logo_url for a store
 *
 * Auth: Supabase merchant session cookie.
 * Data: admin client (bypasses RLS).
 * Security: verifies the requested store belongs to the authenticated merchant
 *           before reading or writing.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

async function getAuthenticatedMerchant() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminSupabaseClient()
  const { data: merchant } = await admin
    .from('merchants')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  return merchant?.id ? { merchantId: merchant.id } : null
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const owner = await getAuthenticatedMerchant()
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeId = new URL(req.url).searchParams.get('storeId')
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

  const admin = createAdminSupabaseClient()

  const { data: store } = await admin
    .from('stores')
    .select('id, brand_color, font_family, logo_url')
    .eq('id', storeId)
    .eq('merchant_id', owner.merchantId)   // verify ownership
    .single()

  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

  return NextResponse.json({
    brandColor:  store.brand_color  ?? '#4A4B98',
    fontFamily:  store.font_family  ?? null,
    logoUrl:     store.logo_url     ?? null,
  })
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const owner = await getAuthenticatedMerchant()
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    storeId:    string
    brandColor?: string
    fontFamily?: string | null
    logoUrl?:    string | null
  }

  const { storeId, brandColor, fontFamily, logoUrl } = body
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

  // Validate hex color if provided
  if (brandColor && !/^#[0-9A-Fa-f]{6}$/.test(brandColor)) {
    return NextResponse.json({ error: 'Invalid brandColor — must be a 6-digit hex' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()

  // Verify store belongs to this merchant before updating
  const { data: existing } = await admin
    .from('stores')
    .select('id')
    .eq('id', storeId)
    .eq('merchant_id', owner.merchantId)
    .single()

  if (!existing) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

  // Build update object — only include provided fields
  const updates: Record<string, string | null> = {}
  if (brandColor !== undefined)  updates.brand_color  = brandColor
  if (fontFamily !== undefined)  updates.font_family  = fontFamily ?? null
  if (logoUrl    !== undefined)  updates.logo_url     = logoUrl ?? null

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data: updated, error } = await admin
    .from('stores')
    .update(updates)
    .eq('id', storeId)
    .select('id, brand_color, font_family, logo_url')
    .single()

  if (error) {
    console.error('[/api/merchant/store PATCH]', error)
    return NextResponse.json({ error: 'Failed to update store' }, { status: 500 })
  }

  return NextResponse.json({
    brandColor: updated.brand_color ?? '#4A4B98',
    fontFamily: updated.font_family ?? null,
    logoUrl:    updated.logo_url    ?? null,
  })
}
