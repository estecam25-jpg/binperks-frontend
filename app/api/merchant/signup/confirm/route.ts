/**
 * POST /api/merchant/signup/confirm   { slug }
 *
 * Called by the signing page the moment DocuSeal's embedded form reports the
 * merchant has finished. Activates them — BUT ONLY AFTER ASKING DOCUSEAL. The
 * browser's word that signing finished is a prompt to check, never the check:
 * this route looks the signer up in DocuSeal's API with BinPerks' own key and
 * activates only if DocuSeal says they have signed.
 *
 * WHY IT EXISTS alongside the DocuSeal webhook: the webhook is the only other
 * thing between a merchant who has paid and signed and their dashboard, and it
 * rejected every request DocuSeal sent until 2026-09-21. Two independent paths,
 * one idempotent activation — whichever lands first wins.
 *
 * PUBLIC — the merchant has no session yet. The DocuSeal slug is the
 * credential: it is their signing link, already a bearer token by design.
 *
 * Responses (200):
 *   { activated: true }                   live now (or already were)
 *   { activated: false, retry: true }     DocuSeal does not show it signed yet —
 *                                         it can lag the form by a moment
 *   { activated: false, retry: false }    nothing to activate from this link
 * 400 { error: 'invalid_request' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import {
  PENDING_SIGNATURE, activateAfterSignature, hasSignedWithDocuseal, sendActivationNotices,
} from '@/lib/merchant-onboarding'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { slug?: unknown } | null
  const slug = typeof body?.slug === 'string' ? body.slug.trim() : ''
  if (!slug || slug.length > 64 || !/^[A-Za-z0-9_-]+$/.test(slug)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()
  const { data: m } = await admin
    .from('merchants')
    .select('id, billing_status, docuseal_submitter_id')
    .eq('docuseal_slug', slug)
    .maybeSingle()

  if (!m) return NextResponse.json({ activated: false, retry: false })
  if (m.billing_status !== PENDING_SIGNATURE) return NextResponse.json({ activated: true })
  if (!m.docuseal_submitter_id) return NextResponse.json({ activated: false, retry: false })

  let signed = false
  try {
    signed = await hasSignedWithDocuseal(Number(m.docuseal_submitter_id))
  } catch (err) {
    console.error(`[signup/confirm] DocuSeal lookup failed for merchant ${m.id}:`, err)
    return NextResponse.json({ activated: false, retry: true })
  }
  if (!signed) return NextResponse.json({ activated: false, retry: true })

  const won = await activateAfterSignature(admin, m.id as string, 'signing_page')
  // The merchant is watching a "setting up your dashboard" message; the GHL
  // notice and support alert go out after the response, kept alive until they
  // land rather than frozen mid-flight when the handler returns.
  if (won) waitUntil(sendActivationNotices(admin, m.id as string))

  return NextResponse.json({ activated: true })
}
