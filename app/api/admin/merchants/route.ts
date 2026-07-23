import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

const ADMIN_EMAIL = 'enina@estecam.com'

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.email === ADMIN_EMAIL ? user : null
}

export async function GET() {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const admin = createAdminSupabaseClient()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [merchantsResult, stampEvents, allMembers] = await Promise.all([
    admin.from('merchants')
      .select('id, name, owner_email, company_name, billing_status, subscription_status, location_count, created_at')
      .order('created_at', { ascending: false }),
    admin.from('stamp_events').select('merchant_id, stamp_count').gte('awarded_at', sevenDaysAgo),
    admin.from('members').select('merchant_id, subscription_status'),
  ])

  // Aggregate stamps per merchant this week
  const stampsByMerchant: Record<string, number> = {}
  for (const s of (stampEvents.data ?? [])) {
    if (!s.merchant_id) continue
    stampsByMerchant[s.merchant_id] = (stampsByMerchant[s.merchant_id] || 0) + (s.stamp_count ?? 0)
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
    }
  })

  if (merchantsResult.error) return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  return NextResponse.json({ merchants })
}

export async function PATCH(req: NextRequest) {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { merchantId, action } = await req.json() as { merchantId?: string; action?: 'activate' | 'deactivate' }
  if (!merchantId || !action) return NextResponse.json({ error: 'missing_fields' }, { status: 400 })

  const admin = createAdminSupabaseClient()

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
