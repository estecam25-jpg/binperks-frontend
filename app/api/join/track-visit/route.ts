/**
 * POST /api/join/track-visit
 *
 * Records that a store's join landing page has been visited at least once, for
 * the merchant onboarding checklist.
 *
 * PUBLIC BY NECESSITY. The join page is the one screen in the product with no
 * session at all — a prospective member has not signed up yet. It previously
 * called PATCH /api/merchant/store with joinPageVisited, which requires a
 * merchant session and so returned 401 on every real visit: the flag was only
 * ever set when a merchant happened to open their own join link while signed
 * in. The checklist item could not tick from actual traffic.
 *
 * WHAT AN ANONYMOUS CALLER CAN DO WITH THIS: set one timestamp, once, on a
 * store that already exists, and learn nothing back. It writes only when the
 * column is still null, so it cannot be used to churn the row or to probe which
 * stores have been visited — the response is the same either way. An unknown or
 * inactive store key is also indistinguishable from a successful call.
 *
 * Body: { storeKey: string }
 * Responses: 200 { ok: true } for every input, deliberately.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

/** Canonical keys are short; anything longer is not one. */
const MAX_STORE_KEY_LENGTH = 120

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { storeKey?: unknown } | null
  const storeKey = typeof body?.storeKey === 'string' ? body.storeKey.trim() : ''

  // Always 200. The caller is an anonymous page that ignores the outcome, and
  // a distinguishable failure would turn this into a store-key oracle.
  if (!storeKey || storeKey.length > MAX_STORE_KEY_LENGTH) {
    return NextResponse.json({ ok: true })
  }

  const admin = createAdminSupabaseClient()

  const { data: store } = await admin
    .from('stores')
    .select('id, join_page_visited_at')
    .eq('canonical_key', storeKey)
    .eq('is_active', true)
    .maybeSingle()

  // First visit only. Re-stamping on every page load would turn a public
  // endpoint into an unbounded write, and the checklist only cares that it
  // happened at all.
  if (store && !store.join_page_visited_at) {
    const { error } = await admin
      .from('stores')
      .update({ join_page_visited_at: new Date().toISOString() })
      .eq('id', store.id)
      .is('join_page_visited_at', null)

    if (error) console.error('[join/track-visit] update failed:', error.message)
  }

  return NextResponse.json({ ok: true })
}
