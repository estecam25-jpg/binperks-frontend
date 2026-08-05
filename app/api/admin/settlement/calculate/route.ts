/**
 * POST /api/admin/settlement/calculate
 *
 * Calculates the monthly settlement batch for the PREVIOUS calendar month.
 * Admin-only. Manually triggered — nothing here runs on a schedule.
 *
 * This route only computes and records. It initiates no Stripe transfers and
 * moves no money; the batch lands in status 'calculated' and requires an
 * explicit admin approval afterwards (CLAUDE.md rule 20).
 *
 * Steps:
 *   1. Resolve the previous calendar month as YYYY-MM
 *   2. 409 if a batch already exists for that period
 *   3. Aggregate settlement_ledger per merchant
 *   4. Insert settlement_batches (status 'calculated')
 *   5. Insert one merchant_settlement_statements row per merchant with activity
 *   6. Mark this period's ledger entries 'included' and link them to the batch
 *
 * Responses:
 *   200 { batch, statements, merchantCount }
 *   401 { error: 'forbidden' }
 *   409 { error: 'batch_exists', period, batchId }
 *   500 { error: string }
 */

import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin-auth'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

/** Ledger rows we aggregate. */
interface LedgerRow {
  id: string
  ledger_entry_type: string
  credit_amount: number | null
  debit_amount: number | null
  origin_merchant_id: string | null
  redeeming_merchant_id: string | null
}

interface MerchantTotals {
  originCommissionCredits: number
  couponDebits: number
  couponCredits: number
  refundAdjustments: number
  chargebackAdjustments: number
}

function emptyTotals(): MerchantTotals {
  return {
    originCommissionCredits: 0,
    couponDebits: 0,
    couponCredits: 0,
    refundAdjustments: 0,
    chargebackAdjustments: 0,
  }
}

/** Round to cents — avoids float drift accumulating across many ledger rows. */
function money(n: number): number {
  return Math.round(n * 100) / 100
}

