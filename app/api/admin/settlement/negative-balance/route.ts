/**
 * POST /api/admin/settlement/negative-balance
 *
 * Applies an approved batch's closing negative balances to the merchant
 * accounts, so they carry into the next settlement period. Admin-only.
 *
 * Body: { batchId }
 *
 * Runs after approval. Moves no money — a negative balance is a bookkeeping
 * carry-forward; BinPerks never issues a negative payout (CLAUDE.md
 * "COMMISSION AND SETTLEMENT MODEL").
 *
 * Scope note: this syncs merchants.negative_balance to each statement's
 * closing_negative_balance in BOTH directions, not only when the closing
 * balance is positive. A merchant whose prior debt was fully absorbed by this
 * period's earnings closes at 0, and their account must be cleared too —
 * leaving a stale balance would deduct the same debt again next month.
 *
 * Idempotent: a merchant whose stored balance already equals the closing
 * balance is skipped, so re-running produces no duplicate history rows.
 *
 * Responses:
 *   200 { batchId, applied, skipped, results }
 *   400 { error: 'missing_batch_id' }
 *   401 { error: 'forbidden' }
 *   404 { error: 'batch_not_found' }
 *   409 { error: 'batch_not_approved', status }
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin-auth'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

function money(n: number): number {
  return Math.round(n * 100) / 100
}

export async function POST(req: NextRequest) {
  const adminEmail = await verifyAdmin()
  if (!adminEmail) return NextResponse.json({ error: 'forbidden' }, { status: 401 })

  const { batchId } = await req.json() as { batchId?: string }
  if (!batchId) return NextResponse.json({ error: 'missing_batch_id' }, { status: 400 })

  const admin = createAdminSupabaseClient()

  const { data: batch } = await admin
    .from('settlement_batches')
    .select('id, status, settlement_period')
    .eq('id', batchId)
    .maybeSingle()

  if (!batch) return NextResponse.json({ error: 'batch_not_found' }, { status: 404 })

  // Balances only move once a human has signed off on the batch.
  if (!['approved', 'processing', 'completed', 'locked'].includes(batch.status)) {
    return NextResponse.json({ error: 'batch_not_approved', status: batch.status }, { status: 409 })
  }

  const { data: statements, error: stmtErr } = await admin
    .from('merchant_settlement_statements')
    .select('id, merchant_id, closing_negative_balance')
    .eq('settlement_batch_id', batchId)

  if (stmtErr) {
    console.error('[settlement/negative-balance] statement query failed:', stmtErr)
    return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  }

  const rows = statements ?? []
  if (rows.length === 0) {
    return NextResponse.json({ batchId, applied: 0, skipped: 0, results: [] })
  }

  const merchantIds = rows.map(s => s.merchant_id)
  const { data: merchants } = await admin
    .from('merchants')
    .select('id, negative_balance')
    .in('id', merchantIds)

  const currentById = new Map<string, number>()
  for (const m of (merchants ?? [])) currentById.set(m.id, Number(m.negative_balance ?? 0))

  const results: { merchantId: string; balanceBefore: number; balanceAfter: number; changed: boolean }[] = []
  let applied = 0
  let skipped = 0
  const now = new Date().toISOString()

  for (const s of rows) {
    const balanceBefore = currentById.get(s.merchant_id) ?? 0
    const balanceAfter  = money(Number(s.closing_negative_balance ?? 0))

    if (money(balanceBefore) === balanceAfter) {
      skipped++
      results.push({ merchantId: s.merchant_id, balanceBefore, balanceAfter, changed: false })
      continue
    }

    const { error: updErr } = await admin
      .from('merchants')
      .update({ negative_balance: balanceAfter, negative_balance_updated_at: now })
      .eq('id', s.merchant_id)

    if (updErr) {
      console.error(`[settlement/negative-balance] merchant ${s.merchant_id} update failed:`, updErr)
      continue
    }

    // amount is the delta: positive when debt grows, negative when it is
    // absorbed by this period's earnings.
    const { error: histErr } = await admin
      .from('negative_balance_history')
      .insert({
        merchant_id:         s.merchant_id,
        event_type:          'carry_forward',
        amount:              money(balanceAfter - balanceBefore),
        balance_before:      money(balanceBefore),
        balance_after:       balanceAfter,
        reason:              `Settlement ${batch.settlement_period} carry-forward`,
        admin_user_id:       adminEmail,
        settlement_batch_id: batchId,
      })

    if (histErr) {
      console.error(`[settlement/negative-balance] history insert failed for ${s.merchant_id}:`, histErr)
    }

    applied++
    results.push({ merchantId: s.merchant_id, balanceBefore, balanceAfter, changed: true })
  }

  console.log(
    `[settlement/negative-balance] batch=${batchId} period=${batch.settlement_period}`,
    `applied=${applied} skipped=${skipped} by=${adminEmail}`,
  )

  return NextResponse.json({ batchId, applied, skipped, results })
}
