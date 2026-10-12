/**
 * GET /api/cron/merchant-inactivity — the 30-day clock on an unpaid merchant.
 *
 * Runs daily (see vercel.json). A merchant whose platform payment failed and
 * is still unpaid 30 days later goes inactive: billing_status 'inactive',
 * became_inactive_at stamped, commission eligibility ended, and from that
 * moment none of its stores can award a stamp (see lib/merchant-status).
 *
 * WHY A JOB AND NOT A WEBHOOK. Nothing arrives from Stripe on day 30 — the
 * failed payment is an event, the deadline is a date. Stripe's own dunning may
 * cancel the subscription earlier, which the merchant webhook already handles;
 * this covers the case where it does not.
 *
 * WHAT IT DOES NOT DO: take anything away retroactively. Stamps awarded during
 * the grace period stand, coupons already earned are still owed by whoever
 * funded them, and commissions already decided are never recalculated. Going
 * inactive only stops what happens next.
 *
 * REVERSIBLE BY PAYING. A successful payment clears payment_failed_at and
 * became_inactive_at and restores 'active' — see /api/merchant/webhook. The
 * one thing paying does NOT undo is a member who has already transferred away.
 */

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { GRACE_PERIOD_DAYS } from '@/lib/merchant-status'

/** Vercel sends `Authorization: Bearer $CRON_SECRET`. Anything else is
 *  refused: this route can stop a live merchant trading. */
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = req.headers.get('authorization') ?? ''
  const offered = header.startsWith('Bearer ') ? header.slice(7) : ''
  const a = Buffer.from(offered), b = Buffer.from(secret)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    console.error('[cron/merchant-inactivity] CRON_SECRET is not set — refusing to run')
    return NextResponse.json({ error: 'not_configured' }, { status: 500 })
  }
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin  = createAdminSupabaseClient()
  const now    = new Date()
  const cutoff = new Date(now.getTime() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // Still in grace, payment failed long enough ago, still unpaid.
  const { data: due, error } = await admin
    .from('merchants')
    .select('id, company_name, payment_failed_at')
    .eq('billing_status', 'grace_period')
    .not('payment_failed_at', 'is', null)
    .lt('payment_failed_at', cutoff)

  if (error) {
    console.error('[cron/merchant-inactivity] query failed:', error)
    return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  }

  const candidates = due ?? []
  if (candidates.length === 0) {
    console.log('[cron/merchant-inactivity] nothing past the grace period')
    return NextResponse.json({ deactivated: 0 })
  }

  const nowIso = now.toISOString()
  const deactivated: string[] = []

  for (const m of candidates) {
    // Compare-and-set on grace_period: a payment that landed between the read
    // above and this write must win, not be overwritten with 'inactive'.
    const { data: claimed, error: claimError } = await admin
      .from('merchants')
      .update({
        billing_status:               'inactive',
        became_inactive_at:           nowIso,
        commission_eligible:          false,
        commission_suspended_at:      nowIso,
        commission_suspension_reason: `Unpaid for ${GRACE_PERIOD_DAYS} days after a failed platform payment`,
        last_deactivated_at:          nowIso,
      })
      .eq('id', m.id)
      .eq('billing_status', 'grace_period')
      .select('id')

    if (claimError) {
      console.error(`[cron/merchant-inactivity] ${m.id} update failed:`, claimError)
      continue
    }
    if (!claimed || claimed.length === 0) continue   // paid in the meantime

    // Their stores stop being part of the network: out of the member app, no
    // new enrolments. is_active false is what the stamp tool's store list and
    // the member store finder both read.
    await admin.from('stores')
      .update({ is_active: false, network_visible: false, enrollment_enabled: false })
      .eq('merchant_id', m.id)

    const { error: histError } = await admin.from('origin_eligibility_history').insert({
      merchant_id:         m.id,
      event_type:          'grace_period_ended',
      effective_at:        nowIso,
      triggered_by:        'system',
      reason:              `Grace period expired — unpaid ${GRACE_PERIOD_DAYS} days after payment failure. Stores can no longer award stamps.`,
      commission_eligible: false,
    })
    if (histError) console.error('[cron/merchant-inactivity] history insert failed:', histError)

    deactivated.push(m.id)
    console.log(`[cron/merchant-inactivity] merchant ${m.id} (${m.company_name ?? '—'}) is now inactive`)
  }

  return NextResponse.json({ deactivated: deactivated.length, considered: candidates.length })
}
