/**
 * POST /api/admin/settlement/approve
 *
 * Approves a calculated settlement batch and, when transfers are enabled,
 * pays each merchant via Stripe Connect. Admin-only.
 *
 * Approval is the money gate (CLAUDE.md rule 20): nothing moves until an admin
 * clicks it, and a batch can only be approved once.
 *
 * ── WHY TRANSFERS ARE BEHIND A FLAG ──────────────────────────────────────────
 * STRIPE_TRANSFERS_ENABLED must be 'true' for a real transfer to be created.
 * Two reasons, both deliberate:
 *
 *   1. CLAUDE.md LEGAL STATUS records Stripe Connect payouts as pending
 *      attorney confirmation. Shipping the code is fine; moving member money
 *      before that sign-off is not.
 *   2. Until this change, Approve was a bookkeeping click with no financial
 *      consequence. Silently turning that same button into an irreversible
 *      payout is exactly the kind of surprise a flag exists to prevent.
 *
 * With the flag off the batch is approved and statements are marked approved,
 * but no transfer is attempted and the batch is NOT locked — so it can still be
 * paid later. Turn the flag on BEFORE approving a batch you intend to pay.
 *
 * ── TRANSFER RULES ───────────────────────────────────────────────────────────
 *   - Idempotency key transfer_{statementId}: a retry can never double-pay.
 *   - net_distribution must be > 0. Zero and negative are skipped, never sent.
 *     A negative balance carries forward; it is not a payout.
 *   - The destination account must have payouts_enabled at Stripe, checked live
 *     at transfer time rather than trusted from our own records.
 *   - One merchant failing never blocks the rest of the batch.
 *   - Every attempt is logged, success or failure.
 *
 * Body: { batchId, notes? }
 *
 * Responses:
 *   200 { batch, transfers: { attempted, succeeded, failed, skipped, enabled } }
 *   400 { error: 'missing_batch_id' }
 *   401 { error: 'forbidden' }
 *   404 { error: 'batch_not_found' }
 *   409 { error: 'invalid_status', status }
 */

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { verifyAdmin } from '@/lib/admin-auth'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' })

// Only a batch still awaiting sign-off may be approved. Re-approving an
// already-approved batch is rejected so approved_by/approved_at stay truthful.
const APPROVABLE_STATUSES = ['calculated', 'pending_approval']

function transfersEnabled(): boolean {
  return process.env.STRIPE_TRANSFERS_ENABLED === 'true'
}

interface StatementRow {
  id: string
  merchant_id: string
  net_distribution: number | string | null
  stripe_transfer_id: string | null
}

