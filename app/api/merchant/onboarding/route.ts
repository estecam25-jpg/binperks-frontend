import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { findMerchantForRequest } from '@/lib/merchant-auth'
import { onboardingChecklist } from '@/lib/merchant-onboarding-checklist'

/** See lib/merchant-auth. A stale auth_user_id used to 401 here, which the
 *  Getting Started tab renders as an empty checklist. */
async function getMerchant() {
  return findMerchantForRequest<{ id: string; billing_status: string | null }>(
    'id, billing_status',
  )
}

export async function GET() {
  const merchant = await getMerchant()
  if (!merchant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminSupabaseClient()

  const [stores, activePerks, staff, stampCheck, binPhotoCheck] = await Promise.all([
    admin.from('stores').select('id, logo_url, brand_color, font_family, google_review_url, marketing_downloaded_at, cashier_training_confirmed_at, pos_coupons_confirmed_at, agreement_signed_at').eq('merchant_id', merchant.id).order('created_at', { ascending: true }),
    admin.from('perks').select('member_type').eq('merchant_id', merchant.id).eq('is_active', true),
    admin.from('staff_users').select('id').eq('merchant_id', merchant.id).eq('is_active', true),
    admin.from('activity_events').select('id').eq('merchant_id', merchant.id).limit(1),

    // Bin photos are per STORE, and stores are only known after the query
    // above resolves — so this reads every active photo row for the merchant's
    // stores via a join rather than a second round trip on store ids.
    admin.from('store_bin_photos')
      .select('id, stores!inner(merchant_id)')
      .eq('active', true)
      .eq('stores.merchant_id', merchant.id)
      .limit(1),
  ])

  const storeList    = stores.data ?? []
  const primaryStore = storeList[0]
  const perks        = activePerks.data ?? []

  // The items themselves live in lib/merchant-onboarding-checklist, shared
  // with the admin merchant list so the percentage shown there cannot drift
  // from the list shown here. This route's job is the facts.
  const items = onboardingChecklist({
    billingStatus:     merchant.billing_status,
    storeCount:        storeList.length,
    brandConfigured:   !!primaryStore?.logo_url && !!primaryStore?.brand_color && !!primaryStore?.font_family,
    reviewUrlSet:      storeList.some(s => !!s.google_review_url),
    freePerks:         perks.filter(p => p.member_type === 'free').length,
    vipPerks:          perks.filter(p => p.member_type === 'vip').length,
    staffCount:        (staff.data ?? []).length,
    mktDownloaded:     storeList.some(s => !!s.marketing_downloaded_at),
    stampsTested:      (stampCheck.data ?? []).length > 0,
    trainingConfirmed: storeList.some(s => !!s.cashier_training_confirmed_at),
    // Nothing BinPerks can observe — the coupon amounts are entered in the
    // merchant's own point-of-sale system — so, like cashier training, this
    // is ticked off by the merchant saying they have done it.
    posCouponsAdded:   storeList.some(s => !!s.pos_coupons_confirmed_at),
    agreementSigned:   storeList.some(s => !!s.agreement_signed_at),
    binPhotosAdded:    (binPhotoCheck.data ?? []).length > 0,
  })

  const completedCount = items.filter(i => i.completed).length
  return NextResponse.json({ items, completedCount, total: items.length })
}

export async function PATCH(req: NextRequest) {
  const merchant = await getMerchant()
  if (!merchant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action } = await req.json() as { action?: string }

  // The checklist items BinPerks cannot observe for itself: the merchant says
  // when they are done, and each one stamps its own column on every store the
  // merchant owns. Listed here rather than branched one by one so the next
  // self-confirmed item is a line, not another if.
  const CONFIRMABLE: Record<string, string> = {
    confirm_training:    'cashier_training_confirmed_at',
    confirm_pos_coupons: 'pos_coupons_confirmed_at',
  }

  const column = action ? CONFIRMABLE[action] : undefined
  if (column) {
    const admin = createAdminSupabaseClient()
    const now = new Date().toISOString()
    await admin.from('stores')
      .update({ [column]: now })
      .eq('merchant_id', merchant.id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