export async function POST() {
  const adminEmail = await verifyAdmin()
  if (!adminEmail) return NextResponse.json({ error: 'forbidden' }, { status: 401 })

  const admin = createAdminSupabaseClient()

  // ── 1. Previous calendar month, in UTC ────────────────────────────────────
  // UTC throughout so the period boundary does not shift with server locale.
  const now        = new Date()
  const periodDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const year       = periodDate.getUTCFullYear()
  const month      = periodDate.getUTCMonth()          // 0-indexed
  const period     = `${year}-${String(month + 1).padStart(2, '0')}`
  const periodStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
  // Last millisecond of the month: start of next month minus 1ms.
  const periodEnd   = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0) - 1)

  // ── 2. Refuse to double-calculate a period ────────────────────────────────
  const { data: existingBatch } = await admin
    .from('settlement_batches')
    .select('id, status')
    .eq('settlement_period', period)
    .maybeSingle()

  if (existingBatch) {
    return NextResponse.json(
      { error: 'batch_exists', period, batchId: existingBatch.id, status: existingBatch.status },
      { status: 409 },
    )
  }

  // ── 3. Aggregate the ledger ───────────────────────────────────────────────
  // Only 'pending' rows are swept in. Rows already marked 'included' or
  // 'settled' belong to a batch that has run, and must never be counted twice.
  const { data: ledgerRows, error: ledgerErr } = await admin
    .from('settlement_ledger')
    .select('id, ledger_entry_type, credit_amount, debit_amount, origin_merchant_id, redeeming_merchant_id')
    .eq('settlement_period', period)
    .eq('ledger_status', 'pending')

  if (ledgerErr) {
    console.error('[settlement/calculate] ledger query failed:', ledgerErr)
    return NextResponse.json({ error: 'ledger_query_failed' }, { status: 500 })
  }

  const rows = (ledgerRows ?? []) as LedgerRow[]
  const byMerchant = new Map<string, MerchantTotals>()
  const totalsFor = (merchantId: string) => {
    if (!byMerchant.has(merchantId)) byMerchant.set(merchantId, emptyTotals())
    return byMerchant.get(merchantId)!
  }

  // BinPerks-side totals — these never reach a merchant statement.
  let binperksRetained  = 0
  let binperksCouponFund = 0

  for (const r of rows) {
    const credit = Number(r.credit_amount ?? 0)
    const debit  = Number(r.debit_amount ?? 0)

    switch (r.ledger_entry_type) {
      case 'commission_credit':
        // Earned by the Origin Merchant.
        if (r.origin_merchant_id) totalsFor(r.origin_merchant_id).originCommissionCredits += credit
        break

      case 'commission_retained_binperks':
        // Kept by BinPerks because the Origin Merchant was ineligible at payment
        // time. Read from debit_amount: the ledger is merchant-centric, so the
        // vip-webhook records this as credit 0 / debit 19.99 (nothing is owed to
        // the merchant). Never added to any merchant statement.
        binperksRetained += debit
        break

      case 'coupon_debit_origin':
        // Origin Merchant funds a coupon its member redeemed elsewhere.
        if (r.origin_merchant_id) totalsFor(r.origin_merchant_id).couponDebits += debit
        break

      case 'coupon_debit_binperks':
        // BinPerks funds the coupon (origin merchant ineligible/inactive).
        binperksCouponFund += debit
        break

      case 'coupon_credit_redeeming':
        // Reimburses whichever merchant actually honoured the coupon.
        if (r.redeeming_merchant_id) totalsFor(r.redeeming_merchant_id).couponCredits += credit
        break

      case 'refund_adjustment':
        if (r.origin_merchant_id) totalsFor(r.origin_merchant_id).refundAdjustments += debit
        break

      case 'chargeback_adjustment':
        if (r.origin_merchant_id) totalsFor(r.origin_merchant_id).chargebackAdjustments += debit
        break

      // carry_forward_debit / carry_forward_credit are written by the
      // negative-balance step against the NEXT period, so they are not
      // re-aggregated here.
      default:
        break
    }
  }

  const merchantIds = [...byMerchant.keys()]

  // Prior negative balances carry into this period's net distribution.
  const { data: merchantRows } = merchantIds.length > 0
    ? await admin.from('merchants').select('id, company_name, negative_balance').in('id', merchantIds)
    : { data: [] as { id: string; company_name: string | null; negative_balance: number | null }[] }

  const priorBalanceById = new Map<string, number>()
  const nameById         = new Map<string, string>()
  for (const m of (merchantRows ?? [])) {
    priorBalanceById.set(m.id, Number(m.negative_balance ?? 0))
    nameById.set(m.id, m.company_name ?? '')
  }

  // Membership revenue for the period comes from commission_decisions, which is
  // the only place the actual amount collected from members is recorded.
  const { data: decisions } = await admin
    .from('commission_decisions')
    .select('payment_amount')
    .eq('settlement_period', period)

  const membershipRevenue = money(
    (decisions ?? []).reduce((s, d) => s + Number(d.payment_amount ?? 0), 0),
  )

  // Per-merchant statement figures.
  const statementDrafts = merchantIds.map(merchantId => {
    const t = byMerchant.get(merchantId)!
    const priorNegativeBalance = priorBalanceById.get(merchantId) ?? 0

    const grossDistribution = money(
      t.originCommissionCredits
      - t.couponDebits
      + t.couponCredits
      - t.refundAdjustments
      - t.chargebackAdjustments,
    )

    const afterPrior = money(grossDistribution - priorNegativeBalance)

    // Never issue a negative payout — the shortfall carries forward instead.
    const netDistribution        = afterPrior < 0 ? 0 : afterPrior
    const closingNegativeBalance = afterPrior < 0 ? money(Math.abs(afterPrior)) : 0

    return {
      merchantId,
      merchantName:             nameById.get(merchantId) ?? '',
      originCommissionCredits:  money(t.originCommissionCredits),
      couponDebits:             money(t.couponDebits),
      couponCredits:            money(t.couponCredits),
      refundAdjustments:        money(t.refundAdjustments),
      chargebackAdjustments:    money(t.chargebackAdjustments),
      priorNegativeBalance:     money(priorNegativeBalance),
      grossDistribution,
      netDistribution,
      closingNegativeBalance,
    }
  })

  const batchTotals = {
    total_membership_revenue:   membershipRevenue,
    total_commission_credits:   money(statementDrafts.reduce((s, x) => s + x.originCommissionCredits, 0)),
    total_binperks_retained:    money(binperksRetained),
    total_coupon_debits:        money(statementDrafts.reduce((s, x) => s + x.couponDebits, 0)),
    total_coupon_credits:       money(statementDrafts.reduce((s, x) => s + x.couponCredits, 0)),
    total_binperks_coupon_fund: money(binperksCouponFund),
    // settlement_batches has no separate chargeback column — refunds and
    // chargebacks are reported together at batch level. The per-merchant split
    // is preserved on each statement.
    total_refund_adjustments:   money(
      statementDrafts.reduce((s, x) => s + x.refundAdjustments + x.chargebackAdjustments, 0),
    ),
    total_negative_balances:    money(statementDrafts.reduce((s, x) => s + x.closingNegativeBalance, 0)),
    total_merchant_distributions: money(statementDrafts.reduce((s, x) => s + x.netDistribution, 0)),
    merchant_count:             statementDrafts.length,
  }

  // ── 4. Create the batch ───────────────────────────────────────────────────
  const { data: batch, error: batchErr } = await admin
    .from('settlement_batches')
    .insert({
      settlement_period: period,
      period_start:      periodStart.toISOString(),
      period_end:        periodEnd.toISOString(),
      status:            'calculated',
      ...batchTotals,
    })
    .select('*')
    .single()

  if (batchErr || !batch) {
    console.error('[settlement/calculate] batch insert failed:', batchErr)
    return NextResponse.json({ error: 'batch_insert_failed' }, { status: 500 })
  }

  // ── 5. Create merchant statements ─────────────────────────────────────────
  if (statementDrafts.length > 0) {
    const { error: stmtErr } = await admin
      .from('merchant_settlement_statements')
      .insert(statementDrafts.map(s => ({
        settlement_batch_id:       batch.id,
        merchant_id:               s.merchantId,
        settlement_period:         period,
        origin_commission_credits: s.originCommissionCredits,
        coupon_debits:             s.couponDebits,
        coupon_credits:            s.couponCredits,
        refund_adjustments:        s.refundAdjustments,
        chargeback_adjustments:    s.chargebackAdjustments,
        prior_negative_balance:    s.priorNegativeBalance,
        gross_distribution:        s.grossDistribution,
        net_distribution:          s.netDistribution,
        closing_negative_balance:  s.closingNegativeBalance,
        statement_status:          'draft',
      })))

    if (stmtErr) {
      // Roll back the batch by hand — Supabase JS has no transactions, and an
      // orphan batch would 409 every future attempt at this period.
      console.error('[settlement/calculate] statement insert failed, removing batch:', stmtErr)
      await admin.from('settlement_batches').delete().eq('id', batch.id)
      return NextResponse.json({ error: 'statement_insert_failed' }, { status: 500 })
    }
  }

  // ── 6. Claim the ledger rows for this batch ───────────────────────────────
  if (rows.length > 0) {
    const { error: markErr } = await admin
      .from('settlement_ledger')
      .update({ ledger_status: 'included', settlement_batch_id: batch.id })
      .in('id', rows.map(r => r.id))

    if (markErr) {
      // Batch and statements are already written and are correct. Leaving the
      // ledger rows 'pending' would let a later period double-count them, so
      // this needs manual attention rather than a silent pass.
      console.error('[settlement/calculate] ledger status update failed:', markErr)
      return NextResponse.json({
        error:   'ledger_mark_failed',
        batchId: batch.id,
        message: 'Batch and statements were created but ledger entries were not marked included. Resolve before calculating another period.',
      }, { status: 500 })
    }
  }

  console.log(
    `[settlement/calculate] period=${period} merchants=${statementDrafts.length}`,
    `distributions=${batchTotals.total_merchant_distributions} retained=${batchTotals.total_binperks_retained}`,
    `by=${adminEmail}`,
  )

  return NextResponse.json({
    batch,
    statements:    statementDrafts,
    merchantCount: statementDrafts.length,
    ledgerEntries: rows.length,
  })
}
