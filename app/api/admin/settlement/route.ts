/**
 * GET /api/admin/settlement
 *
 * Lists all settlement batches, newest period first, for the God Mode
 * Settlement tab. Admin-only, read-only.
 *
 * Also reports the previous calendar month and whether a batch already exists
 * for it, so the UI can decide whether to offer the Calculate button without
 * re-deriving the period client-side.
 *
 * Responses:
 *   200 { batches, previousPeriod, previousPeriodCalculated }
 *   401 { error: 'forbidden' }
 */

import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin-auth'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

export async function GET() {
  const adminEmail = await verifyAdmin()
  if (!adminEmail) return NextResponse.json({ error: 'forbidden' }, { status: 401 })

  const admin = createAdminSupabaseClient()

  const { data: batches, error } = await admin
    .from('settlement_batches')
    .select(`
      id, settlement_period, period_start, period_end, status,
      total_membership_revenue, total_commission_credits, total_binperks_retained,
      total_coupon_debits, total_coupon_credits, total_binperks_coupon_fund,
      total_refund_adjustments, total_negative_balances, total_merchant_distributions,
      merchant_count, approved_by, approved_at, approval_notes,
      transfers_initiated_at, locked_at, created_at
    `)
    .order('settlement_period', { ascending: false })

  if (error) {
    console.error('[admin/settlement] query failed:', error)
    return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  }

  // Same UTC previous-month derivation the calculate route uses.
  const now        = new Date()
  const periodDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const previousPeriod =
    `${periodDate.getUTCFullYear()}-${String(periodDate.getUTCMonth() + 1).padStart(2, '0')}`

  const rows = batches ?? []

  return NextResponse.json({
    batches: rows.map(b => ({
      id:                   b.id,
      settlementPeriod:     b.settlement_period,
      periodStart:          b.period_start,
      periodEnd:            b.period_end,
      status:               b.status,
      membershipRevenue:    Number(b.total_membership_revenue ?? 0),
      commissionCredits:    Number(b.total_commission_credits ?? 0),
      binperksRetained:     Number(b.total_binperks_retained ?? 0),
      couponDebits:         Number(b.total_coupon_debits ?? 0),
      couponCredits:        Number(b.total_coupon_credits ?? 0),
      binperksCouponFund:   Number(b.total_binperks_coupon_fund ?? 0),
      refundAdjustments:    Number(b.total_refund_adjustments ?? 0),
      negativeBalances:     Number(b.total_negative_balances ?? 0),
      merchantDistributions: Number(b.total_merchant_distributions ?? 0),
      merchantCount:        b.merchant_count ?? 0,
      approvedBy:           b.approved_by,
      approvedAt:           b.approved_at,
      approvalNotes:        b.approval_notes,
      transfersInitiatedAt: b.transfers_initiated_at,
      lockedAt:             b.locked_at,
      createdAt:            b.created_at,
    })),
    previousPeriod,
    previousPeriodCalculated: rows.some(b => b.settlement_period === previousPeriod),
  })
}
