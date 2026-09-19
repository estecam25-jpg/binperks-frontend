/**
 * GET /api/merchant/social-graphics — the BinPerks social post kit, read-only
 *
 * The same network-wide artwork and caption admin manages at
 * /api/admin/social-graphics. Merchants cannot change any of it; this route
 * exists so the Marketing tab can read it without an admin session.
 *
 * THE CAPTION COMES BACK RAW, token and all. Substituting the join link here
 * would mean this route deciding which store a merchant is looking at — the
 * Marketing tab already knows, because the store picker is on the page, and a
 * merchant with several locations switches between them without re-fetching.
 * The tab substitutes with personalizeCaption from lib/social-caption, which
 * is the browser-safe half of this module (lib/social-graphics imports sharp).
 *
 * Auth: merchant session (lib/merchant-auth). Data: admin client — the bucket
 * is private and both tables have RLS on with no policies.
 *
 * Responses:
 *   200 { images: [{ id, url, displayOrder }], caption, token }
 *   404 { error: 'Merchant not found' }
 */

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { findMerchantForRequest } from '@/lib/merchant-auth'
import { loadSocialKit, REFERRAL_LINK_TOKEN } from '@/lib/social-graphics'

export async function GET() {
  const merchant = await findMerchantForRequest<{ id: string }>('id')
  if (!merchant) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 })

  const admin = createAdminSupabaseClient()
  const kit = await loadSocialKit(admin)

  return NextResponse.json({ ...kit, token: REFERRAL_LINK_TOKEN })
}
