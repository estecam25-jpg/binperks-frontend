/**
 * GET /api/merchant/marketing — which materials this merchant can download
 *
 * The Marketing tab asks once, then knows which cards to enable. Without it
 * every card would have to guess, and a merchant would find out a material was
 * not ready by downloading nothing.
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
 * Auth: merchant session. Data: admin client (templates have RLS, no policies).
 *
 * Responses:
 *   200 { materials: [{ slug, available, missing: [templateSlug], lifestyleUrl }] }
 *   404 { error: 'Merchant not found' }
 */

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { findMerchantForRequest } from '@/lib/merchant-auth'
import { MATERIALS } from '@/lib/marketing-materials'
import { lifestyleIndex, signLifestyleUrls } from '@/lib/marketing-lifestyle'

export async function GET() {
  const merchant = await findMerchantForRequest<{ id: string }>('id')
  if (!merchant) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 })

  const admin = createAdminSupabaseClient()
  const { data } = await admin
    .from('marketing_templates')
    .select('slug, storage_path')

  const ready = new Set(
    (data ?? []).filter(r => r.storage_path).map(r => r.slug as string),
  )

  const lifestyle = await lifestyleIndex(admin)
  const lifestyleUrls = await signLifestyleUrls(admin, lifestyle)

  return NextResponse.json({
    materials: MATERIALS.map(m => ({
      slug: m.slug,
      available: m.templates.every(t => ready.has(t)),
      missing: m.templates.filter(t => !ready.has(t)),
      // Independent of `available`: the photo shows what the thing looks like
      // even while its printable artwork is still missing.
      lifestyleUrl: lifestyleUrls[m.slug] ?? null,
    })),
  })
}
