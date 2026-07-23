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
  const startOfMonth = new Date()
  startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)
  const som = startOfMonth.toISOString()

  const [
    { count: starterMembers },
    { count: totalVip },
    { data: stampSum },
    { count: couponsIssued },
    { count: couponsRedeemed },
    { data: merchants },
    { count: newMembersThisMonth },
    { count: newMerchantsThisMonth },
    { count: newVipThisMonth },
    { count: newActiveMerchantsThisMonth },
    { count: totalMembers },
    { count: totalReferrals },
    { count: qualifiedReferrals },
  ] = await Promise.all([
    admin.from('members').select('*', { count: 'exact', head: true }).eq('subscription_status', 'free'),
    admin.from('members').select('*', { count: 'exact', head: true }).eq('subscription_status', 'vip'),
    admin.from('stamp_events').select('stamp_count').throwOnError(),
    admin.from('rewards').select('*', { count: 'exact', head: true }).eq('status', 'earned'),
    admin.from('rewards').select('*', { count: 'exact', head: true }).eq('status', 'redeemed'),
    admin.from('merchants').select('id, billing_status, subscription_status, location_count').eq('billing_status', 'active'),
    admin.from('members').select('*', { count: 'exact', head: true }).gte('created_at', som),
    admin.from('merchants').select('*', { count: 'exact', head: true }).gte('created_at', som),
    admin.from('members').select('*', { count: 'exact', head: true }).eq('subscription_status', 'vip').gte('created_at', som),
    admin.from('merchants').select('*', { count: 'exact', head: true }).eq('billing_status', 'active').gte('created_at', som),
    admin.from('members').select('*', { count: 'exact', head: true }),
    admin.from('referrals').select('*', { count: 'exact', head: true }),
    admin.from('referrals').select('*', { count: 'exact', head: true }).eq('status', 'qualified'),
  ])

  const totalStamps = (stampSum ?? []).reduce((sum: number, r: { stamp_count: number }) => sum + (r.stamp_count ?? 0), 0)

  const activeMerchants = (merchants ?? []).filter(m => m.subscription_status === 'active')
  const merchantMrr = activeMerchants.reduce((sum, m) => {
    const locs = Math.max(1, m.location_count ?? 1)
    return sum + 299.99 + (locs - 1) * 79.99
  }, 0)
  const memberMrr  = (totalVip ?? 0) * 29.99
  const totalMrr   = merchantMrr + memberMrr

  const mrrGrowthThisMonth    = (newActiveMerchantsThisMonth ?? 0) * 299.99 + (newVipThisMonth ?? 0) * 29.99
  const vipConversionRate     = (totalMembers ?? 0) > 0 ? ((totalVip ?? 0) / (totalMembers ?? 0)) * 100 : 0
  const referralConversionRate = (totalReferrals ?? 0) > 0 ? ((qualifiedReferrals ?? 0) / (totalReferrals ?? 0)) * 100 : 0

  return NextResponse.json({
    starterMembers:          starterMembers ?? 0,
    totalVip:                totalVip ?? 0,
    totalStamps,
    couponsIssued:           couponsIssued ?? 0,
    couponsRedeemed:         couponsRedeemed ?? 0,
    activeMerchantCount:     activeMerchants.length,
    merchantMrr:             Math.round(merchantMrr * 100) / 100,
    memberMrr:               Math.round(memberMrr * 100) / 100,
    totalMrr:                Math.round(totalMrr * 100) / 100,
    newMembersThisMonth:     newMembersThisMonth ?? 0,
    newMerchantsThisMonth:   newMerchantsThisMonth ?? 0,
    mrrGrowthThisMonth:      Math.round(mrrGrowthThisMonth * 100) / 100,
    vipConversionRate:       Math.round(vipConversionRate * 10) / 10,
    referralConversionRate:  Math.round(referralConversionRate * 10) / 10,
  })
}
