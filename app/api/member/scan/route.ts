/**
 * POST /api/member/scan
 *
 * Identifies a product from a photo the member took in-store, using Claude
 * Vision, and records the attempt in scanner_events.
 *
 * Available to ALL members (Starter and VIP) — the scanner is not a VIP perk.
 *
 * A scan records INTEREST, never a purchase. Nothing here touches stamps,
 * visits, rewards, or the settlement ledger.
 *
 * Request body:
 *   { image: string, mediaType?: string }
 *     image      — base64 payload, with or without a `data:image/...;base64,` prefix
 *     mediaType  — required only when `image` has no data-URL prefix
 *
 * Stock photos are NOT requested from the model — see the SYSTEM_PROMPT note.
 * The client fetches one separately from /api/member/product-image.
 *
 * Responses:
 *   200 { scanEventId, identifiedProduct, identifiedCategory, confidence,
 *         description, estimatedRetailPrice, upc, brand, modelNumber }
 *     upc / brand / modelNumber — fingerprint hints for the Product Image
 *     Service, null whenever the model could not read them off the item. This
 *     route never calls that service; the client does, separately, so a scan
 *     is never delayed by an image lookup.
 *     estimatedRetailPrice — display text like "$24.99 – $39.99", '' if the
 *     model could not estimate. An estimate of typical retail value, NOT a
 *     price this store charges; the UI must label it accordingly.
 *   400 { error: 'missing_image' | 'unsupported_media_type' | 'image_too_large' }
 *   401 { error: 'not_authenticated' }
 *   404 { error: 'member_not_found' }
 *   429 { error: 'rate_limited' }
 *   503 { error: 'scanner_unavailable' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

// Model is pinned here so it can be changed in one place.
//
// NOTE ON THIS MODEL: Sonnet 4.6 does not support structured outputs
// (output_config.format), and assistant prefill returns a 400 — so JSON is
// requested in the system prompt and parsed defensively below. If this is ever
// moved to a model that supports structured outputs, replace extractJson()
// with a schema and drop the fence-stripping.
const SCANNER_MODEL = 'claude-sonnet-4-6'

// Formats the Claude vision API accepts.
const SUPPORTED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
type SupportedMediaType = typeof SUPPORTED_MEDIA_TYPES[number]

// The client downscales before upload; this is a backstop against a raw
// phone photo being posted directly. Base64 inflates bytes by ~4/3, so this
// is roughly a 2.6 MB image — comfortably under the serverless body limit.
const MAX_BASE64_LENGTH = 3_500_000

// No image URL is requested from the model. It has no web access, so any URL
// it produced was recalled rather than looked up — it usually 404'd, and when
// it did load it could show a different product. Representative images now
// come from /api/member/product-image, which performs a real lookup.
const SYSTEM_PROMPT =
  "You are a product identification assistant inside a bin store. The member has scanned an item. " +
  "Identify the product as specifically as possible. Return JSON only with these fields: " +
  "{ identified_product: string, identified_category: string, confidence: number (0-1), description: string, estimated_retail_price: string, upc: string | null, brand: string | null, model_number: string | null }. " +
  "Also estimate the average retail price for this item in USD. Add a field: estimated_retail_price " +
  "(string, e.g. '$24.99 – $39.99' or 'Typically $15–$25 at retail'). " +
  "If a barcode or UPC is visible, read it and return it as upc. " +
  "If a brand name or model number is visible on the product, return them as brand and model_number. " +
  "If not visible or not applicable, return null for these fields. " +
  "If you cannot identify the item, return { identified_product: 'Unknown item', identified_category: 'Unknown', confidence: 0, description: 'Could not identify this item.', estimated_retail_price: '', upc: null, brand: null, model_number: null }"

interface Identification {
  identified_product: string
  identified_category: string
  confidence: number
  description: string
  /** Free text, not a number — the model returns ranges like "$15–$25".
   *  Empty string when it could not estimate. */
  estimated_retail_price: string
  /** Fingerprinting hints for the Product Image Service. Null whenever the
   *  model could not read them off the item — which is the common case, since
   *  most bin merchandise is photographed without a visible barcode or plate.
   *  Never invented: a guessed UPC would key the catalog to the wrong product. */
  upc: string | null
  brand: string | null
  model_number: string | null
}

const UNIDENTIFIED: Identification = {
  identified_product: 'Unknown item',
  identified_category: 'Unknown',
  confidence: 0,
  description: 'Could not identify this item.',
  estimated_retail_price: '',
  upc: null,
  brand: null,
  model_number: null,
}


/**
 * Coerce an optional model field to a trimmed string, or null.
 *
 * The model returns these as JSON null when it cannot read them, but also
 * sometimes as the strings "null" / "N/A" / "" — all of which would poison the
 * catalog if treated as a real UPC or brand. Everything falsy or meaningless
 * collapses to null so generateProductKey falls through to the next tier.
 */
function optionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  if (!s) return null
  if (/^(null|undefined|n\/a|na|none|unknown)$/i.test(s)) return null
  return s
}

/**
 * Pull the JSON object out of a plain-text model response.
 *
 * Needed because this model can't be constrained to JSON at the API level
 * (see SCANNER_MODEL note). Handles a bare object, a ```json fenced block, and
 * an object with prose around it. Falls back to UNIDENTIFIED rather than
 * throwing — a malformed response should still record a scan.
 */
