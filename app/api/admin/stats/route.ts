import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { verifyAdmin } from '@/lib/admin-auth'
import { computeMrr, monthlyBilling, VIP_PRICE } from '@/lib/mrr'

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
    admin.from('activity_events').select('effective_stamps').throwOnError(),
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

  const totalStamps = (stampSum ?? []).reduce((sum: number, r: { effective_stamps: number }) => sum + (r.effective_stamps ?? 0), 0)

  // Pricing and the per-merchant billing rule live in lib/mrr, shared with
  // /api/admin/analytics. Two copies of the price table is how one dashboard
  // ends up reporting two different MRRs on two different tabs.
  const { activeMerchantCount, merchantMrr, memberMrr, totalMrr } =
    computeMrr(merchants ?? [], totalVip ?? 0)

  // Growth is priced per merchant, not as a flat implementation fee each. The
  // old version multiplied a bare count by $299.99, so it both ignored extra
  // locations and charged the implementation fee to merchants already past
  // their first cycle. Same billing_status/created_at filter as before.
  const newActiveMerchantsThisMonth = (merchants ?? []).filter(
    m => m.created_at != null && new Date(m.created_at) >= startOfMonth
  )
  const mrrGrowthThisMonth =
    newActiveMerchantsThisMonth.reduce((sum, m) => sum + monthlyBilling(m), 0)
    + (newVipThisMonth ?? 0) * VIP_PRICE
  const vipConversionRate     = (totalMembers ?? 0) > 0 ? ((totalVip ?? 0) / (totalMembers ?? 0)) * 100 : 0
  const referralConversionRate = (totalReferrals ?? 0) > 0 ? ((qualifiedReferrals ?? 0) / (totalReferrals ?? 0)) * 100 : 0

  return NextResponse.json({
    starterMembers:          starterMembers ?? 0,
    totalVip:                totalVip ?? 0,
    totalStamps,
    couponsIssued:           couponsIssued ?? 0,
    couponsRedeemed:         couponsRedeemed ?? 0,
    activeMerchantCount,
    merchantMrr,
    memberMrr,
    totalMrr,
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
