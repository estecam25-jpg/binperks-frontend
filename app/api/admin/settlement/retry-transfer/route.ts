/**
 * POST /api/admin/settlement/retry-transfer
 *
 * Retries the Stripe transfer for ONE settlement statement that failed, after
 * whatever blocked it has been fixed — usually the merchant finally completing
 * Stripe Connect onboarding. Admin-only.
 *
 * ── WHY THIS EXISTS SEPARATELY FROM APPROVE ────────────────────────────────
 * Approve locks the batch when it finishes, and a locked batch can never be
 * approved again (that guard is what stops a whole month being paid twice).
 * So a single merchant whose transfer failed had no route to payment at all:
 * the money sat on a 'failed' statement inside a batch nobody could touch.
 * This pays that one statement without reopening anything around it.
 *
 * ── NEVER PAYS TWICE ───────────────────────────────────────────────────────
 * Two independent guards, because this is real money:
 *
 *   1. A compare-and-set claim. The statement is moved to 'retrying' with
 *      `stripe_transfer_id is null` in the WHERE clause. Two admins clicking
 *      at the same moment means one claims the row and the other gets 409 —
 *      the database decides, not the order the requests arrived in.
 *   2. Stripe idempotency key `transfer_{statementId}` — the same key approve
 *      would have used. If a transfer for this statement ever did reach
 *      Stripe, Stripe returns that original transfer rather than making a
 *      second one.
 *
 * Note on the key: Stripe keeps idempotency keys for 24 hours and replays the
 * ORIGINAL response, errors included. If the first attempt failed at Stripe
 * itself (rather than failing our pre-checks), a retry inside that window
 * replays the same error. That is safe — it cannot double-pay — but it looks
 * like the fix did not work, so the error is reported as such.
 *
 * ── THE CARRY-FORWARD IS REVERSED ──────────────────────────────────────────
 * A failed statement's unpaid net was pushed into merchants.negative_balance
 * as a credit so the merchant would be paid next month instead. Paying it now
 * means that credit has to come back out, or they would be paid twice — once
 * here and once by next month's calculate. The reversal is part of the same
 * flow and is written to negative_balance_history.
 *
 * Body: { statementId }
 *
 * Responses:
 *   200 { transferred: true, transferId, amount, carryForwardReversed }
 *   200 { transferred: false, reason }        already paid — nothing to do
 *   400 { error: 'missing_statement_id' }
 *   401 { error: 'forbidden' }
 *   404 { error: 'statement_not_found' }
 *   409 { error: 'not_failed' | 'already_paid' | 'claim_lost' | 'nothing_owed' }
 *   422 { error: 'no_connect_account' | 'payouts_disabled' | 'transfers_disabled' }
 *   502 { error: 'transfer_failed', message }
 */

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { verifyAdmin } from '@/lib/admin-auth'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' })

function money(n: number): number {
  return Math.round(n * 100) / 100
}

