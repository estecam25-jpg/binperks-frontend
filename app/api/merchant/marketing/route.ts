/**
 * GET /api/merchant/marketing — the materials this merchant can download
 *
 * ADMIN-DRIVEN NOW. The list, its order, the titles, the descriptions and the
 * categories all come from marketing_materials, so a change in the admin
 * Marketing Materials tab reaches every merchant on their next page load —
 * nothing is published and nothing is cached. Inactive materials are filtered
 * out here rather than hidden in the UI, so a merchant is never sent a link to
 * something admin has withdrawn.
 *
 * Returns availability plus the lifestyle photo — never the printable artwork.
 * The downloadable files are built on demand by the sibling [material] route.
 *
 * THE LIFESTYLE URL IS THE ONE SIGNED THING HERE. It is a photo of the
 * material in use, shown on the card so a merchant can see what they are about
 * to print; the bucket is private, so it cannot be linked directly. Null for a
 * material admin has not photographed yet, and the card then shows its
 * description as plain text.
 *
 * AVAILABILITY IS ABOUT ARTWORK, NOT ABOUT BEING LISTED. A material whose
 * designs admin has not uploaded is still shown, disabled — hiding it would
 * leave a merchant wondering whether they had missed something.
 *
 * Auth: merchant session. Data: admin client (both tables have RLS, no policies).
 *
 * Responses:
 *   200 { categories: [...], materials: [{ slug, title, description, category,
 *         output, available, missing, lifestyleUrl }] }
 *   404 { error: 'Merchant not found' }
 */

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { findMerchantForRequest } from '@/lib/merchant-auth'
import {
  CATEGORIES, specForMaterial, type MaterialRow,
} from '@/lib/marketing-materials'
import { LIFESTYLE_BUCKET, signPaths } from '@/lib/marketing-lifestyle'

export async function GET() {
  const merchant = await findMerchantForRequest<{ id: string }>('id')
  if (!merchant) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 })

  const admin = createAdminSupabaseClient()

  const [{ data: rows }, { data: templates }] = await Promise.all([
    admin.from('marketing_materials')
      .select('id, slug, category, title, description, render_recipe, template_slugs, ' +
              'lifestyle_image_path, download_format, display_order, active')
      .eq('active', true)
      .neq('category', 'social_media_post')
      .order('category', { ascending: true })
      .order('display_order', { ascending: true }),
    admin.from('marketing_templates').select('slug, storage_path'),
  ])

  const materials = (rows ?? []) as unknown as MaterialRow[]

  const ready = new Set(
    (templates ?? []).filter(r => r.storage_path).map(r => r.slug as string),
  )

  const lifestyleUrls = await signPaths(
    admin,
    LIFESTYLE_BUCKET,
    materials.map(m => m.lifestyle_image_path).filter((p): p is string => !!p),
  )

  return NextResponse.json({
    // Sent along so the tab renders whatever categories exist rather than
    // holding its own copy of the list.
    categories: CATEGORIES.filter(c => c.editable),
    materials: materials.map(m => {
      const spec = specForMaterial(m)
      const missing = m.template_slugs.filter(t => !ready.has(t))
      return {
        slug: m.slug,
        category: m.category,
        title: m.title,
        description: m.description,
        // What the download button should say. Falls back to the stored
        // format when the recipe is gone, which also makes it unavailable.
        output: spec?.output ?? m.download_format,
        // A material whose recipe no longer exists in code cannot be built, so
        // it is listed and disabled rather than offered and then failing.
        available: !!spec && missing.length === 0,
        missing,
        lifestyleUrl: m.lifestyle_image_path ? lifestyleUrls[m.lifestyle_image_path] ?? null : null,
      }
    }),
  })
}
