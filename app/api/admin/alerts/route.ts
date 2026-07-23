import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

const ADMIN_EMAIL = 'enina@estecam.com'

interface AlertItem { id: string; message: string; detail?: string }

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const admin = createAdminSupabaseClient()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const todayStart   = new Date(); todayStart.setHours(0, 0, 0, 0)

  const [activeMerchantsResult, memberCounts, stampCounts, newVipsToday, newMembersThisWeek] = await Promise.all([
    admin.from('merchants')
      .select('id, company_name, name, billing_status')
      .eq('billing_status', 'active'),
    admin.from('members').select('merchant_id, subscription_status'),
    admin.from('stamp_events').select('merchant_id, stamp_count').gte('awarded_at', sevenDaysAgo),
    admin.from('members').select('*', { count: 'exact', head: true })
      .eq('subscription_status', 'vip').gte('created_at', todayStart.toISOString()),
    admin.from('members').select('*', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo),
  ])

  // Aggregate stamps per merchant this week
  const stampsByMerchant: Record<string, number> = {}
  for (const s of (stampCounts.data ?? [])) {
    if (!s.merchant_id) continue
    stampsByMerchant[s.merchant_id] = (stampsByMerchant[s.merchant_id] || 0) + (s.stamp_count ?? 0)
  }

  // Member counts per merchant
  const memberCountByMerchant: Record<string, number> = {}
  for (const m of (memberCounts.data ?? [])) {
    if (!m.merchant_id) continue
    memberCountByMerchant[m.merchant_id] = (memberCountByMerchant[m.merchant_id] || 0) + 1
  }

  const critical: AlertItem[] = []
  const warning:  AlertItem[] = []
  const good:     AlertItem[] = []

  // Critical: active merchants with members but 0 stamps this week
  for (const m of (activeMerchantsResult.data ?? [])) {
    const stamps  = stampsByMerchant[m.id]      ?? 0
    const members = memberCountByMerchant[m.id] ?? 0
    if (stamps === 0 && members > 0) {
      critical.push({
        id:      'at-risk-' + m.id,
        message: (m.company_name || m.name) + ' — 0 stamps this week',
        detail:  members + ' member' + (members !== 1 ? 's' : '') + ', no cashier activity. Follow up!',
      })
    }
  }

  // Warning: active merchants with very low stamps (1–4)
  for (const m of (activeMerchantsResult.data ?? [])) {
    const stamps  = stampsByMerchant[m.id]      ?? 0
    const members = memberCountByMerchant[m.id] ?? 0
    if (stamps > 0 && stamps < 5 && members > 0) {
      warning.push({
        id:      'low-stamps-' + m.id,
        message: (m.company_name || m.name) + ' — only ' + stamps + ' stamp' + (stamps !== 1 ? 's' : '') + ' this week',
        detail:  'Low engagement. Consider reaching out.',
      })
    }
  }

  // Good news
  const vipCount    = newVipsToday.count    ?? 0
  const memberCount = newMembersThisWeek.count ?? 0

  if (vipCount > 0) {
    good.push({
      id:      'new-vips-today',
      message: vipCount + ' new VIP member' + (vipCount !== 1 ? 's' : '') + ' today',
      detail:  'Great momentum on VIP conversions!',
    })
  }
  if (memberCount > 0) {
    good.push({
      id:      'new-members-week',
      message: memberCount + ' new member' + (memberCount !== 1 ? 's' : '') + ' this week',
      detail:  'Platform is growing!',
    })
  }
  if (critical.length === 0 && warning.length === 0) {
    good.push({
      id:      'all-clear',
      message: 'All merchants had activity this week',
      detail:  'No at-risk merchants detected.',
    })
  }

  return NextResponse.json({ critical, warning, good })
}