export async function POST(req: NextRequest) {
  const adminEmail = await verifyAdmin()
  if (!adminEmail) return NextResponse.json({ error: 'forbidden' }, { status: 401 })

  const { statementId } = await req.json().catch(() => ({ statementId: null })) as { statementId?: string }
  if (!statementId) return NextResponse.json({ error: 'missing_statement_id' }, { status: 400 })

  const admin = createAdminSupabaseClient()

  const { data: stmt } = await admin
    .from('merchant_settlement_statements')
    .select('id, merchant_id, settlement_period, net_distribution, statement_status, stripe_transfer_id, carried_forward_amount')
    .eq('id', statementId)
    .maybeSingle()

  if (!stmt) return NextResponse.json({ error: 'statement_not_found' }, { status: 404 })

  if (stmt.stripe_transfer_id) {
    return NextResponse.json(
      { transferred: false, reason: 'already_paid', transferId: stmt.stripe_transfer_id },
      { status: 409 },
    )
  }
  if (stmt.statement_status !== 'failed') {
    return NextResponse.json({ error: 'not_failed', status: stmt.statement_status }, { status: 409 })
  }

  const net = money(Number(stmt.net_distribution ?? 0))
  if (!Number.isFinite(net) || net <= 0) {
    return NextResponse.json({ error: 'nothing_owed', net }, { status: 409 })
  }

  // The same flag that gates approve. Retrying is still moving money.
  if (process.env.STRIPE_TRANSFERS_ENABLED !== 'true') {
    return NextResponse.json({ error: 'transfers_disabled' }, { status: 422 })
  }

  const { data: merchant } = await admin
    .from('merchants')
    .select('id, company_name, stripe_connect_id, negative_balance')
    .eq('id', stmt.merchant_id)
    .maybeSingle()

  const destination = merchant?.stripe_connect_id ?? null
  if (!destination) {
    return NextResponse.json({ error: 'no_connect_account' }, { status: 422 })
  }

  // Checked live rather than trusted from our own copy: onboarding can be
  // half-finished, and a transfer to an account that cannot pay out would sit
  // stuck rather than reaching the merchant.
  try {
    const account = await stripe.accounts.retrieve(destination)
    // Keep the checklist's cached copy honest while we are here.
    await admin
      .from('merchants')
      .update({
        payouts_enabled:            account.payouts_enabled === true,
        payouts_enabled_checked_at: new Date().toISOString(),
      })
      .eq('id', stmt.merchant_id)

    if (!account.payouts_enabled) {
      await admin.from('merchant_settlement_statements')
        .update({ stripe_transfer_status: 'payouts_disabled' }).eq('id', statementId)
      return NextResponse.json({ error: 'payouts_disabled' }, { status: 422 })
    }
  } catch (err) {
    console.error(`[settlement/retry] account lookup failed for ${destination}:`, err)
    return NextResponse.json({ error: 'account_lookup_failed' }, { status: 502 })
  }

  // ── Claim the statement ────────────────────────────────────────────────────
  // Guard 1. Whoever's UPDATE matches first owns the retry; a second request
  // finds no row still 'failed' with a null transfer id and stops here.
  const { data: claimed } = await admin
    .from('merchant_settlement_statements')
    .update({ stripe_transfer_status: 'retrying' })
    .eq('id', statementId)
    .eq('statement_status', 'failed')
    .is('stripe_transfer_id', null)
    .select('id')

  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ error: 'claim_lost' }, { status: 409 })
  }

  // ── Transfer ───────────────────────────────────────────────────────────────
  let transfer: Stripe.Transfer
  try {
    transfer = await stripe.transfers.create(
      {
        amount:   Math.round(net * 100),
        currency: 'usd',
        destination,
        metadata: {
          merchantId:       stmt.merchant_id,
          settlementPeriod: stmt.settlement_period,
          statementId:      stmt.id,
          retriedBy:        adminEmail,
        },
      },
      // Guard 2. Deliberately the same key approve uses.
      { idempotencyKey: `transfer_${statementId}` },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[settlement/retry] statement=${statementId} FAILED — ${message}`)
    // Put it back where it was so the button stays available.
    await admin.from('merchant_settlement_statements')
      .update({ statement_status: 'failed', stripe_transfer_status: 'transfer_failed' })
      .eq('id', statementId)
    return NextResponse.json({ error: 'transfer_failed', message }, { status: 502 })
  }

  await admin
    .from('merchant_settlement_statements')
    .update({
      stripe_transfer_id:     transfer.id,
      stripe_transfer_status: 'succeeded',
      transfer_initiated_at:  new Date().toISOString(),
      statement_status:       'transferred',
    })
    .eq('id', statementId)

  // ── Take the carry-forward credit back out ─────────────────────────────────
  // Paid here, so it must not also be added to next month's payout.
  const carried = money(Number(stmt.carried_forward_amount ?? 0))
  let carryForwardReversed = 0

  if (carried > 0) {
    const balanceBefore = money(Number(merchant?.negative_balance ?? 0))
    const balanceAfter  = money(balanceBefore + carried)   // credit removed
    const now = new Date().toISOString()

    const { error: balErr } = await admin
      .from('merchants')
      .update({ negative_balance: balanceAfter, negative_balance_updated_at: now })
      .eq('id', stmt.merchant_id)

    if (balErr) {
      // The transfer is already out of the door. Leaving the credit in place
      // would pay this amount a second time next month, so it needs a human.
      console.error(
        `[settlement/retry] statement=${statementId} TRANSFER SENT (${transfer.id}) but the ` +
        `carry-forward credit of ${carried.toFixed(2)} could not be reversed:`, balErr,
      )
    } else {
      carryForwardReversed = carried
      await admin.from('negative_balance_history').insert({
        merchant_id:    stmt.merchant_id,
        event_type:     'carry_forward',
        amount:         carried,
        balance_before: balanceBefore,
        balance_after:  balanceAfter,
        reason:         `Retry paid settlement ${stmt.settlement_period} (${transfer.id}) — carry-forward credit reversed`,
        admin_user_id:  adminEmail,
      })
      await admin.from('merchant_settlement_statements')
        .update({ carried_forward_amount: 0, carried_forward_at: null })
        .eq('id', statementId)
    }
  }

  console.log(
    `[settlement/retry] statement=${statementId} merchant=${stmt.merchant_id} ` +
    `OK transfer=${transfer.id} amount=${net.toFixed(2)} ` +
    `carryForwardReversed=${carryForwardReversed.toFixed(2)} by=${adminEmail}`,
  )

  return NextResponse.json({
    transferred: true,
    transferId:  transfer.id,
    amount:      net,
    carryForwardReversed,
  })
}
