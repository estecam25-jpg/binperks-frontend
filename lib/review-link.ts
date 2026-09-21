/**
 * Tracked review links — the "leave us a review" link a member gets after a
 * cashier stamp, and how a tap on it is counted.
 *
 * SERVER ONLY — takes the service-role client.
 *
 * ── The flow ───────────────────────────────────────────────────────────────
 *   stamp → a feedback row (source 'review_request') + a short_links row that
 *           points at the store's google_review_url and at that feedback row
 *         → the member is sent https://app.binperks.com/r/<code>
 *   tap   → /r/<code> marks the feedback row clicked and redirects to Google
 *
 * The link goes through BinPerks rather than straight to Google because that
 * hop is the only moment BinPerks can see the member act on it. Google tells
 * nobody who opened a review page.
 *
 * ── Not too often ──────────────────────────────────────────────────────────
 * One request per member per store per 30 days. ANY feedback row counts — a
 * review request, or a Wow/Meh/Bad rating the member submitted — because
 * either means this member was recently asked at this store, and a regular
 * who comes in twice a week should not be asked twice a week.
 *
 * ── Expires tonight ────────────────────────────────────────────────────────
 * At midnight in the STORE's timezone, not the server's (UTC). A review is
 * about today's visit; a link tapped next week would be about something the
 * member barely remembers. The feedback row survives expiry, so an unclicked
 * request still counts as sent.
 */

import { randomInt } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { storeToday } from '@/lib/store-pricing'

type Admin = SupabaseClient

/** How long a member is left alone at a store after being asked. */
export const REVIEW_REQUEST_COOLDOWN_DAYS = 30

const DEFAULT_TIMEZONE = 'America/New_York'

/**
 * Lowercase letters and digits only. The code travels by SMS, and a link that
 * some client or carrier lowercases on the way through must still resolve —
 * so there is no case for it to lose. 36^8 is about 2.8 trillion, far past any
 * chance of guessing a live one before tonight's midnight retires it.
 */
const CODE_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
const CODE_LENGTH = 8

export function generateReviewCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return code
}

/** Only codes this module could have issued — anything else is refused before
 *  it reaches the database. */
export function isReviewCode(code: string): boolean {
  return new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(code)
}

/**
 * Where a redirect may send someone: an absolute http(s) URL, nothing else.
 *
 * The destination comes from google_review_url, which a merchant types into
 * their own Settings. The /r/ link carries the app.binperks.com name, so
 * without this a merchant could turn a BinPerks link into a redirect to
 * anywhere. Not restricted to Google hosts: merchants legitimately use g.page,
 * maps.app.goo.gl, Facebook and Yelp review pages, and those all pass.
 */
export function isSafeRedirectUrl(url: string | null | undefined): url is string {
  if (!url) return false
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

/** A valid IANA zone, or the default. An invalid zone in a store row must not
 *  make every stamp at that store fail to send its review link. */
function resolveZone(timezone: string | null | undefined): string {
  const tz = timezone || DEFAULT_TIMEZONE
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return DEFAULT_TIMEZONE
  }
}

/** How far ahead of UTC the zone's wall clock is at a given instant, in ms.
 *  Negative for the Americas. */
function zoneOffsetMs(tz: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',   // midnight as 00, never 24
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant)
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value)
  const wallAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return wallAsUtc - Math.floor(instant.getTime() / 1000) * 1000
}

/**
 * The instant it next becomes midnight at the store — the end of the store's
 * today.
 *
 * Built from the store's own calendar date (storeToday) rather than by adding
 * hours to now, so it is right on the two nights a year the clocks change: the
 * offset is taken AT the target midnight, then checked once more at the
 * instant that produced, which settles the case where the change falls in
 * between.
 */
export function nextStoreMidnight(timezone: string | null | undefined): Date {
  const tz = resolveZone(timezone)
  const [y, m, d] = storeToday(tz).isoDate.split('-').map(Number)

  // Tomorrow 00:00 on the store's wall clock, read as if it were UTC.
  const wall = Date.UTC(y, m - 1, d + 1, 0, 0, 0)

  let utc = wall - zoneOffsetMs(tz, new Date(wall))
  const settled = zoneOffsetMs(tz, new Date(utc))
  utc = wall - settled
  return new Date(utc)
}

/**
 * Whether this member was asked for a review at this store recently enough
 * that asking again would be nagging.
 *
 * On a read error it answers YES. Not asking once is harmless; asking a member
 * who was asked yesterday, because a query failed, is the thing to avoid.
 */
export async function askedRecently(admin: Admin, memberId: string, storeId: string): Promise<boolean> {
  const since = new Date(Date.now() - REVIEW_REQUEST_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { count, error } = await admin
    .from('feedback')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', memberId)
    .eq('store_id', storeId)
    .gte('submitted_at', since)
  if (error) {
    console.error('[review-link] recent-request check failed; skipping this request:', error)
    return true
  }
  return (count ?? 0) > 0
}

/**
 * Records a review request and issues its tracked link. Returns the link to
 * send, or '' if one could not be made — the caller sends its stamp message
 * either way, just without a review ask.
 *
 * The feedback row goes first so the link can point at it. If the link cannot
 * be written, that row is removed again: a request with no link was never
 * sent, and leaving it would both miscount "requests sent" and block this
 * member from being asked for another 30 days over a link they never got.
 */
export async function createReviewRequest(
  admin: Admin,
  { memberId, storeId, reviewUrl, timezone, appUrl }: {
    memberId: string
    storeId: string
    reviewUrl: string
    timezone: string | null | undefined
    appUrl: string
  },
): Promise<string> {
  const { data: feedback, error: feedbackError } = await admin
    .from('feedback')
    .insert({
      member_id:      memberId,
      store_id:       storeId,
      source:         'review_request',
      review_clicked: false,
    })
    .select('id')
    .single()

  if (feedbackError || !feedback) {
    console.error('[review-link] feedback insert failed:', feedbackError)
    return ''
  }

  const expiresAt = nextStoreMidnight(timezone).toISOString()

  // A collision on the unique code is vanishingly rare; three tries is plenty.
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateReviewCode()
    const { error } = await admin.from('short_links').insert({
      code,
      url:         reviewUrl,
      expires_at:  expiresAt,
      feedback_id: feedback.id,
    })
    if (!error) return `${appUrl.replace(/\/$/, '')}/r/${code}`
    if (error.code !== '23505') {
      console.error('[review-link] short link insert failed:', error)
      break
    }
  }

  await admin.from('feedback').delete().eq('id', feedback.id)
  return ''
}
