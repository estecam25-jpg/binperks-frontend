import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { verifyAdmin } from '@/lib/admin-auth'

export async function GET() {
  const adminEmail = await verifyAdmin()
  if (!adminEmail) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const admin = createAdminSupabaseClient()
  const startOfMonth = new Date()
  startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)
  const som = startOfMonth.toISOString()

  // settlement_ledger.settlement_period is text in YYYY-MM form.
  const now = new Date()
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

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
    { count: totalMembers },
    { count: totalReferrals },
    { count: qualifiedReferrals },
    { count: originatedMembers },
    { count: commissionEligibleMerchants },
    { data: retainedRows },
  ] = await Promise.all([
    admin.from('members').select('*', { count: 'exact', head: true }).eq('subscription_status', 'free'),
    admin.from('members').select('*', { count: 'exact', head: true }).eq('subscription_status', 'vip'),
    admin.from('stamp_events').select('stamp_count').throwOnError(),
    admin.from('rewards').select('*', { count: 'exact', head: true }).eq('status', 'earned'),
    admin.from('rewards').select('*', { count: 'exact', head: true }).eq('status', 'redeemed'),
    // created_at is selected so this month's new merchants can be derived from
    // these rows. A head-only count cannot carry location_count, and MRR
    // growth needs per-merchant location counts to be priced correctly.
    admin.from('merchants').select('id, billing_status, subscription_status, location_count, implementation_fee_paid_at, created_at').eq('billing_status', 'active'),
    admin.from('members').select('*', { count: 'exact', head: true }).gte('created_at', som),
    admin.from('merchants').select('*', { count: 'exact', head: true }).gte('created_at', som),
    admin.from('members').select('*', { count: 'exact', head: true }).eq('subscription_status', 'vip').gte('created_at', som),
    admin.from('members').select('*', { count: 'exact', head: true }),
    admin.from('referrals').select('*', { count: 'exact', head: true }),
    admin.from('referrals').select('*', { count: 'exact', head: true }).eq('status', 'qualified'),

    // V3 network stats
    admin.from('members').select('*', { count: 'exact', head: true }).not('origin_store_id', 'is', null),
    admin.from('merchants').select('*', { count: 'exact', head: true }).eq('commission_eligible', true),
    // Commissions BinPerks kept this period because the Origin Merchant was
    // ineligible at payment time. The ledger is merchant-centric: for a retained
    // commission nothing is owed to the merchant, so /api/member/vip-webhook
    // records credit_amount 0 and puts the $19.99 in debit_amount. Read
    // debit_amount — summing credit - debit here would report it as negative.
    admin.from('settlement_ledger')
      .select('debit_amount')
      .eq('ledger_entry_type', 'commission_retained_binperks')
      .eq('settlement_period', currentPeriod),
  ])

  const binperksRetainedThisMonth = (retainedRows ?? []).reduce(
    (sum: number, r: { debit_amount: number | null }) => sum + Number(r.debit_amount ?? 0),
    0,
  )

  const totalStamps = (stampSum ?? []).reduce((sum: number, r: { stamp_count: number }) => sum + (r.stamp_count ?? 0), 0)

  // V3 billing: the first cycle is $299.99 Implementation & Launch, then the
  // $99.00 platform subscription from cycle 2 onward. Additional locations are
  // $49.99 in every cycle, including the first.
  const IMPLEMENTATION_PRICE = 299.99
  const PLATFORM_PRICE       = 99.00
  const EXTRA_LOCATION_PRICE = 49.99

  const oneMonthAgo = new Date()
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)

  /**
   * What one merchant bills per month.
   *
   * Merchants still inside their first billing cycle are paying the
   * implementation fee. A null implementation_fee_paid_at means a pre-V3
   * merchant, who is by definition past their first cycle. Additional
   * locations are charged in every cycle, including the first.
   *
   * Shared by the MRR total and the growth figure so the two can't drift.
   */
  const monthlyBilling = (m: {
    location_count: number | null
    implementation_fee_paid_at: string | null
  }) => {
    const locs = Math.max(1, m.location_count ?? 1)
    const paidAt = m.implementation_fee_paid_at ? new Date(m.implementation_fee_paid_at) : null
    const inFirstCycle = paidAt !== null && paidAt > oneMonthAgo
    const basePrice = inFirstCycle ? IMPLEMENTATION_PRICE : PLATFORM_PRICE
    return basePrice + (locs - 1) * EXTRA_LOCATION_PRICE
  }

  const activeMerchants = (merchants ?? []).filter(m => m.subscription_status === 'active')
  const merchantMrr = activeMerchants.reduce((sum, m) => sum + monthlyBilling(m), 0)
  const memberMrr  = (totalVip ?? 0) * 29.99
  const totalMrr   = merchantMrr + memberMrr

  // Growth is priced per merchant, not as a flat implementation fee each. The
  // old version multiplied a bare count by $299.99, so it both ignored extra
  // locations and charged the implementation fee to merchants already past
  // their first cycle. Same billing_status/created_at filter as before.
  const newActiveMerchantsThisMonth = (merchants ?? []).filter(
    m => m.created_at != null && new Date(m.created_at) >= startOfMonth
  )
  const mrrGrowthThisMonth =
    newActiveMerchantsThisMonth.reduce((sum, m) => sum + monthlyBilling(m), 0)
    + (newVipThisMonth ?? 0) * 29.99
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
    // V3 network stats
    originatedMembers:           originatedMembers ?? 0,
    commissionEligibleMerchants: commissionEligibleMerchants ?? 0,
    binperksRetainedThisMonth:   Math.round(binperksRetainedThisMonth * 100) / 100,
    settlementPeriod:            currentPeriod,
  })
}
