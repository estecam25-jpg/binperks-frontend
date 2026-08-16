/**
 * GET  /api/admin/announcements — every announcement sent, newest first
 * POST /api/admin/announcements — sends one
 *
 * An announcement writes one member_alerts row per targeted member and one
 * permanent binperks_announcements record. There is no edit and no delete:
 * once alerts have landed in members' apps, rewriting the record they came
 * from would make the log disagree with what people actually received.
 *
 * Auth: admin session on both verbs. Data: admin client — member_alerts and
 * binperks_announcements both have RLS on with no policies.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { verifyAdmin } from '@/lib/admin-auth'
import { postToGhl } from '@/lib/ghl-webhook'

export type AnnouncementTarget = 'all' | 'vip' | 'starter'

const MAX_TITLE = 100
const MAX_BODY = 500

/**
 * Alerts are inserted in batches. One statement carrying every member would
 * grow with the membership and eventually time out mid-send, leaving some
 * members notified and others not.
 */
const INSERT_BATCH = 100

/**
 * Ceiling on announcement SMS per send.
 *
 * Each webhook is a bounded HTTP call, but they still add up against the
 * function's own time limit. Past this the in-app alerts are all still
 * written — only the texts stop — and the shortfall is logged rather than
 * silently dropped.
 */
const MAX_SMS = 200

/** How many go out at once. Enough to be quick, small enough not to hammer GHL. */
const SMS_CONCURRENCY = 10

interface TargetMember {
  id: string
  phone: string | null
  first_name: string | null
  sms_opt_in: boolean | null
}

export async function GET() {
  const adminEmail = await verifyAdmin()
  if (!adminEmail) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const admin = createAdminSupabaseClient()

  // Counts come back with the list so the confirmation dialog can say how many
  // members a send will reach without a second round trip. They use the SAME
  // filters as the send — active, not blacklisted — so the number the admin
  // confirms is the number that will actually be written.
  const base = () => admin
    .from('members')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .eq('is_blacklisted', false)

  const [listRes, allRes, vipRes, starterRes] = await Promise.all([
    admin
      .from('binperks_announcements')
      .select('id, title, body, target, sent_by, recipient_count, created_at')
      .order('created_at', { ascending: false }),
    base(),
    base().eq('subscription_status', 'vip'),
    base().eq('subscription_status', 'free'),
  ])

  if (listRes.error) {
    console.error('[admin/announcements] GET failed:', listRes.error)
    return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  }

  return NextResponse.json({
    announcements: listRes.data ?? [],
    counts: {
      all:     allRes.count ?? 0,
      vip:     vipRes.count ?? 0,
      starter: starterRes.count ?? 0,
    },
  })
}

export async function POST(req: NextRequest) {
  const adminEmail = await verifyAdmin()
  if (!adminEmail) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null) as {
    title?: string; body?: string; target?: AnnouncementTarget
  } | null

  const title = (body?.title ?? '').trim()
  const text  = (body?.body ?? '').trim()
  const target = body?.target ?? 'all'

  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  if (!text)  return NextResponse.json({ error: 'Body is required' }, { status: 400 })
  if (title.length > MAX_TITLE) {
    return NextResponse.json({ error: `Title must be ${MAX_TITLE} characters or fewer` }, { status: 400 })
  }
  if (text.length > MAX_BODY) {
    return NextResponse.json({ error: `Body must be ${MAX_BODY} characters or fewer` }, { status: 400 })
  }
  if (!['all', 'vip', 'starter'].includes(target)) {
    return NextResponse.json({ error: 'Invalid target' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()

  // BLACKLISTED MEMBERS ARE EXCLUDED, which the target names do not say.
  // "Active" and "blacklisted" are separate flags: a blacklisted member still
  // has status 'active' but cannot use the app — /api/member/alerts refuses
  // them outright — so an alert addressed to one is unreadable by design.
  // Sending marketing to somebody who has been barred is also just wrong.
  let query = admin
    .from('members')
    .select('id, phone, first_name, sms_opt_in')
    .eq('status', 'active')
    .eq('is_blacklisted', false)

  if (target === 'vip')     query = query.eq('subscription_status', 'vip')
  if (target === 'starter') query = query.eq('subscription_status', 'free')

  const { data: members, error: memberError } = await query
  if (memberError) {
    console.error('[admin/announcements] member lookup failed:', memberError)
    return NextResponse.json({ error: 'member_lookup_failed' }, { status: 500 })
  }

  const targets = (members ?? []) as TargetMember[]
  if (targets.length === 0) {
    return NextResponse.json({ error: 'No members match that target' }, { status: 400 })
  }

  // ── Alerts ────────────────────────────────────────────────────────────────
  // Written FIRST and counted honestly: recipient_count records how many alerts
  // actually landed, not how many were aimed at. A partial send is reported as
  // partial rather than logged as a success.
  let inserted = 0
  for (let i = 0; i < targets.length; i += INSERT_BATCH) {
    const chunk = targets.slice(i, i + INSERT_BATCH)
    const { error } = await admin.from('member_alerts').insert(
      chunk.map(m => ({
        member_id:  m.id,
        alert_type: 'binperks_announcement',
        title,
        body: text,
        read: false,
      })),
    )
    if (error) {
      console.error(`[admin/announcements] alert batch ${i / INSERT_BATCH} failed:`, error)
      continue
    }
    inserted += chunk.length
  }

  if (inserted === 0) {
    return NextResponse.json({ error: 'send_failed' }, { status: 500 })
  }

  // ── Permanent record ──────────────────────────────────────────────────────
  const { error: recordError } = await admin.from('binperks_announcements').insert({
    title,
    body: text,
    target,
    sent_by: adminEmail,
    recipient_count: inserted,
  })
  if (recordError) {
    // The alerts are already out. Logged loudly rather than failing the
    // response, which would tell the admin nothing was sent when it was.
    console.error('[admin/announcements] record insert failed:', recordError)
  }

  // ── SMS (optional) ────────────────────────────────────────────────────────
  // Skipped entirely until GHL_ANNOUNCEMENT_WEBHOOK_URL is set.
  //
  // ONLY MEMBERS WHO OPTED IN TO SMS. The in-app alert goes to everyone
  // targeted, but a text is a different channel with different consent:
  // sms_opt_in is what the member agreed to at signup, and an announcement is
  // marketing. TCPA and Florida §501.059 are already flagged for counsel in
  // CLAUDE.md; ignoring the opt-out here would be the thing that matters.
  const webhook = process.env.GHL_ANNOUNCEMENT_WEBHOOK_URL
  let smsAttempted = 0

  if (webhook) {
    const reachable = targets.filter(m => m.sms_opt_in === true && !!m.phone)
    const capped = reachable.slice(0, MAX_SMS)
    if (reachable.length > capped.length) {
      console.warn(
        `[admin/announcements] SMS capped at ${MAX_SMS}; ` +
        `${reachable.length - capped.length} member(s) not texted`,
      )
    }

    for (let i = 0; i < capped.length; i += SMS_CONCURRENCY) {
      const group = capped.slice(i, i + SMS_CONCURRENCY)
      await Promise.all(group.map(m =>
        // postToGhl never throws and bounds itself at 5s.
        postToGhl(webhook, {
          phone:     m.phone,
          firstName: m.first_name ?? '',
          title,
          body: text,
        }, 'announcement'),
      ))
    }
    smsAttempted = capped.length
  }

  return NextResponse.json({
    sent: true,
    recipientCount: inserted,
    // Surfaced so an admin can see the two channels are not the same number.
    smsAttempted,
  })
}
