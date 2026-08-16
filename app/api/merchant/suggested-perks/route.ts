/**
 * GET /api/merchant/suggested-perks
 *
 * The admin-curated perk ideas shown in the merchant Perks tab.
 *
 * A separate route from /api/admin/content/suggested-perks on purpose: that one
 * requires an ADMIN session and would 403 for every merchant. This one is
 * merchant-authenticated and read-only, and returns only ACTIVE rows — the
 * admin list view returns inactive ones too, which merchants must not see.
 *
 * Auth: merchant session. Data: admin client (CLAUDE.md RLS rule; these tables
 * have RLS on with no policies, so the service role is the only way in).
 */

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { findMerchantForRequest } from '@/lib/merchant-auth'

export async function GET() {
  const merchant = await findMerchantForRequest<{ id: string }>('id')
  if (!merchant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from('suggested_perks')
    .select('id, title, description, display_order')
    .eq('active', true)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    // An empty list renders as no suggestions, which is the correct fallback —
    // there is no mock data behind this any more.
    console.error('[merchant/suggested-perks] query failed:', error)
    return NextResponse.json({ perks: [] })
  }

  return NextResponse.json({ perks: data ?? [] })
}