export async function POST(req: NextRequest) {
  const adminEmail = await verifyAdmin()
  if (!adminEmail) return NextResponse.json({ error: 'forbidden' }, { status: 401 })

  const { batchId, notes } = await req.json() as { batchId?: string; notes?: string }
  if (!batchId) return NextResponse.json({ error: 'missing_batch_id' }, { status: 400 })

  const admin = createAdminSupabaseClient()

  const { data: batch } = await admin
    .from('settlement_batches')
    .select('id, status, settlement_period')
    .eq('id', batchId)
    .maybeSingle()

  if (!batch) return NextResponse.json({ error: 'batch_not_found' }, { status: 404 })

  if (!APPROVABLE_STATUSES.includes(batch.status)) {
    return NextResponse.json({ error: 'invalid_status', status: batch.status }, { status: 409 })
  }

  const approvedAt = new Date().toISOString()

  // Status is re-checked in the WHERE clause so two admins clicking Approve at
  // the same moment cannot both write an approval — and, now that approval
  // moves money, cannot both start a round of transfers.
  const { data: updated, error } = await admin
    .from('settlement_batches')
    .update({
      status:         'approved',
      approved_by:    adminEmail,
      approved_at:    approvedAt,
      approval_notes: notes?.trim() || null,
      updated_at:     approvedAt,
    })
    .eq('id', batchId)
    .in('status', APPROVABLE_STATUSES)
    .select('*')
    .single()

  if (error || !updated) {
    console.error('[settlement/approve] update failed:', error)
    return NextResponse.json({ error: 'approve_failed' }, { status: 500 })
  }

  // Merchant statements move to 'approved' alongside the batch so the merchant
  // Settlement tab reflects the decision before any transfer is attempted.
  await admin
    .from('merchant_settlement_statements')
    .update({ statement_status: 'approved' })
    .eq('settlement_batch_id', batchId)
    .eq('statement_status', 'draft')

  console.log(`[settlement/approve] batch=${batchId} period=${batch.settlement_period} by=${adminEmail}`)

  // ── Transfers ──────────────────────────────────────────────────────────────
  const summary = { attempted: 0, succeeded: 0, failed: 0, skipped: 0, enabled: transfersEnabled() }

  const { data: statements } = await admin
    .from('merchant_settlement_statements')
    .select('id, merchant_id, net_distribution, stripe_transfer_id')
    .eq('settlement_batch_id', batchId)

  const rows = (statements ?? []) as StatementRow[]

  if (!summary.enabled) {
    console.warn(
      `[settlement/approve] STRIPE_TRANSFERS_ENABLED is not 'true' — approved batch=${batchId} ` +
      `with ${rows.length} statement(s) and initiated NO transfers. Batch left unlocked.`
    )
    return NextResponse.json({ batch: updated, transfers: summary })
  }

  // Merchant Connect ids in one query rather than per statement.
  const merchantIds = [...new Set(rows.map(r => r.merchant_id))]
  const { data: merchants } = merchantIds.length > 0
    ? await admin.from('merchants').select('id, stripe_connect_id').in('id', merchantIds)
    : { data: [] as { id: string; stripe_connect_id: string | null }[] }

  const connectById = new Map<string, string | null>()
  for (const m of (merchants ?? [])) connectById.set(m.id, m.stripe_connect_id)

  /** Marks a statement unpayable. The reason lives in stripe_transfer_status —
   *  the table has no notes column, and that field already surfaces in both the
   *  admin batch view and the merchant's own statement list. */
  const markFailed = async (statementId: string, reason: string) => {
    summary.failed++
    await admin
      .from('merchant_settlement_statements')
      .update({ statement_status: 'failed', stripe_transfer_status: reason })
      .eq('id', statementId)
  }

  for (const s of rows) {
    const net = Number(s.net_distribution ?? 0)

    // Never transfer zero or negative. A negative balance is carried forward by
    // /api/admin/settlement/negative-balance, not settled by a payment.
    if (!Number.isFinite(net) || net <= 0) {
      summary.skipped++
      console.log(`[settlement/transfer] statement=${s.id} skipped — net_distribution=${net}`)
      continue
    }

    // Already paid on an earlier run. Stripe's idempotency key would collapse a
    // duplicate anyway; skipping keeps the summary counts honest.
    if (s.stripe_transfer_id) {
      summary.skipped++
      console.log(`[settlement/transfer] statement=${s.id} skipped — already has transfer ${s.stripe_transfer_id}`)
      continue
    }

    const destination = connectById.get(s.merchant_id) ?? null
    if (!destination) {
      console.warn(`[settlement/transfer] statement=${s.id} merchant=${s.merchant_id} FAILED — no Stripe Connect account`)
      await markFailed(s.id, 'no_connect_account')
      continue
    }

    // Checked live at Stripe rather than from our own copy: verification can
    // lapse after onboarding, and a transfer to an account that cannot pay out
    // would sit stuck rather than reaching the merchant.
    try {
      const account = await stripe.accounts.retrieve(destination)
      if (!account.payouts_enabled) {
        console.warn(`[settlement/transfer] statement=${s.id} merchant=${s.merchant_id} FAILED — payouts_enabled false`)
        await markFailed(s.id, 'payouts_disabled')
        continue
      }
    } catch (err) {
      console.error(`[settlement/transfer] statement=${s.id} account lookup failed:`, err)
      await markFailed(s.id, 'account_lookup_failed')
      continue
    }

    summary.attempted++
    try {
      const transfer = await stripe.transfers.create(
        {
          amount:      Math.round(net * 100),   // cents
          currency:    'usd',
          destination,
          metadata: {
            merchantId:       s.merchant_id,
            settlementPeriod: batch.settlement_period,
            statementId:      s.id,
          },
        },
        { idempotencyKey: `transfer_${s.id}` },
      )

      await admin
        .from('merchant_settlement_statements')
        .update({
          stripe_transfer_id:     transfer.id,
          stripe_transfer_status: 'succeeded',
          transfer_initiated_at:  new Date().toISOString(),
          statement_status:       'transferred',
        })
        .eq('id', s.id)

      summary.succeeded++
      console.log(
        `[settlement/transfer] statement=${s.id} merchant=${s.merchant_id} ` +
        `OK transfer=${transfer.id} amount=${net.toFixed(2)}`
      )
    } catch (err) {
      // One merchant's failure must not stop the rest of the batch.
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[settlement/transfer] statement=${s.id} merchant=${s.merchant_id} FAILED — ${message}`)
      await markFailed(s.id, 'transfer_failed')
    }
  }

  // Locked once every statement has been attempted. Only reached when transfers
  // are enabled — a skipped round leaves the batch open so it can still be paid.
  const lockedAt = new Date().toISOString()
  const { data: locked } = await admin
    .from('settlement_batches')
    .update({
      status:                'locked',
      transfers_initiated_at: lockedAt,
      locked_at:             lockedAt,
      updated_at:            lockedAt,
    })
    .eq('id', batchId)
    .select('*')
    .single()

  console.log(
    `[settlement/approve] batch=${batchId} transfers complete — ` +
    `attempted=${summary.attempted} succeeded=${summary.succeeded} ` +
    `failed=${summary.failed} skipped=${summary.skipped}`
  )

  return NextResponse.json({ batch: locked ?? updated, transfers: summary })
}
