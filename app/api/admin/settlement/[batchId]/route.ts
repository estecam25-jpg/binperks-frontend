/**
 * GET /api/admin/settlement/[batchId]
 *
 * Full detail for one settlement batch: the batch totals plus every merchant
 * statement it contains, with merchant names resolved. Admin-only, read-only.
 *
 * Responses:
 *   200 { batch, statements }
 *   401 { error: 'forbidden' }
 *   404 { error: 'batch_not_found' }
 */

import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin-auth'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const adminEmail = await verifyAdmin()
  if (!adminEmail) return NextResponse.json({ error: 'forbidden' }, { status: 401 })

  // Next.js 16: dynamic route params are a Promise — always await.
  const { batchId } = await params

  const admin = createAdminSupabaseClient()

  const { data: batch } = await admin
    .from('settlement_batches')
    .select('*')
    .eq('id', batchId)
    .maybeSingle()

  if (!batch) return NextResponse.json({ error: 'batch_not_found' }, { status: 404 })

  const { data: statements, error } = await admin
    .from('merchant_settlement_statements')
    .select(`
      id, merchant_id, settlement_period,
      origin_commission_credits, coupon_debits, coupon_credits,
      refund_adjustments, chargeback_adjustments, prior_negative_balance,
      gross_distribution, net_distribution, closing_negative_balance,
      statement_status, stripe_transfer_id, stripe_transfer_status,
      transfer_initiated_at, transfer_completed_at,
      admin_adjustment_amount, admin_adjustment_reason
    `)
    .eq('settlement_batch_id', batchId)

  if (error) {
    console.error('[admin/settlement/:id] statement query failed:', error)
    return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  }

  const rows = statements ?? []

  // Resolve merchant names in one query rather than a join — Supabase relation
  // joins return arrays and complicate typing for no benefit here.
  const merchantIds = [...new Set(rows.map(s => s.merchant_id))]
  const { data: merchants } = merchantIds.length > 0
    ? await admin.from('merchants').select('id, company_name, name').in('id', merchantIds)
    : { data: [] as { id: string; company_name: string | null; name: string | null }[] }

  const nameById = new Map<string, string>()
  for (const m of (merchants ?? [])) {
    nameById.set(m.id, (m.company_name || m.name) ?? '')
  }

  return NextResponse.json({
    batch: {
      id:                    batch.id,
      settlementPeriod:      batch.settlement_period,
      periodStart:           batch.period_start,
      periodEnd:             batch.period_end,
      status:                batch.status,
      membershipRevenue:     Number(batch.total_membership_revenue ?? 0),
      commissionCredits:     Number(batch.total_commission_credits ?? 0),
      binperksRetained:      Number(batch.total_binperks_retained ?? 0),
      couponDebits:          Number(batch.total_coupon_debits ?? 0),
      couponCredits:         Number(batch.total_coupon_credits ?? 0),
      binperksCouponFund:    Number(batch.total_binperks_coupon_fund ?? 0),
      refundAdjustments:     Number(batch.total_refund_adjustments ?? 0),
      negativeBalances:      Number(batch.total_negative_balances ?? 0),
      merchantDistributions: Number(batch.total_merchant_distributions ?? 0),
      merchantCount:         batch.merchant_count ?? 0,
      approvedBy:            batch.approved_by,
      approvedAt:            batch.approved_at,
      approvalNotes:         batch.approval_notes,
      transfersInitiatedAt:  batch.transfers_initiated_at,
      lockedAt:              batch.locked_at,
      createdAt:             batch.created_at,
    },
    statements: rows.map(s => ({
      id:                      s.id,
      merchantId:              s.merchant_id,
      merchantName:            nameById.get(s.merchant_id) ?? '',
      settlementPeriod:        s.settlement_period,
      originCommissionCredits: Number(s.origin_commission_credits ?? 0),
      couponDebits:            Number(s.coupon_debits ?? 0),
      couponCredits:           Number(s.coupon_credits ?? 0),
      refundAdjustments:       Number(s.refund_adjustments ?? 0),
      chargebackAdjustments:   Number(s.chargeback_adjustments ?? 0),
      priorNegativeBalance:    Number(s.prior_negative_balance ?? 0),
      grossDistribution:       Number(s.gross_distribution ?? 0),
      netDistribution:         Number(s.net_distribution ?? 0),
      closingNegativeBalance:  Number(s.closing_negative_balance ?? 0),
      statementStatus:         s.statement_status,
      transferStatus:          s.stripe_transfer_status,
      transferInitiatedAt:     s.transfer_initiated_at,
      transferCompletedAt:     s.transfer_completed_at,
      adminAdjustmentAmount:   s.admin_adjustment_amount == null ? null : Number(s.admin_adjustment_amount),
      adminAdjustmentReason:   s.admin_adjustment_reason,
    })),
  })
}
