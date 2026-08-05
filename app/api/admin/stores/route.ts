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
  if (!user) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const admin = createAdminSupabaseClient()
  const sevenDaysAgo     = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const thirtyDaysAgoDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [storesResult, merchantsResult, allMembers, recentStamps, recentVisits] = await Promise.all([
    admin.from('stores').select('id, brand_name, canonical_key, is_active, merchant_id, bin_count, is_open_for_shopping, network_visible, enrollment_enabled').order('canonical_key'),
    admin.from('merchants').select('id, company_name, name, commission_eligible'),
    admin.from('members').select('home_store_id, subscription_status'),
    admin.from('stamp_events').select('store_id, stamp_count').gte('awarded_at', sevenDaysAgo),
    admin.from('visits').select('store_id, member_id').gte('date', thirtyDaysAgoDate),
  ])

  // Merchant name lookup
  const merchantById: Record<string, string> = {}
  // commission_eligible lives on the merchant account, so each store inherits its
  // parent merchant's value for display only — it is never a store-level field.
  const merchantEligibleById: Record<string, boolean> = {}
  for (const m of (merchantsResult.data ?? [])) {
    merchantById[m.id] = (m.company_name || m.name) ?? ''
    merchantEligibleById[m.id] = m.commission_eligible ?? false
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
      binCount:                 s.bin_count ?? null,
      totalMembers:             total,
      vipMembers:               vip,
      vipConversionPct:         total > 0 ? Math.round(vip / total * 100) : 0,
      stampsThisWeek:           stampsByStore[s.id] ?? 0,
      uniqueVisitorsLast30Days: uniqueVisitors,
      engagementRate:           total > 0 ? Math.round(uniqueVisitors / total * 100) : 0,
      // V3 independent store statuses — never derived from is_active.
      isOpenForShopping:        s.is_open_for_shopping ?? true,
      networkVisible:           s.network_visible ?? true,
      enrollmentEnabled:        s.enrollment_enabled ?? true,
      // Merchant-level, read-only here.
      commissionEligible:       merchantEligibleById[s.merchant_id] ?? false,
    }
  })

  return NextResponse.json({ stores })
}

/**
 * PATCH /api/admin/stores
 *
 * Toggles one of the three independent store status fields. Body:
 *   { storeId, field: 'is_open_for_shopping' | 'network_visible' | 'enrollment_enabled', value: boolean }
 *
 * commission_eligible is deliberately NOT patchable here — it belongs to the
 * merchant account and is driven by billing and admin suspension, not by a
 * per-store switch (CLAUDE.md "STORE AND MERCHANT STATUS MODEL (V3)").
 */
const TOGGLEABLE_FIELDS = ['is_open_for_shopping', 'network_visible', 'enrollment_enabled'] as const
type ToggleableField = typeof TOGGLEABLE_FIELDS[number]

export async function PATCH(req: NextRequest) {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { storeId, field, value } = await req.json() as {
    storeId?: string; field?: string; value?: boolean
  }

  if (!storeId || typeof value !== 'boolean') {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
  }
  // Allow-list the column name — this value reaches an UPDATE, so it must never
  // come straight from the request body.
  if (!field || !TOGGLEABLE_FIELDS.includes(field as ToggleableField)) {
    return NextResponse.json({ error: 'invalid_field' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()
  const { error } = await admin
    .from('stores')
    .update({ [field]: value })
    .eq('id', storeId)

  if (error) {
    console.error('[admin/stores] update error:', error)
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
