/**
 * GET /api/admin/scanner
 *
 * Scanner analytics for the God Mode Scanner tab. Admin-only, read-only.
 *
 * Returns headline scan counts, the split of what members did after a scan,
 * the 20 most-scanned products, and Product Image Service metrics.
 *
 * ON THE TWO RATES: catalog hit rate and image search rate are independent and
 * do NOT sum to 100%. A single scan writes CATALOG_HIT when the product was
 * already known AND a second row for the search that followed, so one scan can
 * contribute to both. Reading them as a split would be wrong.
 *
 * Responses:
 *   200 { totalScans, scansThisMonth, choices, topProducts, imageService }
 *   401 { error: 'forbidden' }
 */

import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin-auth'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { CHOICE_CART, CHOICE_BINS, pct, topProducts } from '@/lib/scanner-analytics'

export async function GET() {
  const adminEmail = await verifyAdmin()
  if (!adminEmail) return NextResponse.json({ error: 'forbidden' }, { status: 401 })

  const admin = createAdminSupabaseClient()

  // Local-month boundary, matching /api/admin/stats so the two tabs agree on
  // what "this month" means.
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  /** One counting query against image_search_log, optionally month-scoped. */
  const logCount = (method: string, sinceMonthStart = false) => {
    let q = admin.from('image_search_log')
      .select('*', { count: 'exact', head: true })
      .eq('resolution_method', method)
    if (sinceMonthStart) q = q.gte('created_at', startOfMonth.toISOString())
    return q
  }

  const [
    { count: totalScans },
    { count: scansThisMonth },
    { count: cartCount },
    { count: binsCount },
    { data: productRows, error: productErr },

    // ── Product Image Service ──
    { count: catalogSize },
    { count: catalogHits },
    { count: imageSearches },
    { count: searchFailures },
    { count: lowConfidenceSkips },
    { count: specificitySkips },
    { count: imageSearchesThisMonth },
    { count: searchFailuresThisMonth },
  ] = await Promise.all([
    admin.from('scanner_events').select('*', { count: 'exact', head: true }),
    admin.from('scanner_events').select('*', { count: 'exact', head: true })
      .gte('scanned_at', startOfMonth.toISOString()),
    admin.from('scanner_events').select('*', { count: 'exact', head: true })
      .eq('member_choice', CHOICE_CART),
    admin.from('scanner_events').select('*', { count: 'exact', head: true })
      .eq('member_choice', CHOICE_BINS),

    // Grouping happens in JS because there is no aggregate RPC for
    // scanner_events, and a .limit() here would silently produce a wrong
    // top-20 by only seeing part of the table. Projected down to the three
    // columns the grouping needs, which keeps the transfer small.
    //
    // SCALING: this reads every scan row. Fine at current volume; if the
    // scanner reaches six figures, move it to a Postgres aggregate function
    // rather than adding a limit, which would make the result incorrect.
    admin.from('scanner_events').select('identified_product, identified_category, member_choice'),

    admin.from('product_catalog').select('*', { count: 'exact', head: true }),
    logCount('CATALOG_HIT'),
    logCount('IMAGE_SEARCH'),
    logCount('SEARCH_FAILED'),
    logCount('LOW_CONFIDENCE_SKIP'),
    logCount('INSUFFICIENT_SPECIFICITY'),
    // Brave is billed per call, so the monthly figure counts attempts —
    // a failed search still consumed one.
    logCount('IMAGE_SEARCH', true),
    logCount('SEARCH_FAILED', true),
  ])

  if (productErr) {
    console.error('[admin/scanner] product query failed:', productErr)
    return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  }

  const total = totalScans ?? 0
  const cart  = cartCount ?? 0
  const bins  = binsCount ?? 0
  // Anything that is neither choice — NULL, or the reserved 'no_choice'.
  const none  = Math.max(0, total - cart - bins)

  // A Brave call is an IMAGE_SEARCH or a SEARCH_FAILED — both hit the API and
  // both are billable. Skips never reach the provider and are excluded.
  const searches = imageSearches ?? 0
  const failures = searchFailures ?? 0
  const braveCalls = searches + failures
  const braveCallsThisMonth = (imageSearchesThisMonth ?? 0) + (searchFailuresThisMonth ?? 0)

  return NextResponse.json({
    totalScans:     total,
    scansThisMonth: scansThisMonth ?? 0,
    choices: {
      shoppingCart: { count: cart, pct: pct(cart, total) },
      backToBins:   { count: bins, pct: pct(bins, total) },
      noChoice:     { count: none, pct: pct(none, total) },
    },
    topProducts: topProducts(productRows ?? []),

    // Rates are per scanner_event, so they are comparable to the headline scan
    // count. catalogHitRate and imageSearchRate are independent — see header.
    imageService: {
      catalogSize:          catalogSize ?? 0,
      catalogHit:           { count: catalogHits ?? 0, pct: pct(catalogHits ?? 0, total) },
      imageSearchRequests:  { count: braveCalls,       pct: pct(braveCalls, total) },
      lowConfidenceSkips:   { count: lowConfidenceSkips ?? 0, pct: pct(lowConfidenceSkips ?? 0, total) },
      specificitySkips:     { count: specificitySkips ?? 0,   pct: pct(specificitySkips ?? 0, total) },
      searchFailed:         failures,
      braveCallsThisMonth,
    },
  })
}
