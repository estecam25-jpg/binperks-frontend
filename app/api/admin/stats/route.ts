import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

const ADMIN_EMAIL = 'enina@estecam.com'

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const admin = createAdminSupabaseClient()

  const [
    { count: starterMembers },
    { count: totalVip },
    { data: stampSum },
    { count: couponsIssued },
    { count: couponsRedeemed },
    { data: merchants },
  ] = await Promise.all([
    admin.from('members').select('*', { count: 'exact', head: true }).eq('subscription_status', 'free'),
    admin.from('members').select('*', { count: 'exact', head: true }).eq('subscription_status', 'vip'),
    admin.from('stamp_events').select('stamp_count').throwOnError(),
    admin.from('rewards').select('*', { count: 'exact', head: true }).eq('status', 'earned'),
    admin.from('rewards').select('*', { count: 'exact', head: true }).eq('status', 'redeemed'),
    admin.from('merchants').select('id, billing_status, subscription_status, location_count').eq('billing_status', 'active'),
  ])

  const totalStamps = (stampSum ?? []).reduce((sum: number, r: { stamp_count: number }) => sum + (r.stamp_count ?? 0), 0)

  const activeMerchants = (merchants ?? []).filter(m => m.subscription_status === 'active')
  const merchantMrr = activeMerchants.reduce((sum, m) => {
    const locs = Math.max(1, m.location_count ?? 1)
    return sum + 299.99 + (locs - 1) * 79.99
  }, 0)
  const memberMrr = (totalVip ?? 0) * 29.99

  return NextResponse.json({
    starterMembers:     starterMembers ?? 0,
    totalVip:           totalVip ?? 0,
    totalStamps,
    couponsIssued:      couponsIssued ?? 0,
    couponsRedeemed:    couponsRedeemed ?? 0,
    activeMerchantCount: activeMerchants.length,
    merchantMrr:        Math.round(merchantMrr * 100) / 100,
    memberMrr:          Math.round(memberMrr * 100) / 100,
  })
}
