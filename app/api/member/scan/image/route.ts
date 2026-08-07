/**
 * GET /api/member/scan/image?q=<product name>
 *
 * Looks up a stock photo for an identified product via DuckDuckGo's Instant
 * Answer API. No API key, no cost. Server-side so the browser never talks to
 * DuckDuckGo directly (no CORS, and the member's IP is not exposed to it).
 *
 * WHAT THIS ENDPOINT CAN ACTUALLY RETURN — measured, not assumed:
 *
 * api.duckduckgo.com is the *Instant Answer* API. It is not image search, and
 * `iax=images&ia=images` are inert here: the JSON is byte-identical with and
 * without them. They are kept only because the URL is specified that way; do
 * not remove them expecting a behavior change, and do not add them elsewhere
 * expecting image results.
 *
 * The consequence is coverage. An Instant Answer exists only for topics with
 * an encyclopedia-style entry, so a brand or product line resolves and a
 * specific SKU usually does not:
 *
 *   "Nike Air Force 1"              -> Image: "/i/265cc954a9725e56.jpg"
 *   "Stanley Quencher Tumbler 40oz" -> Image: ""   (no instant answer at all)
 *   "Lego Millennium Falcon"        -> Image: ""   (no instant answer at all)
 *
 * Most bin-store merchandise looks like the second and third cases, so
 * `{ imageUrl: null }` is the expected common outcome rather than a fault.
 * The UI renders nothing in that case.
 *
 * The `Image` field is a RELATIVE path. It must be resolved against
 * https://duckduckgo.com — returning it raw would make the browser resolve it
 * against app.binperks.com and 404 on every single lookup.
 *
 * Responses:
 *   200 { imageUrl: string | null }   — null whenever nothing usable was found
 *   401 { error: 'not_authenticated' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { sanitizeImageUrl } from '@/lib/scanner-image-url'

/** Relative `Image` paths resolve against this origin. */
const DDG_ORIGIN = 'https://duckduckgo.com'

/** Give up rather than hold a serverless invocation open on a slow upstream.
 *  A missing stock photo is a non-event; a hung request is not. */
const UPSTREAM_TIMEOUT_MS = 4000

/** Product names are short. Anything longer is junk or an abuse attempt. */
const MAX_QUERY_LENGTH = 200

/** Shape of the fields we read off the Instant Answer response. */
interface DuckDuckGoAnswer {
  Image?: unknown
  RelatedTopics?: Array<{ Icon?: { URL?: unknown } }>
}

/** Absolute-ise a DuckDuckGo image path, then run it through the same
 *  validation used everywhere else before it can reach an <img src>. */
function resolveDdgImage(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const value = raw.trim()
  if (!value) return ''
  return sanitizeImageUrl(value.startsWith('/') ? `${DDG_ORIGIN}${value}` : value)
}

export async function GET(req: NextRequest) {
  // Member-only. Without this the route is an open outbound-request proxy that
  // anyone could drive against DuckDuckGo using our servers and our IP.
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (!q || q.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ imageUrl: null })
  }

  // `t` is DuckDuckGo's documented application-identifier courtesy parameter.
  const url =
    `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}` +
    `&iax=images&ia=images&format=json&no_html=1&t=binperks`

  let answer: DuckDuckGoAnswer
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return NextResponse.json({ imageUrl: null })
    answer = await res.json() as DuckDuckGoAnswer
  } catch {
    // Timeout, network error, or non-JSON body. A stock photo is decoration —
    // never surface this as a scan failure.
    return NextResponse.json({ imageUrl: null })
  }

  // Primary field. In practice this is the only one that is ever populated.
  let imageUrl = resolveDdgImage(answer.Image)

  // Fallback: the first related topic carrying an icon. Observed empty on
  // every query tested, but it costs nothing and is the only other image
  // field the payload has.
  if (!imageUrl && Array.isArray(answer.RelatedTopics)) {
    for (const topic of answer.RelatedTopics) {
      const candidate = resolveDdgImage(topic?.Icon?.URL)
      if (candidate) { imageUrl = candidate; break }
    }
  }

  return NextResponse.json(
    { imageUrl: imageUrl || null },
    {
      // The same product name yields the same answer for a long time, and
      // several members scanning the same item is the normal case.
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
    }
  )
}
