/**
 * POST /api/member/product-image
 *
 * Asks the Product Image Service for a representative image of a product the
 * member just scanned. Called by the scanner AFTER the result is on screen —
 * /api/member/scan never waits on this.
 *
 * THE RETURNED URL IS TRANSIENT. It is passed to the browser for one render
 * and is never stored, here or anywhere downstream. See
 * lib/providers/brave-images for the licence constraint behind that.
 *
 * OWNERSHIP CHECK: scanEventId is supplied by the client, so it is verified
 * against the authenticated member before any work happens. Without that,
 * anyone with a session could attach catalog and log rows to another member's
 * scans.
 *
 * Request body:
 *   { scanEventId, identifiedProduct, confidence,
 *     upc?, brand?, modelNumber?, identifiedCategory? }
 *
 * Responses:
 *   200 { imageUrl, catalogHit, resolution }
 *   400 { error: 'invalid_request' }
 *   401 { error: 'not_authenticated' }
 *   404 { error: 'member_not_found' | 'scan_not_found' }
 *   500 { error: 'image_lookup_failed' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { getProductImage } from '@/lib/product-image-service'

/** Generous cap — these are model-written strings, not member input, but an
 *  unbounded value would still reach the catalog and the search query. */
const MAX_FIELD_LENGTH = 500

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Body {
  scanEventId?: unknown
  identifiedProduct?: unknown
  confidence?: unknown
  upc?: unknown
  brand?: unknown
  modelNumber?: unknown
  identifiedCategory?: unknown
}

/** Trimmed string within the length cap, or null. Anything else — a number, an
 *  object, an over-long value — is dropped rather than coerced. */
function optionalField(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const s = value.trim()
  if (!s || s.length > MAX_FIELD_LENGTH) return null
  return s
}

export async function POST(req: NextRequest) {
  // Server client for identity only; all table access uses the admin client
  // (CLAUDE.md CRITICAL RLS RULE).
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const body = await req.json().catch(() => null) as Body | null
  if (!body) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const scanEventId = typeof body.scanEventId === 'string' ? body.scanEventId.trim() : ''
  if (!UUID_RE.test(scanEventId)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const identifiedProduct = optionalField(body.identifiedProduct)
  if (!identifiedProduct) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  // Must be a real number in 0–1. The service compares it against a threshold,
  // so NaN would silently pass every check.
  const confidence = Number(body.confidence)
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()

  const { data: member } = await admin
    .from('members')
    .select('id, is_blacklisted')
    .eq('auth_user_id', user.id)
    .single()

  if (!member) return NextResponse.json({ error: 'member_not_found' }, { status: 404 })
  if (member.is_blacklisted) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  // The scan must exist AND belong to this member. Matching on both columns
  // means someone else's scan id reads as not-found rather than as a
  // permission error, which is also the right amount to disclose.
  const { data: scan } = await admin
    .from('scanner_events')
    .select('id')
    .eq('id', scanEventId)
    .eq('member_id', member.id)
    .maybeSingle()

  if (!scan) return NextResponse.json({ error: 'scan_not_found' }, { status: 404 })

  try {
    const result = await getProductImage({
      scannerEventId:     scanEventId,
      identifiedProduct,
      identifiedCategory: optionalField(body.identifiedCategory),
      confidence,
      upc:                optionalField(body.upc),
      brand:              optionalField(body.brand),
      modelNumber:        optionalField(body.modelNumber),
    })

    // imageUrl is transient — display only, never stored.
    return NextResponse.json(result)
  } catch (err) {
    console.error('[member/product-image] lookup failed:', err)
    return NextResponse.json({ error: 'image_lookup_failed' }, { status: 500 })
  }
}
