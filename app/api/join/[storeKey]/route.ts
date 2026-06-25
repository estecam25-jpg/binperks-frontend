/**
 * GET /api/join/[storeKey]
 *
 * Resolves store branding and merchant info from a canonical_key.
 * Called by Page 1 of the member signup funnel.
 *
 * Returns:
 *   200 { id, storeKey, storeName, brandName, brandColor, logoUrl, merchantId,
 *          googleReviewUrl, facebookReviewUrl }
 *   404 { error: 'store_not_found' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ storeKey: string }> }
) {
  const { storeKey } = await params
  const supabase = createAdminSupabaseClient()

  const { data, error } = await supabase
    .from('stores')
    .select(`
      id,
      canonical_key,
      display_name,
      brand_name,
      brand_color,
      logo_url,
      merchant_id,
      google_review_url,
      facebook_review_url,
      is_active
    `)
    .eq('canonical_key', storeKey)
    .single()

  if (error || !data || !data.is_active) {
    return NextResponse.json({ error: 'store_not_found' }, { status: 404 })
  }

  return NextResponse.json({
    id:               data.id,
    storeKey:         data.canonical_key,
    storeName:        data.display_name,
    brandName:        data.brand_name,
    brandColor:       data.brand_color ?? '#4A4B98',
    logoUrl:          data.logo_url,
    merchantId:       data.merchant_id,
    googleReviewUrl:  data.google_review_url,
    facebookReviewUrl: data.facebook_review_url,
  })
}
