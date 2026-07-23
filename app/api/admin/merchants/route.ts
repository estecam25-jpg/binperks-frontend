import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

const ADMIN_EMAIL = 'enina@estecam.com'

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.email === ADMIN_EMAIL ? user : null
}

export async function GET(req: NextRequest) {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const admin = createAdminSupabaseClient()
  // Signed URL for a merchant's W-9 PDF
  const url = new URL(req.url)
  const action  = url.searchParams.get('action')
  const mIdParam = url.searchParams.get('merchantId')
  if (action === 'w9_url' && mIdParam) {
    const { data, error } = await admin.storage
      .from('merchant-w9')
      .createSignedUrl(mIdParam + '/w9.pdf', 3600)
    if (error || !data?.signedUrl) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return NextResponse.json({ url: data.signedUrl })
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [merchantsResult, stampEvents, allMembers, w9Records, allStores, allPerks, allStaff, allStamps] = await Promise.all([
    admin.from('merchants')
      .select('id, name, owner_email, company_name, billing_status, subscription_status, location_count, created_at')
      .order('created_at', { ascending: false }),
    admin.from('stamp_events').select('merchant_id, stamp_count').gte('awarded_at', sevenDaysAgo),
    admin.from('members').select('merchant_id, subscription_status'),
    admin.from('merchant_w9').select('merchant_id, status, submitted_at, reviewed_at'),
    admin.from('stores').select('merchant_id, logo_url, brand_color, font_family, google_review_url, marketing_downloaded_at, cashier_training_confirmed_at'),
    admin.from('perks').select('merchant_id, is_active, member_type').eq('is_active', true),
    admin.from('staff_users').select('merchant_id').eq('is_active', true),
    admin.from('stamp_events').select('merchant_id'),
  ])

  // Aggregate stamps per merchant this week
  const stampsByMerchant: Record<string, number> = {}
  for (const s of (stampEvents.data ?? [])) {
    if (!s.merchant_id) continue
    stampsByMerchant[s.merchant_id] = (stampsByMerchant[s.merchant_id] || 0) + (s.stamp_count ?? 0)
  }

  // W-9 status per merchant
  type W9Row = { merchant_id: string; status: string; submitted_at: string | null; reviewed_at: string | null }
  const w9ByMerchant: Record<string, W9Row> = {}
  for (const w of (w9Records.data ?? [])) {
    if (w.merchant_id) w9ByMerchant[w.merchant_id] = w as W9Row
  }

  // Onboarding data per merchant
  const storesByMerchant: Record<string, typeof allStores.data> = {}
  for (const s of (allStores.data ?? [])) {
    if (!storesByMerchant[s.merchant_id]) storesByMerchant[s.merchant_id] = []
    storesByMerchant[s.merchant_id]!.push(s)
  }
  const freePerksByMerchant: Record<string, number> = {}
  const vipPerksByMerchant: Record<string, number> = {}
  for (const p of (allPerks.data ?? [])) {
    if (!p.merchant_id) continue
    if (p.member_type === 'free') freePerksByMerchant[p.merchant_id] = (freePerksByMerchant[p.merchant_id] || 0) + 1
    if (p.member_type === 'vip')  vipPerksByMerchant[p.merchant_id]  = (vipPerksByMerchant[p.merchant_id] || 0) + 1
  }
  const staffByMerchant: Record<string, number> = {}
  for (const s of (allStaff.data ?? [])) {
    if (s.merchant_id) staffByMerchant[s.merchant_id] = (staffByMerchant[s.merchant_id] || 0) + 1
  }
  const stampedMerchants = new Set((allStamps.data ?? []).map((s: { merchant_id: string }) => s.merchant_id))

  function calcOnboarding(m: { id: string; billing_status: string }) {
    const w9 = w9ByMerchant[m.id] ?? null
    const mStores = storesByMerchant[m.id] ?? []
    const primary = mStores[0]
    const checks = [
      !!w9 && w9.status !== 'rejected',
      w9?.status === 'approved',
      mStores.length > 0,
      m.billing_status === 'active',
      !!(primary?.logo_url && primary?.brand_color && primary?.font_family),
      mStores.some(s => !!s.google_review_url),
      (freePerksByMerchant[m.id] ?? 0) >= 1,
      (vipPerksByMerchant[m.id]  ?? 0) >= 3,
      (staffByMerchant[m.id]     ?? 0) > 0,
      mStores.some(s => !!s.marketing_downloaded_at),
      stampedMerchants.has(m.id),
      true,
      mStores.some(s => !!s.cashier_training_confirmed_at),
    ]
    return Math.round(checks.filter(Boolean).length / 13 * 100)
  }

  // Aggregate member counts per merchant
  const membersByMerchant: Record<string, number> = {}
  const vipByMerchant: Record<string, number> = {}
  for (const m of (allMembers.data ?? [])) {
    if (!m.merchant_id) continue
    membersByMerchant[m.merchant_id] = (membersByMerchant[m.merchant_id] || 0) + 1
    if (m.subscription_status === 'vip') {
      vipByMerchant[m.merchant_id] = (vipByMerchant[m.merchant_id] || 0) + 1
    }
  }

  const merchants = (merchantsResult.data ?? []).map(m => {
    const total = membersByMerchant[m.id] ?? 0
    const vip   = vipByMerchant[m.id]   ?? 0
    return {
      ...m,
      stampsThisWeek:    stampsByMerchant[m.id] ?? 0,
      totalMembers:      total,
      vipMembers:        vip,
      vipConversionPct:  total > 0 ? Math.round(vip / total * 100) : 0,
      w9:                w9ByMerchant[m.id] ?? null,
      onboardingComplete: calcOnboarding(m),
    }
  })

  if (merchantsResult.error) return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  return NextResponse.json({ merchants })
}

export async function PATCH(req: NextRequest) {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { merchantId, action } = await req.json() as { merchantId?: string; action?: 'activate' | 'deactivate' | 'approve_w9' | 'reject_w9' }
  if (!merchantId || !action) return NextResponse.json({ error: 'missing_fields' }, { status: 400 })

  const admin = createAdminSupabaseClient()

  if (action === 'approve_w9' || action === 'reject_w9') {
    const status = action === 'approve_w9' ? 'approved' : 'rejected'
    const { error } = await admin
      .from('merchant_w9')
      .update({ status, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('merchant_id', merchantId)
    if (error) return NextResponse.json({ error: 'update_failed' }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'activate') {
    const { data: merchant, error: fetchErr } = await admin
      .from('merchants').select('id, name, owner_email, company_name').eq('id', merchantId).single()
    if (fetchErr || !merchant) return NextResponse.json({ error: 'merchant_not_found' }, { status: 404 })

    await Promise.all([
      admin.from('merchants').update({ billing_status: 'active', subscription_status: 'active' }).eq('id', merchantId),
      admin.from('stores').update({ is_active: true }).eq('merchant_id', merchantId),
    ])

    if (process.env.GHL_MERCHANT_ACTIVATED_WEBHOOK_URL) {
      fetch(process.env.GHL_MERCHANT_ACTIVATED_WEBHOOK_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: merchant.id, firstName: merchant.name ?? '',
          phone: '', email: merchant.owner_email ?? '',
          companyName: merchant.company_name ?? '',
          dashboardUrl: 'https://app.binperks.com/merchant/dashboard',
        }),
      }).catch(err => console.error('[admin/merchants] GHL webhook error:', err))
    }
  } else {
    await Promise.all([
      admin.from('merchants').update({ billing_status: 'deactivated' }).eq('id', merchantId),
      admin.from('stores').update({ is_active: false }).eq('merchant_id', merchantId),
    ])
  }

  return NextResponse.json({ ok: true })
}
