/**
 * GET /api/admin/scanner
 *
 * Scanner analytics for the God Mode Scanner tab. Admin-only, read-only.
 *
 * Returns headline scan counts, the split of what members did after a scan,
 * and the 20 most-scanned products.
 *
 * Responses:
 *   200 { totalScans, scansThisMonth, choices, topProducts }
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

  const [
    { count: totalScans },
    { count: scansThisMonth },
    { count: cartCount },
    { count: binsCount },
    { data: productRows, error: productErr },
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

  return NextResponse.json({
    totalScans:     total,
    scansThisMonth: scansThisMonth ?? 0,
    choices: {
      shoppingCart: { count: cart, pct: pct(cart, total) },
      backToBins:   { count: bins, pct: pct(bins, total) },
      noChoice:     { count: none, pct: pct(none, total) },
    },
    topProducts: topProducts(productRows ?? []),
  })
}
