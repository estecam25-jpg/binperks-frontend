/**
 * GET /r/[code] — a tracked review link.
 *
 * The link a member is texted after a cashier stamp (see lib/review-link).
 * Records that they tapped it, then sends them to the store's review page.
 *
 * PUBLIC. No session: the member is arriving from a text message, probably in
 * a browser that has never signed in to BinPerks. Service-role client for the
 * reads and the write, as every public route here must.
 *
 * ONLY REVIEW LINKS. short_links also holds older rows from /api/auth/shorten
 * that have nothing to do with reviews; only a row tied to a feedback row
 * resolves here, so /r/ cannot be used to reach anything else.
 *
 * NOT FOUND OR EXPIRED → the BinPerks home page, not an error. The member
 * tapped a link from a business they visited; landing somewhere friendly is
 * better than a 404, and there is nothing useful to tell them.
 *
 * ── Counting only people ───────────────────────────────────────────────────
 * Messaging apps open every link they receive to draw a preview card —
 * iMessage does it the moment the text arrives, identifying itself as
 * facebookexternalhit / Twitterbot. Counted, every delivered text would show
 * as a tap and "review clicks" would be a count of messages sent. So those
 * fetches, and HEAD requests, still get the redirect (the preview works) but
 * are not recorded. This cannot catch every scanner a carrier might run, so
 * the number is a close estimate, not an exact one.
 *
 * FIRST TAP ONLY. review_clicked_at is when they first tapped; a second tap
 * from the same text does not move it.
 */

import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { isReviewCode, isSafeRedirectUrl } from '@/lib/review-link'

const HOME = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.binperks.com'

/** Link-preview fetchers and crawlers — not a member's tap. */
const NOT_A_PERSON =
  /bot|crawl|spider|slurp|preview|fetch|facebookexternalhit|facebot|whatsapp|telegram|discord|skype|embedly|quora link|pinterest|vkshare|google-pagerenderer|googleother|headless|curl|wget|python-requests|axios|node-fetch|go-http-client/i

function isPerson(req: NextRequest): boolean {
  if (req.method !== 'GET') return false
  const ua = req.headers.get('user-agent') ?? ''
  return ua.length > 0 && !NOT_A_PERSON.test(ua)
}

/** A redirect nothing along the way should cache — every tap has to reach
 *  this route to be counted. */
function go(url: string) {
  const res = NextResponse.redirect(url, 302)
  res.headers.set('Cache-Control', 'no-store')
  return res
}

async function handle(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params
  // Codes are issued lowercase; anything that uppercased one in transit still
  // lands. Anything that is not the shape of a code never reaches the database.
  const code = (raw ?? '').toLowerCase()
  if (!isReviewCode(code)) return go(HOME)

  const admin = createAdminSupabaseClient()
  const { data: link } = await admin
    .from('short_links')
    .select('url, expires_at, feedback_id')
    .eq('code', code)
    .not('feedback_id', 'is', null)
    .maybeSingle()

  if (!link || new Date(link.expires_at).getTime() <= Date.now()) return go(HOME)

  // Checked again here, not just when the link was made: the store's review
  // URL came from merchant input, and this is a redirect under our own name.
  if (!isSafeRedirectUrl(link.url)) {
    console.error(`[r/${code}] refusing unsafe redirect target`)
    return go(HOME)
  }

  if (isPerson(req)) {
    // Recorded after the redirect goes out, and kept alive until it lands —
    // the member is not held back from Google for a database write, and the
    // write is not lost when the function would otherwise freeze.
    waitUntil((async () => {
      const { error } = await admin
        .from('feedback')
        .update({ review_clicked: true, review_clicked_at: new Date().toISOString() })
        .eq('id', link.feedback_id)
        .eq('review_clicked', false)   // first tap only
      if (error) console.error(`[r/${code}] click not recorded:`, error)
    })())
  }

  return go(link.url)
}

export const GET = handle
// Some preview fetchers probe with HEAD first. They get the same redirect and
// are never counted — isPerson() only accepts GET.
export const HEAD = handle
