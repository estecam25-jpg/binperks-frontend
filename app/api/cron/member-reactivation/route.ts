/**
 * GET /api/cron/member-reactivation — the daily "we miss you" run.
 *
 * Vercel calls this once a day (see vercel.json). It finds members who have
 * not earned a stamp in 30 days and fires the GHL reactivation workflow for
 * each one; GHL writes and sends the message itself, as it does for every
 * other BinPerks notification.
 *
 * ── Who gets it ────────────────────────────────────────────────────────────
 *   · active, not blacklisted
 *   · opted in to SMS — the GHL workflow sends a text and an email together,
 *     so an opted-out member gets neither (same rule as every other GHL call,
 *     see memberOptedIntoSms)
 *   · no stamp in the last 30 days. A member who has never earned one counts
 *     from the day they joined, so someone who signed up and never came back
 *     is exactly who this is for
 *   · not messaged in the last 30 days
 *   · not a BinPerks house member
 *
 * ── Messaged at most once per 30 days, even if this crashes ────────────────
 * The member is CLAIMED before the webhook is sent: reactivation_sent_at is
 * stamped first, with a compare-and-set that only wins if the column is still
 * null or older than the window. A second run, an overlapping run or a retry
 * finds nothing left to claim. The cost of that ordering is that a member
 * whose webhook then fails waits for the next window rather than being
 * retried tomorrow — the right way round for a message that goes to someone's
 * phone. Texting a member twice is worse than texting them late.
 *
 * ── After the response ─────────────────────────────────────────────────────
 * The claims are written before responding, so the response count is real.
 * The webhooks go out through waitUntil, which keeps the function alive past
 * the response rather than letting Vercel freeze them mid-flight.
 */

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { waitUntil } from '@vercel/functions'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { postToGhl } from '@/lib/ghl-webhook'
import { BINPERKS_HOUSE_MERCHANT_ID } from '@/lib/binperks-origin'

/** Silence that counts as dormant, and the gap between two messages to the
 *  same member. One number: a member messaged today is dormant again in 30
 *  days only if they still have not come in. */
const DORMANT_DAYS = 30

/** Most members messaged in a single run. A safety rail on both the runtime
 *  and the SMS bill, not a business rule — if a run ever hits it, the rest
 *  are picked up by the next day's run. */
const MAX_PER_RUN = 200

interface Candidate {
  id:         string
  first_name: string | null
  last_name:  string | null
  phone:      string | null
  email:      string | null
}

/** Vercel sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set
 *  on the project. Anything else is refused: this route texts real people. */
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = req.headers.get('authorization') ?? ''
  const offered = header.startsWith('Bearer ') ? header.slice(7) : ''
  const a = Buffer.from(offered)
  const b = Buffer.from(secret)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    console.error('[cron/member-reactivation] CRON_SECRET is not set — refusing to run')
    return NextResponse.json({ error: 'not_configured' }, { status: 500 })
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const webhookUrl = process.env.GHL_MEMBER_REACTIVATION_WEBHOOK_URL
  if (!webhookUrl) {
    // Nothing is claimed in this case. A member marked as messaged by a run
    // that had nowhere to send it would sit out the next 30 days in silence.
    console.warn('[cron/member-reactivation] GHL_MEMBER_REACTIVATION_WEBHOOK_URL is not set — nothing sent')
    return NextResponse.json({ messaged: 0, reason: 'webhook_not_configured' })
  }

  const admin  = createAdminSupabaseClient()
  const now    = new Date()
  const cutoff = new Date(now.getTime() - DORMANT_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // ── 1. Everyone who could be due ─────────────────────────────────────────
  // Everything except the stamp test, which needs activity_events.
  const { data: pool, error: poolError } = await admin
    .from('members')
    .select('id, first_name, last_name, phone, email, created_at')
    .eq('status', 'active')
    .eq('is_blacklisted', false)
    .eq('sms_opt_in', true)
    .neq('origin_merchant_id', BINPERKS_HOUSE_MERCHANT_ID)
    .or(`reactivation_sent_at.is.null,reactivation_sent_at.lt.${cutoff}`)
    .lt('created_at', cutoff)

  if (poolError) {
    console.error('[cron/member-reactivation] member query failed:', poolError)
    return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  }

  const candidates = (pool ?? []) as (Candidate & { created_at: string })[]
  if (candidates.length === 0) {
    console.log('[cron/member-reactivation] no candidates')
    return NextResponse.json({ messaged: 0, considered: 0 })
  }

  // ── 2. Drop anyone stamped inside the window ─────────────────────────────
  // One read for the whole pool rather than a query per member. Any stamp
  // counts, including a referral bonus: the member did something.
  const { data: recent, error: recentError } = await admin
    .from('activity_events')
    .select('member_id')
    .in('member_id', candidates.map(c => c.id))
    .gte('occurred_at', cutoff)

  if (recentError) {
    console.error('[cron/member-reactivation] activity query failed:', recentError)
    return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  }

  const stampedRecently = new Set((recent ?? []).map(r => r.member_id as string))
  const dormant = candidates.filter(c => !stampedRecently.has(c.id)).slice(0, MAX_PER_RUN)

  if (dormant.length === 0) {
    console.log(`[cron/member-reactivation] considered ${candidates.length}, none dormant`)
    return NextResponse.json({ messaged: 0, considered: candidates.length })
  }

  // ── 3. Claim, then send ──────────────────────────────────────────────────
  const claimedAt = now.toISOString()
  const claimed: Candidate[] = []

  for (const member of dormant) {
    const { data: won, error } = await admin
      .from('members')
      .update({ reactivation_sent_at: claimedAt })
      .eq('id', member.id)
      .or(`reactivation_sent_at.is.null,reactivation_sent_at.lt.${cutoff}`)
      .select('id')
    if (error) {
      console.error(`[cron/member-reactivation] claim failed for member ${member.id}:`, error)
      continue
    }
    if (won && won.length > 0) claimed.push(member)
  }

  console.log(
    `[cron/member-reactivation] considered ${candidates.length}, dormant ${dormant.length}, messaging ${claimed.length}`,
  )

  waitUntil((async () => {
    let delivered = 0
    for (const m of claimed) {
      const ok = await postToGhl(webhookUrl, {
        phone:     m.phone,
        firstName: m.first_name,
        lastName:  m.last_name,
        email:     m.email,
      }, 'cron/member-reactivation')
      if (ok) delivered++
    }
    // The gap between claimed and delivered is the number of members who will
    // not hear from us until the next window — worth seeing in the logs.
    console.log(`[cron/member-reactivation] delivered ${delivered} of ${claimed.length}`)
  })())

  return NextResponse.json({
    messaged:   claimed.length,
    dormant:    dormant.length,
    considered: candidates.length,
  })
}
