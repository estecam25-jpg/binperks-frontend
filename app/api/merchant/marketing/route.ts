/**
 * GET /api/merchant/marketing — which materials this merchant can download
 *
 * The Marketing tab asks once, then knows which cards to enable. Without it
 * every card would have to guess, and a merchant would find out a material was
 * not ready by downloading nothing.
 *
 * Returns availability only — no artwork and no signed URLs. The files are
 * built on demand by the sibling [material] route.
 *
 * Auth: merchant session. Data: admin client (templates have RLS, no policies).
 *
 * Responses:
 *   200 { materials: [{ slug, available, missing: [templateSlug] }] }
 *   404 { error: 'Merchant not found' }
 */

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { findMerchantForRequest } from '@/lib/merchant-auth'
import { MATERIALS } from '@/lib/marketing-materials'

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

  return NextResponse.json({
    materials: MATERIALS.map(m => ({
      slug: m.slug,
      available: m.templates.every(t => ready.has(t)),
      missing: m.templates.filter(t => !ready.has(t)),
    })),
  })
}
