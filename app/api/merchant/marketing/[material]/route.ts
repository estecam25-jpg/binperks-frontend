/**
 * GET /api/merchant/marketing/[material]?storeId=… — build and return one file
 *
 * The material is composed on demand from the admin base artwork plus this
 * merchant's own store name and QR. Nothing per-merchant is stored: a file
 * cached anywhere would go stale the moment admin replaced the artwork, and
 * these are small enough to build per download.
 *
 * THE MATERIAL IS LOOKED UP IN THE DATABASE, not in a hardcoded registry —
 * admin can add, retitle, reorder and deactivate them. What it still gets from
 * code is its RECIPE: the sheet layout, print size, fold lines and QR target,
 * which are the rendering logic and are not admin-editable. specForMaterial
 * puts the two halves together into the spec renderMaterial has always taken,
 * so nothing in lib/marketing-render changed.
 *
 * AN INACTIVE MATERIAL IS A 404 HERE TOO. The tab stops listing it, but a
 * merchant with the URL already open should not keep downloading something
 * admin has withdrawn.
 *
 * STORE OWNERSHIP IS RESOLVED SERVER-SIDE. storeId arrives from the client, so
 * it is checked against the merchant's own stores before a QR is minted —
 * otherwise a merchant could print another location's code.
 *
 * Auth: merchant session. Data and storage: admin client.
 *
 * Responses:
 *   200 the PDF or JPEG, as an attachment
 *   400 { error: 'invalid_store' }
 *   404 { error: 'unknown_material' | 'Merchant not found' }
 *   409 { error: 'artwork_missing', missing: [...] }  — admin has not uploaded it
 *   503 { error: 'recipe_missing' }  — the row names a recipe this build lacks
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { findMerchantForRequest } from '@/lib/merchant-auth'
import { specForMaterial, type MaterialRow } from '@/lib/marketing-materials'
import { renderMaterial, MaterialUnavailableError } from '@/lib/marketing-render'

/** Building a five-page PDF from five 1100px PNGs needs more than the default. */
export const maxDuration = 60

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ material: string }> },
) {
  const merchant = await findMerchantForRequest<{ id: string }>('id')
  if (!merchant) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 })

  const { material: slug } = await params
  const admin = createAdminSupabaseClient()

  const { data: row } = await admin
    .from('marketing_materials')
    .select('id, slug, category, title, description, render_recipe, template_slugs, ' +
            'lifestyle_image_path, download_format, display_order, active')
    .eq('slug', slug)
    .eq('active', true)
    .maybeSingle()

  if (!row) return NextResponse.json({ error: 'unknown_material' }, { status: 404 })

  const material = row as unknown as MaterialRow
  const spec = specForMaterial(material)
  if (!spec) {
    // The row survives a deploy that removed its recipe; say so rather than
    // rendering something with the wrong geometry.
    console.error(`[merchant/marketing/${slug}] no recipe for`, material.render_recipe)
    return NextResponse.json({ error: 'recipe_missing' }, { status: 503 })
  }

  // The store must belong to this merchant. Without a storeId, their first
  // location is used — the tab always sends one, but a direct hit should still
  // produce that merchant's own material rather than an error.
  const requested = req.nextUrl.searchParams.get('storeId')
  const { data: stores } = await admin
    .from('stores')
    .select('id, canonical_key, display_name')
    .eq('merchant_id', merchant.id)
    .order('canonical_key', { ascending: true })

  const owned = stores ?? []
  const store = requested
    ? owned.find(s => s.id === requested)
    : owned[0]

  if (!store) return NextResponse.json({ error: 'invalid_store' }, { status: 400 })

  try {
    const { body, contentType, filename } = await renderMaterial({
      admin,
      spec,
      storeKey: store.canonical_key as string,
      storeName: (store.display_name as string) ?? 'Your Store',
    })

    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        // Built per request from live artwork; a cached copy would survive an
        // admin replacing the template.
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    if (err instanceof MaterialUnavailableError) {
      return NextResponse.json({ error: 'artwork_missing', missing: err.missing }, { status: 409 })
    }
    console.error(`[merchant/marketing/${slug}] render failed:`, err)
    return NextResponse.json({ error: 'render_failed' }, { status: 500 })
  }
}
