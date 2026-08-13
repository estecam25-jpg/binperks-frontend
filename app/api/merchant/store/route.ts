/**
 * GET  /api/merchant/store?storeId=...
 * PATCH /api/merchant/store
 *
 * GET  — returns current branding + store_message + review URL for one store
 * PATCH — updates brand_color, font_family, logo_url, store_message, and/or google_review_url
 *
 * store_message was called member_memo until the Store Message rename. The
 * old column still exists but nothing reads or writes it; it is kept only as
 * a rollback path and should be dropped once this has been live a while.
 *
 * Auth: Supabase merchant session cookie.
 * Data: admin client (bypasses RLS).
 * Security: verifies the requested store belongs to the authenticated merchant
 *           before reading or writing.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { findMerchantForRequest } from '@/lib/merchant-auth'
import { todayPrice, DAY_NAMES, type PricingSchedule } from '@/lib/store-pricing'

/** See lib/merchant-auth — resilient to a stale merchants.auth_user_id. */
async function getAuthenticatedMerchant() {
  const merchant = await findMerchantForRequest()
  return merchant?.id ? { merchantId: merchant.id } : null
}

// -- GET -----------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const owner = await getAuthenticatedMerchant()
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storeId = new URL(req.url).searchParams.get('storeId')
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

  const admin = createAdminSupabaseClient()

  const { data: store } = await admin
    .from('stores')
    .select('id, brand_color, font_family, logo_url, store_message, google_review_url, bin_count, pricing_schedule, restock_days, timezone')
    .eq('id', storeId)
    .eq('merchant_id', owner.merchantId)
    .single()

  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

  const schedule = (store.pricing_schedule ?? {}) as PricingSchedule
  const restock  = Array.isArray(store.restock_days) ? store.restock_days as string[] : []

  return NextResponse.json({
    brandColor: store.brand_color        ?? '#4A4B98',
    fontFamily: store.font_family        ?? null,
    logoUrl:      store.logo_url          ?? null,
    storeMessage: store.store_message     ?? null,
    reviewUrl:    store.google_review_url ?? null,
    binCount:   store.bin_count          ?? null,
    pricingSchedule: schedule,
    restockDays:     restock,
    // Resolved server-side so the merchant sees exactly what a member sees,
    // decided in the store's own timezone.
    todayPrice: todayPrice(schedule, store.timezone),
  })
}

// -- PATCH ---------------------------------------------------------------------

export async function PATCH(req: NextRequest) {
  const owner = await getAuthenticatedMerchant()
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    storeId:            string
    brandColor?:        string
    fontFamily?:        string | null
    logoUrl?:           string | null
    storeMessage?:      string | null
    reviewUrl?:         string | null
    binCount?:          number | null
    marketingDownloaded?: boolean
    joinPageVisited?:   boolean
    pricingSchedule?:   PricingSchedule
    restockDays?:       string[]
  }

  const { storeId, brandColor, fontFamily, logoUrl, storeMessage, reviewUrl, binCount, marketingDownloaded, joinPageVisited, pricingSchedule, restockDays } = body
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

  // Validate hex color if provided
  if (brandColor && !/^#[0-9A-Fa-f]{6}$/.test(brandColor)) {
    return NextResponse.json({ error: 'Invalid brandColor — must be a 6-digit hex' }, { status: 400 })
  }

  // Validate store message length if provided
  if (storeMessage && storeMessage.length > 160) {
    return NextResponse.json({ error: 'Store message must be 160 characters or fewer' }, { status: 400 })
  }

  // Validate the pricing schedule before it reaches the column. jsonb accepts
  // anything, so nothing else stops a bad shape from being written and then
  // failing to render for every member.
  let cleanSchedule: PricingSchedule | undefined
  if (pricingSchedule !== undefined) {
    const out: PricingSchedule = {}
    for (const day of DAY_NAMES) {
      const v = pricingSchedule[day]
      if (v === null || v === undefined || v === ('' as unknown)) continue   // "no price set"
      const n = Number(v)
      if (!Number.isFinite(n) || n < 0 || n > 10000) {
        return NextResponse.json({ error: `Invalid price for ${day}` }, { status: 400 })
      }
      out[day] = n
    }

    const o = pricingSchedule.special_override
    if (o && o.price !== null && o.price !== undefined && String(o.price) !== '') {
      const n = Number(o.price)
      if (!Number.isFinite(n) || n < 0 || n > 10000) {
        return NextResponse.json({ error: 'Invalid special override price' }, { status: 400 })
      }
      const expires = o.expires?.trim() || null
      if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) {
        return NextResponse.json({ error: 'Override expiry must be YYYY-MM-DD' }, { status: 400 })
      }
      out.special_override = {
        price: n,
        label: (o.label ?? '').trim().slice(0, 40),
        expires,
      }
    }
    cleanSchedule = out
  }

  let cleanRestock: string[] | undefined
  if (restockDays !== undefined) {
    if (!Array.isArray(restockDays)) {
      return NextResponse.json({ error: 'restockDays must be an array' }, { status: 400 })
    }
    // Filtered against the known day names so a typo cannot land in the column
    // and silently never match.
    cleanRestock = [...new Set(
      restockDays
        .filter((d): d is string => typeof d === 'string')
        .map(d => d.toLowerCase())
        .filter(d => (DAY_NAMES as readonly string[]).includes(d)),
    )]
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
  const updates: Record<string, string | number | null | PricingSchedule | string[]> = {}
  if (brandColor  !== undefined)  updates.brand_color         = brandColor
  if (fontFamily  !== undefined)  updates.font_family         = fontFamily ?? null
  if (logoUrl     !== undefined)  updates.logo_url            = logoUrl ?? null
  if (storeMessage !== undefined) updates.store_message       = storeMessage ?? null
  if (reviewUrl   !== undefined)  updates.google_review_url   = reviewUrl ?? null
  if (binCount    !== undefined)  updates.bin_count           = binCount ?? null
  if (marketingDownloaded)        updates.marketing_downloaded_at = new Date().toISOString()
  if (joinPageVisited)            updates.join_page_visited_at    = new Date().toISOString()
  if (cleanSchedule !== undefined) updates.pricing_schedule       = cleanSchedule
  if (cleanRestock  !== undefined) updates.restock_days           = cleanRestock

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data: updated, error } = await admin
    .from('stores')
    .update(updates)
    .eq('id', storeId)
    .select('id, brand_color, font_family, logo_url, store_message, google_review_url, bin_count, pricing_schedule, restock_days, timezone')
    .single()

  if (error) {
    console.error('[/api/merchant/store PATCH]', error)
    return NextResponse.json({ error: 'Failed to update store' }, { status: 500 })
  }

  const savedSchedule = (updated.pricing_schedule ?? {}) as PricingSchedule

  return NextResponse.json({
    brandColor: updated.brand_color        ?? '#4A4B98',
    fontFamily: updated.font_family        ?? null,
    logoUrl:      updated.logo_url          ?? null,
    storeMessage: updated.store_message     ?? null,
    reviewUrl:    updated.google_review_url ?? null,
    binCount:   updated.bin_count          ?? null,
    pricingSchedule: savedSchedule,
    restockDays:     Array.isArray(updated.restock_days) ? updated.restock_days as string[] : [],
    todayPrice:      todayPrice(savedSchedule, updated.timezone),
  })
}
