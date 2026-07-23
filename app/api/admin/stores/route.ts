import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

const ADMIN_EMAIL = 'enina@estecam.com'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const admin = createAdminSupabaseClient()
  const sevenDaysAgo     = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const thirtyDaysAgoDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [storesResult, merchantsResult, allMembers, recentStamps, recentVisits] = await Promise.all([
    admin.from('stores').select('id, brand_name, canonical_key, is_active, merchant_id').order('canonical_key'),
    admin.from('merchants').select('id, company_name, name'),
    admin.from('members').select('home_store_id, subscription_status'),
    admin.from('stamp_events').select('store_id, stamp_count').gte('awarded_at', sevenDaysAgo),
    admin.from('visits').select('store_id, member_id').gte('date', thirtyDaysAgoDate),
  ])

  // Merchant name lookup
  const merchantById: Record<string, string> = {}
  for (const m of (merchantsResult.data ?? [])) {
    merchantById[m.id] = (m.company_name || m.name) ?? ''
  }

  // Members per store
  const totalByStore: Record<string, number> = {}
  const vipByStore:   Record<string, number> = {}
  for (const m of (allMembers.data ?? [])) {
    if (!m.home_store_id) continue
    totalByStore[m.home_store_id] = (totalByStore[m.home_store_id] || 0) + 1
    if (m.subscription_status === 'vip') vipByStore[m.home_store_id] = (vipByStore[m.home_store_id] || 0) + 1
  }

  // Stamps this week per store
  const stampsByStore: Record<string, number> = {}
  for (const s of (recentStamps.data ?? [])) {
    if (!s.store_id) continue
    stampsByStore[s.store_id] = (stampsByStore[s.store_id] || 0) + (s.stamp_count ?? 0)
  }

  // Unique visitors last 30 days per store
  const visitorsByStore: Record<string, Set<string>> = {}
  for (const v of (recentVisits.data ?? [])) {
    if (!v.store_id || !v.member_id) continue
    if (!visitorsByStore[v.store_id]) visitorsByStore[v.store_id] = new Set()
    visitorsByStore[v.store_id].add(v.member_id)
  }

  const stores = (storesResult.data ?? []).map(s => {
    const total          = totalByStore[s.id] ?? 0
    const vip            = vipByStore[s.id]   ?? 0
    const uniqueVisitors = visitorsByStore[s.id]?.size ?? 0
    return {
      id:                       s.id,
      brand_name:               s.brand_name ?? '',
      canonical_key:            s.canonical_key ?? '',
      is_active:                s.is_active ?? false,
      merchantName:             merchantById[s.merchant_id] ?? '',
      totalMembers:             total,
      vipMembers:               vip,
      vipConversionPct:         total > 0 ? Math.round(vip / total * 100) : 0,
      stampsThisWeek:           stampsByStore[s.id] ?? 0,
      uniqueVisitorsLast30Days: uniqueVisitors,
      engagementRate:           total > 0 ? Math.round(uniqueVisitors / total * 100) : 0,
    }
  })

  return NextResponse.json({ stores })
}
