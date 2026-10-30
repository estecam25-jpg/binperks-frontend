/**
 * POST /api/stamp/member
 *
 * Everything the stamp tool needs to know about ONE member, for a verified
 * cashier. Replaces the three queries the tablet used to run against the
 * database itself (members, visits, rewards).
 *
 * ── WHY IT MOVED OFF THE BROWSER ───────────────────────────────────────────
 * The stamp tool read those three tables with the publishable key — the one
 * that ships inside every page of the site. Cashiers have no Supabase session,
 * so Postgres saw `anon`, and the only thing that made the queries work was a
 * blanket `USING (true)` policy on each table. That policy applied to
 * everyone, not just tablets in shops: anyone who opened the page source could
 * read every member's name, phone, email and stamp count.
 *
 * So the lookup happens here, behind the cashier's PIN, and returns exactly
 * one member. There is deliberately NO way to ask this route for a list.
 *
 * ── WHAT IT WILL AND WILL NOT TELL YOU ─────────────────────────────────────
 * Lookup is by EXACT phone number, or by a member id the tablet already holds
 * from a lookup it just did. No partial match, no wildcard, no enumeration.
 * The reply carries only what the till screen prints: name, phone as dialled,
 * the three counters, subscription status, whether they have a coupon in hand
 * and what it is worth, and whether this store already stamped them today.
 * Never the email address, never another member, never anything about other
 * stores.
 *
 * A member belongs to the NETWORK, not to the store that enrolled them, so
 * the lookup is deliberately not filtered by merchant — see the note inside.
 *
 * Body: { cashierId, pin, phone }  or  { cashierId, pin, memberId }
 *
 * Responses:
 *   200 { found: true, member }
 *   200 { found: false, reason: 'not_found' | 'inactive' }
 *   400 { error: 'bad_request' }
 *   401 { error: 'invalid_cashier' }   unknown cashier, inactive, or wrong PIN
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { verifyCashier } from '@/lib/cashier-auth'
import { tierFor } from '@/lib/tiers'
import { isSpendable } from '@/lib/coupon-settlement'

const MEMBER_FIELDS =
  'id, first_name, last_name, phone, total_stamps, cycle_stamps, ' +
  'vip_progression_stamps, subscription_status, coupon_due, is_blacklisted'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as
    { cashierId?: string; pin?: string; phone?: string; memberId?: string } | null
  if (!body) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  const cashier = await verifyCashier(body.cashierId, body.pin)
  if (!cashier) return NextResponse.json({ error: 'invalid_cashier' }, { status: 401 })

  const phone    = typeof body.phone === 'string' ? body.phone.replace(/\D/g, '') : ''
  const memberId = typeof body.memberId === 'string' ? body.memberId : ''
  if (!phone && !memberId) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  const admin = createAdminSupabaseClient()

  // ── Find the one member ────────────────────────────────────────────────────
  // Phone and active status ONLY — deliberately not scoped to this merchant.
  // A BinPerks membership belongs to the network, not to the store that
  // happened to enrol the member; Origin Store decides who receives the
  // commission and nothing else. Filtering by merchant here would make every
  // member invisible to every store except their own.
  //
  // Not .single(): the uniqueness index is (phone, merchant_id), so the same
  // phone can legitimately exist under two merchants. Take the earliest
  // enrolment — the one whose Origin Store attribution is real — and log the
  // collision so the duplicate can be merged.
  let member: Record<string, unknown> | null = null

  if (memberId) {
    const { data } = await admin
      .from('members').select(MEMBER_FIELDS)
      .eq('id', memberId).eq('status', 'active').maybeSingle()
    member = data as Record<string, unknown> | null
  } else {
    const { data } = await admin
      .from('members').select(MEMBER_FIELDS)
      .eq('phone', phone).eq('status', 'active')
      .order('created_at', { ascending: true }).limit(2)
    // `as unknown as` because MEMBER_FIELDS is a concatenated string: PostgREST
    // only infers row types from a single string literal, and widens to an
    // error type otherwise.
    const rows = (data ?? []) as unknown as Record<string, unknown>[]
    if (rows.length > 1) {
      console.warn(
        `[stamp/member] phone ${phone} matches more than one active member — ` +
        'returning the earliest enrolment. These memberships need merging.',
      )
    }
    member = rows[0] ?? null
  }

  if (!member) return NextResponse.json({ found: false, reason: 'not_found' })
  if (member.is_blacklisted) return NextResponse.json({ found: false, reason: 'inactive' })

  // ── Today's visit, at THIS cashier's store ────────────────────────────────
  // cashier.storeId, not anything the tablet sent.
  const today = new Date().toISOString().split('T')[0]
  const { data: todayVisit } = await admin
    .from('visits').select('id')
    .eq('member_id', member.id as string)
    .eq('store_id', cashier.storeId)
    .eq('date', today)
    .maybeSingle()

  // ── The coupon in their hand ──────────────────────────────────────────────
  // Not the one their tier would earn: a $2 reactivation coupon is worth $2
  // however Gold the member is, and reading the tier value here would have the
  // cashier announce the wrong amount.
  const { data: openRewards } = await admin
    .from('rewards').select('id, coupon_value, status, expires_at')
    .eq('member_id', member.id as string)
    .eq('status', 'earned')
    .order('earned_at', { ascending: true })

  const nextCoupon = (openRewards ?? []).find(r =>
    isSpendable(r as { status: string; expires_at?: string | null }))

  // Tier from VIP progression, never the lifetime count — see lib/tiers.
  const tier = tierFor({
    vipProgressionStamps: Number(member.vip_progression_stamps ?? 0),
    subscriptionStatus:   member.subscription_status as string | null,
  })

  return NextResponse.json({
    found: true,
    member: {
      id:                   member.id,
      firstName:            member.first_name,
      lastName:             member.last_name,
      phone:                member.phone,
      totalStamps:          Number(member.total_stamps ?? 0),
      cycleStamps:          Number(member.cycle_stamps ?? 0),
      vipProgressionStamps: Number(member.vip_progression_stamps ?? 0),
      subscriptionStatus:   member.subscription_status,
      couponDue:            !!nextCoupon,
      couponValue:          nextCoupon ? Number(nextCoupon.coupon_value) : tier.couponValue,
      isBlacklisted:        false,
      alreadyStampedToday:  !!todayVisit,
    },
  })
}
