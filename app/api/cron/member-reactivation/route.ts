/**
 * GET /api/cron/member-reactivation — the "we miss you" ladder.
 *
 * Runs daily (see vercel.json). Two rungs, and a member can only ever be on
 * one of them:
 *
 *   DAY 30   no stamp for 30 days → a reminder. No coupon.
 *   DAY 60   still nothing → a second reminder, and a one-time $2 coupon that
 *            expires 14 days after it is added.
 *
 * After day 60 the messages stop. If the member comes back and earns a stamp,
 * the ladder resets to the bottom and they can climb it again — but the $2
 * coupon is ONCE PER MEMBER FOR THE LIFE OF THE ACCOUNT, so a second lap sends
 * the messages without it.
 *
 * ── WHO IS SKIPPED ─────────────────────────────────────────────────────────
 * Inactive, blacklisted, and anyone who has not opted in to SMS — a GHL
 * workflow sends its text and its email together, so an opted-out member gets
 * neither (see memberOptedIntoSms). Everyone else is in: free, VIP, and former
 * VIPs alike.
 *
 * A member already holding an unused coupon still gets the DAY 60 MESSAGE but
 * no coupon: handing a second one to someone who has not spent the first is
 * noise, and it would also make the cashier's "redeem before stamping" prompt
 * ambiguous.
 *
 * ── WHO PAYS FOR IT ────────────────────────────────────────────────────────
 * The member's origin store, recorded on the reward row as funding_merchant_id
 * exactly as a 20-stamp coupon is. It settles through the same monthly batch.
 *
 * ── THE PAUSE SWITCH ───────────────────────────────────────────────────────
 * REACTIVATION_CRON_ENABLED must be the string "true" for this job to do
 * anything at all. Anything else — "false", empty, unset — and it returns
 * before it reads or writes a single row. Deliberately fail-closed: this job
 * is the one that puts a message on a real person's phone, so a missing or
 * fat-fingered variable has to mean silence, not a send.
 *
 * ── EXACTLY ONCE ───────────────────────────────────────────────────────────
 * The stage is CLAIMED before anything is sent, with a compare-and-set on the
 * stage the member was on. An overlapping run, a retry, or two instances of
 * this job cannot message the same member twice. The cost is that a member
 * whose webhook then fails waits for the next rung rather than being retried
 * tomorrow — right way round for something that arrives on a phone.
 */

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { waitUntil } from '@vercel/functions'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { postToGhl, memberOptedIntoSms } from '@/lib/ghl-webhook'

/** The two rungs, in days without a stamp. */
const STAGE_30 = 30
const STAGE_60 = 60

/** How long the one-time coupon lives. */
const COUPON_DAYS  = 14
const COUPON_VALUE = 2

/** Most members handled in one run. A rail on runtime and on the SMS bill,
 *  not a business rule — the rest are picked up tomorrow. */
const MAX_PER_RUN = 200

const DAY_MS = 24 * 60 * 60 * 1000

