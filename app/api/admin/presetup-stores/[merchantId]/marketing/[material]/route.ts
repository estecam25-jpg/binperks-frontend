/**
 * GET /api/admin/presetup-stores/[merchantId]/marketing/[material]
 *
 * One printable file for a pre-setup store, built by the SAME generator the
 * merchant's own Marketing tab uses — lib/marketing-render, from the same
 * marketing_materials rows and the same admin-uploaded artwork. Nothing about
 * the output is specific to pre-setup: the only difference is who is allowed
 * to ask for it and how the store is resolved.
 *
 * WHY THIS IS NOT JUST THE MERCHANT ROUTE. That one identifies the store from
 * the caller's merchant session, and a pre-setup store has no owner signed in
 * yet — there is no auth user at all until the finish-setup payment. So the
 * store comes from the path instead, behind the admin allow-list.
 *
 * SCOPED TO PRE-SETUP ON PURPOSE. Once a merchant is live they fetch their own
 * materials from their dashboard, which is the copy that stays correct as they
 * edit their store. Letting admin keep printing from here would be a second
 * source of the same file.
 *
 * Auth: admin allow-list. Data and storage: admin client.
 *
 * Responses:
 *   200 the PDF or JPEG, as an attachment
 *   403 { error: 'forbidden' }
 *   404 { error: 'unknown_material' | 'not_found' }
 *   409 { error: 'artwork_missing', missing: [...] }
 *   503 { error: 'recipe_missing' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin-auth'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { specForMaterial, type MaterialRow } from '@/lib/marketing-materials'
import { renderMaterial, MaterialUnavailableError } from '@/lib/marketing-render'
import { PRESETUP } from '@/lib/presetup'

/** Ten 1100px poster PNGs into one PDF needs more than the default. */
export const maxDuration = 60

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ merchantId: string; material: string }> },
) {
  if (!await verifyAdmin()) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { merchantId, material: slug } = await params
  const admin = createAdminSupabaseClient()

  const [{ data: merchant }, { data: row }] = await Promise.all([
    admin.from('merchants').select('id, billing_status').eq('id', merchantId).maybeSingle(),
    admin.from('marketing_materials')
      .select('id, slug, category, title, description, render_recipe, template_slugs, ' +
              'lifestyle_image_path, download_format, display_order, active')
      .eq('slug', slug).eq('active', true).maybeSingle(),
  ])

  if (!merchant || merchant.billing_status !== PRESETUP) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  if (!row) return NextResponse.json({ error: 'unknown_material' }, { status: 404 })

  const material = row as unknown as MaterialRow
  const spec = specForMaterial(material)
  if (!spec) {
    console.error(`[admin/presetup marketing/${slug}] no recipe for`, material.render_recipe)
    return NextResponse.json({ error: 'recipe_missing' }, { status: 503 })
  }

  const { data: store } = await admin
    .from('stores')
    .select('canonical_key, display_name')
    .eq('merchant_id', merchantId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!store) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  try {
    const { body, contentType, filename } = await renderMaterial({
      admin,
      spec,
      storeKey:  store.canonical_key as string,
      storeName: (store.display_name as string) ?? 'Your Store',
    })

    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    if (err instanceof MaterialUnavailableError) {
      return NextResponse.json({ error: 'artwork_missing', missing: err.missing }, { status: 409 })
    }
    console.error(`[admin/presetup marketing/${slug}] render failed:`, err)
    return NextResponse.json({ error: 'render_failed' }, { status: 500 })
  }
}