function extractJson(text: string): Identification {
  const withoutFences = text.replace(/```(?:json)?/gi, '').trim()
  const start = withoutFences.indexOf('{')
  const end = withoutFences.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return UNIDENTIFIED

  try {
    const parsed = JSON.parse(withoutFences.slice(start, end + 1)) as Partial<Identification>

    // Clamp confidence into 0–1 — ai_confidence is numeric(4,2), so a value
    // of 10 or -1 from a malformed response would overflow the column.
    const rawConfidence = Number(parsed.confidence)
    const confidence = Number.isFinite(rawConfidence)
      ? Math.min(1, Math.max(0, rawConfidence))
      : 0

    // Price stays a string exactly as the model wrote it. Coerce a stray
    // number ("24.99") to text rather than dropping it, and treat null or a
    // missing field as "no estimate" instead of the literal "null".
    const rawPrice = parsed.estimated_retail_price
    const estimatedRetailPrice =
      rawPrice === null || rawPrice === undefined ? '' : String(rawPrice).trim()

    return {
      identified_product:  String(parsed.identified_product  ?? UNIDENTIFIED.identified_product),
      identified_category: String(parsed.identified_category ?? UNIDENTIFIED.identified_category),
      confidence,
      description:         String(parsed.description ?? UNIDENTIFIED.description),
      estimated_retail_price: estimatedRetailPrice,
      upc:          optionalString(parsed.upc),
      brand:        optionalString(parsed.brand),
      model_number: optionalString(parsed.model_number),
    }
  } catch {
    return UNIDENTIFIED
  }
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[member/scan] ANTHROPIC_API_KEY not configured')
    return NextResponse.json({ error: 'scanner_unavailable' }, { status: 503 })
  }

  // Server client for identity only; all table access uses the admin client
  // below (CLAUDE.md CRITICAL RLS RULE).
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const body = await req.json().catch(() => null) as { image?: string; mediaType?: string } | null
  if (!body?.image) return NextResponse.json({ error: 'missing_image' }, { status: 400 })

  // Accept either a data URL or a bare base64 string.
  let base64 = body.image
  let mediaType = body.mediaType
  // [\s\S] rather than the `s` flag — the project's TS target predates es2018.
  const dataUrl = /^data:([^;]+);base64,([\s\S]*)$/.exec(body.image)
  if (dataUrl) {
    mediaType = dataUrl[1]
    base64 = dataUrl[2]
  }

  if (!mediaType || !SUPPORTED_MEDIA_TYPES.includes(mediaType as SupportedMediaType)) {
    return NextResponse.json({ error: 'unsupported_media_type' }, { status: 400 })
  }
  if (base64.length > MAX_BASE64_LENGTH) {
    return NextResponse.json({ error: 'image_too_large' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()

  const { data: member } = await admin
    .from('members')
    .select('id, home_store_id, is_blacklisted')
    .eq('auth_user_id', user.id)
    .single()

  if (!member) return NextResponse.json({ error: 'member_not_found' }, { status: 404 })
  if (member.is_blacklisted) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  // The image itself is never stored — only a hash of it, which is enough to
  // spot duplicate scans without retaining member photos.
  const imageHash = createHash('sha256').update(base64).digest('hex')

  // ── Identify ──────────────────────────────────────────────────────────────
  let identification: Identification
  let rawResponseText = ''

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const message = await anthropic.messages.create({
      model:      SCANNER_MODEL,
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType as SupportedMediaType, data: base64 },
          },
          { type: 'text', text: 'Identify this item.' },
        ],
      }],
    })

    // content is a discriminated union — narrow before reading .text.
    rawResponseText = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')

    identification = extractJson(rawResponseText)
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      console.error('[member/scan] rate limited by Claude API')
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`[member/scan] Claude API error ${err.status}:`, err.message)
      return NextResponse.json({ error: 'scanner_unavailable' }, { status: 503 })
    }
    console.error('[member/scan] unexpected error:', err)
    return NextResponse.json({ error: 'scanner_unavailable' }, { status: 503 })
  }

  // ── Record the scan ───────────────────────────────────────────────────────
  // store_id is the member's home store. Phase 4B adds real in-store
  // verification; for the MVP this is an attribution hint, not a claim that
  // the member was physically present.
  const { data: scanEvent, error: insertError } = await admin
    .from('scanner_events')
    .insert({
      member_id:           member.id,
      store_id:            member.home_store_id,
      scanned_at:          new Date().toISOString(),
      image_hash:          imageHash,
      ai_response:         { model: SCANNER_MODEL, raw: rawResponseText, parsed: identification },
      identified_product:  identification.identified_product,
      identified_category: identification.identified_category,
      ai_confidence:       identification.confidence,
      // Stored as null rather than '' so "no estimate" is unambiguous in SQL.
      estimated_retail_price: identification.estimated_retail_price || null,
      // representative_image_url is intentionally not written any more. The
      // column still exists and is now always null; it can be dropped once
      // this has been live long enough to be sure of a rollback.
      member_choice:       null,   // set later by /api/member/scan/choice
    })
    .select('id')
    .single()

  if (insertError || !scanEvent) {
    console.error('[member/scan] scanner_events insert failed:', insertError)
    return NextResponse.json({ error: 'scanner_unavailable' }, { status: 503 })
  }

  // The Product Image Service is deliberately NOT called here. The scan
  // returns the moment it is identified; the client asks /api/member/product-image
  // separately, so an image lookup can never delay or fail a scan.
  return NextResponse.json({
    scanEventId:          scanEvent.id,
    identifiedProduct:    identification.identified_product,
    identifiedCategory:   identification.identified_category,
    confidence:           identification.confidence,
    description:          identification.description,
    estimatedRetailPrice: identification.estimated_retail_price,
    // Fingerprint hints, forwarded so the client can pass them to the image
    // route. Not stored as columns — they already live in ai_response.parsed.
    upc:                  identification.upc,
    brand:                identification.brand,
    modelNumber:          identification.model_number,
  })
}