interface Candidate {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  email: string | null
  created_at: string
  sms_opt_in: boolean | null
  coupon_due: boolean | null
  reactivation_stage: number | null
  reactivation_coupon_issued_at: string | null
  origin_store_id: string | null
  origin_merchant_id: string | null
}

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
    console.error('[cron/member-reactivation] CRON_SECRET is not set — refusing to run')
    return NextResponse.json({ error: 'not_configured' }, { status: 500 })
  }
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // ── 0. Paused? ───────────────────────────────────────────────────────────
  // Ahead of everything, including the expiry sweep, so a paused run leaves
  // no trace: no member touched, no coupon closed, nothing sent.
  if (process.env.REACTIVATION_CRON_ENABLED !== 'true') {
    console.log('[cron/member-reactivation] paused — REACTIVATION_CRON_ENABLED is not "true", nothing read, changed or sent')
    return NextResponse.json({ paused: true, messaged: 0, expired: 0, reason: 'cron_disabled' })
  }

  const admin = createAdminSupabaseClient()
  const now   = new Date()

  // ── 0. Close out coupons whose 14 days ran out ───────────────────────────
  // Done first so an expired coupon cannot be counted as "already holding
  // one" below, and so it stops appearing in the app and at the till.
  const { data: expired } = await admin
    .from('rewards')
    .update({ status: 'expired' })
    .eq('status', 'earned')
    .not('expires_at', 'is', null)
    .lt('expires_at', now.toISOString())
    .select('member_id')

  const expiredCount = (expired ?? []).length
  if (expiredCount > 0) {
    // A member whose only coupon just expired has nothing waiting any more.
    const touched = [...new Set((expired ?? []).map(r => r.member_id).filter(Boolean))] as string[]
    for (const memberId of touched) {
      const { count } = await admin
        .from('rewards')
        .select('*', { count: 'exact', head: true })
        .eq('member_id', memberId)
        .eq('status', 'earned')
      if ((count ?? 0) === 0) {
        await admin.from('members').update({ coupon_due: false }).eq('id', memberId)
      }
    }
    console.log(`[cron/member-reactivation] expired ${expiredCount} coupon(s)`)
  }

  const webhookUrl = process.env.GHL_MEMBER_REACTIVATION_WEBHOOK_URL
  if (!webhookUrl) {
    // Nothing is claimed: a member marked as messaged by a run with nowhere to
    // send would sit out the rest of the ladder in silence.
    console.warn('[cron/member-reactivation] GHL_MEMBER_REACTIVATION_WEBHOOK_URL is not set — nothing sent')
    return NextResponse.json({ messaged: 0, expired: expiredCount, reason: 'webhook_not_configured' })
  }

  // ── 1. Everyone who could be due ─────────────────────────────────────────
  const { data: pool, error: poolError } = await admin
    .from('members')
    .select('id, first_name, last_name, phone, email, created_at, sms_opt_in, coupon_due, ' +
            'reactivation_stage, reactivation_coupon_issued_at, origin_store_id, origin_merchant_id')
    .eq('status', 'active')
    .eq('is_blacklisted', false)
    .eq('sms_opt_in', true)
    // NOT filtered on reactivation_stage. A member sitting at stage 60 gets no
    // further messages, but they still have to be looked at: if they came back
    // and earned a stamp, this is where the ladder is reset so they can climb
    // it again. Filtering them out of the query left them stuck at 60 for
    // good, and a member who returned could never be messaged again.
    .lt('created_at', new Date(now.getTime() - STAGE_30 * DAY_MS).toISOString())

  if (poolError) {
    console.error('[cron/member-reactivation] member query failed:', poolError)
    return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  }

  const candidates = (pool ?? []) as unknown as Candidate[]
  if (candidates.length === 0) {
    return NextResponse.json({ messaged: 0, expired: expiredCount, considered: 0 })
  }

  // ── 2. When each of them last earned a stamp ─────────────────────────────
  // One read for the whole pool. Any activity counts — a referral bonus means
  // the member did something.
  const { data: events, error: eventError } = await admin
    .from('activity_events')
    .select('member_id, occurred_at')
    .in('member_id', candidates.map(c => c.id))
    .order('occurred_at', { ascending: false })

  if (eventError) {
    console.error('[cron/member-reactivation] activity query failed:', eventError)
    return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  }

  const lastStamp = new Map<string, number>()
  for (const e of (events ?? [])) {
    const id = e.member_id as string
    if (!lastStamp.has(id)) lastStamp.set(id, new Date(e.occurred_at as string).getTime())
  }

  // ── 3. Work out each member's rung ───────────────────────────────────────
  interface Due { member: Candidate; stage: 30 | 60; quietDays: number }
  const due: Due[] = []
  const returned: string[] = []

  for (const m of candidates) {
    // Never stamped? Count from the day they joined — someone who signed up
    // and never came back is exactly who this is for.
    const since = lastStamp.get(m.id) ?? new Date(m.created_at).getTime()
    const quietDays = Math.floor((now.getTime() - since) / DAY_MS)
    const stage = m.reactivation_stage ?? 0

    // THEY CAME BACK. A stamp after the last rung was sent resets the ladder,
    // so going quiet again starts at day 30 rather than resuming at 60.
    if (quietDays < STAGE_30) {
      if (stage !== 0) returned.push(m.id)
      continue
    }

    if (quietDays >= STAGE_60 && stage < STAGE_60)      due.push({ member: m, stage: 60, quietDays })
    else if (quietDays >= STAGE_30 && stage < STAGE_30) due.push({ member: m, stage: 30, quietDays })
  }

  if (returned.length > 0) {
    await admin.from('members')
      .update({ reactivation_stage: 0, reactivation_stage_at: null })
      .in('id', returned)
    console.log(`[cron/member-reactivation] reset ${returned.length} member(s) who came back`)
  }

  const batch = due.slice(0, MAX_PER_RUN)
  if (batch.length === 0) {
    return NextResponse.json({ messaged: 0, expired: expiredCount, considered: candidates.length, reset: returned.length })
  }

  // ── 4. Claim, add the coupon, then send ──────────────────────────────────
  const nowIso = now.toISOString()
  interface Claimed { member: Candidate; stage: 30 | 60; couponAdded: boolean }
  const claimed: Claimed[] = []

  for (const d of batch) {
    const m = d.member
    const fromStage = m.reactivation_stage ?? 0

    const { data: won, error: claimError } = await admin
      .from('members')
      .update({ reactivation_stage: d.stage, reactivation_stage_at: nowIso })
      .eq('id', m.id)
      .eq('reactivation_stage', fromStage)       // compare-and-set
      .select('id')

    if (claimError) {
      console.error(`[cron/member-reactivation] claim failed for ${m.id}:`, claimError)
      continue
    }
    if (!won || won.length === 0) continue

    let couponAdded = false

    // The coupon rides on the day-60 message only, once per member ever, and
    // never on top of one they have not spent.
    if (d.stage === 60 && !m.reactivation_coupon_issued_at) {
      const { count: openCoupons } = await admin
        .from('rewards')
        .select('*', { count: 'exact', head: true })
        .eq('member_id', m.id)
        .eq('status', 'earned')

      if ((openCoupons ?? 0) > 0) {
        console.log(`[cron/member-reactivation] ${m.id} holds an unused coupon — message only`)
      } else if (!m.origin_merchant_id || !m.origin_store_id) {
        // Nobody to bill. The message still goes; the coupon does not, and
        // the member keeps their one-per-lifetime entitlement for later.
        console.warn(`[cron/member-reactivation] ${m.id} has no origin store — coupon skipped`)
      } else {
        const expiresAt = new Date(now.getTime() + COUPON_DAYS * DAY_MS).toISOString()
        const { error: rewardError } = await admin.from('rewards').insert({
          member_id:             m.id,
          merchant_id:           m.origin_merchant_id,
          store_id:              m.origin_store_id,
          issued_at_location_id: m.origin_store_id,
          coupon_value:          COUPON_VALUE,
          reward_type:           'reactivation',
          status:                'earned',
          earned_at:             nowIso,
          expires_at:            expiresAt,
          // Funded by the origin store, and settled exactly as a 20-stamp
          // coupon is — see lib/coupon-settlement.
          funding_store_id:      m.origin_store_id,
          funding_merchant_id:   m.origin_merchant_id,
        })

        if (rewardError) {
          console.error(`[cron/member-reactivation] coupon insert failed for ${m.id}:`, rewardError)
        } else {
          await admin.from('members')
            .update({ coupon_due: true, reactivation_coupon_issued_at: nowIso })
            .eq('id', m.id)
          couponAdded = true
        }
      }
    }

    claimed.push({ member: m, stage: d.stage, couponAdded })
  }

  const couponsAdded = claimed.filter(c => c.couponAdded).length
  console.log(
    `[cron/member-reactivation] considered ${candidates.length}, due ${due.length}, ` +
    `messaging ${claimed.length} (day 30: ${claimed.filter(c => c.stage === 30).length}, ` +
    `day 60: ${claimed.filter(c => c.stage === 60).length}), coupons added ${couponsAdded}`,
  )

  waitUntil((async () => {
    let delivered = 0
    for (const c of claimed) {
      if (!memberOptedIntoSms(c.member, 'cron/member-reactivation')) continue
      const ok = await postToGhl(webhookUrl, {
        phone:              c.member.phone,
        firstName:          c.member.first_name,
        lastName:           c.member.last_name,
        email:              c.member.email,
        reactivation_stage: c.stage === 30 ? 'day_30' : 'day_60',
        coupon_added:       c.couponAdded,
        coupon_value:       c.couponAdded ? COUPON_VALUE : 0,
        coupon_expires_in_days: c.couponAdded ? COUPON_DAYS : 0,
      }, 'cron/member-reactivation')
      if (ok) delivered++
    }
    console.log(`[cron/member-reactivation] delivered ${delivered} of ${claimed.length}`)
  })())

  return NextResponse.json({
    messaged:     claimed.length,
    day30:        claimed.filter(c => c.stage === 30).length,
    day60:        claimed.filter(c => c.stage === 60).length,
    couponsAdded,
    expired:      expiredCount,
    reset:        returned.length,
    considered:   candidates.length,
  })
}
