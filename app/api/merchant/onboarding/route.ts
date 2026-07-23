import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

async function getMerchant() {
  const server = await createServerSupabaseClient()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return null
  const admin = createAdminSupabaseClient()
  const { data: merchant } = await admin
    .from('merchants')
    .select('id, billing_status')
    .eq('auth_user_id', user.id)
    .single()
  return merchant ?? null
}

export async function GET() {
  const merchant = await getMerchant()
  if (!merchant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminSupabaseClient()

  const [stores, activePerks, staff, stampCheck] = await Promise.all([
    admin.from('stores').select('logo_url, brand_color, font_family, google_review_url, marketing_downloaded_at, cashier_training_confirmed_at').eq('merchant_id', merchant.id),
    admin.from('perks').select('member_type').eq('merchant_id', merchant.id).eq('is_active', true),
    admin.from('staff_users').select('id').eq('merchant_id', merchant.id).eq('is_active', true),
    admin.from('stamp_events').select('id').eq('merchant_id', merchant.id).limit(1),
  ])

  const storeList      = stores.data ?? []
  const primaryStore   = storeList[0]
  const perks          = activePerks.data ?? []
  const freePerksCount = perks.filter(p => p.member_type === 'free').length
  const vipPerksCount  = perks.filter(p => p.member_type === 'vip').length
  const staffCount     = (staff.data ?? []).length
  const stampsTested   = (stampCheck.data ?? []).length > 0
  const brandConfigured = !!primaryStore?.logo_url && !!primaryStore?.brand_color && !!primaryStore?.font_family
  const reviewUrlSet    = storeList.some(s => !!s.google_review_url)
  const mktDownloaded   = storeList.some(s => !!s.marketing_downloaded_at)
  const trainingConfirmed = storeList.some(s => !!s.cashier_training_confirmed_at)

  const items = [
    // BinPerks sets up (1-3)
    { id: 'agreement_signed',  label: 'Merchant Agreement + W-9 signed (via HelloSign)', completed: false, binPerks: true,  note: 'Coming soon — BinPerks will email your agreement shortly after signup' },
    { id: 'store_provisioned', label: 'Store provisioned',                                completed: storeList.length > 0,                        binPerks: true  },
    { id: 'activated',         label: 'Merchant account activated',                       completed: merchant.billing_status === 'active',        binPerks: true  },
    // Merchant responsibility (4-12)
    { id: 'brand_configured',  label: 'Brand configured (logo, color, font)',             completed: brandConfigured,                             binPerks: false },
    { id: 'review_url',        label: 'Google Review URL added',                          completed: reviewUrlSet,                                binPerks: false },
    { id: 'free_perks',        label: 'Free member perk added',                          completed: freePerksCount >= 1,                         binPerks: false },
    { id: 'vip_perks',         label: 'VIP perks added (3+ required)',                   completed: vipPerksCount >= 3,                          binPerks: false },
    { id: 'cashier_pin',       label: 'Cashier PIN created',                             completed: staffCount > 0,                              binPerks: false },
    { id: 'mkt_downloaded',    label: 'Marketing materials downloaded',                  completed: mktDownloaded,                               binPerks: false },
    { id: 'stamp_tested',      label: 'Stamp tool tested',                               completed: stampsTested,                                binPerks: false },
    { id: 'login_confirmed',   label: 'Merchant dashboard login confirmed',               completed: true,                                        binPerks: false },
    { id: 'cashier_training',  label: 'Cashier training completed',                      completed: trainingConfirmed,                           binPerks: false },
  ]

  const completedCount = items.filter(i => i.completed).length
  return NextResponse.json({ items, completedCount, total: items.length })
}

export async function PATCH(req: NextRequest) {
  const merchant = await getMerchant()
  if (!merchant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action } = await req.json() as { action?: string }

  if (action === 'confirm_training') {
    const admin = createAdminSupabaseClient()
    const now = new Date().toISOString()
    await admin.from('stores')
      .update({ cashier_training_confirmed_at: now })
      .eq('merchant_id', merchant.id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
