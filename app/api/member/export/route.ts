/**
 * GET /api/member/export — RETIRED
 *
 * Member self-serve data export has been removed. BinPerks owns all member
 * data (CLAUDE.md CORE RULES 16), and the Privacy Policy routes data-rights
 * requests through support@binperks.com rather than a download button, so
 * removing this does not contradict anything published to members.
 *
 * The route is kept as an explicit 403 rather than deleted so that a stale
 * client, a bookmark, or a cached page gets a clear refusal instead of a 404
 * that reads like a bug. Delete it once nothing is calling it.
 *
 * Not to be confused with /api/merchant/export, which is a merchant
 * downloading their own store's aggregate data and is unaffected.
 *
 * Responses:
 *   403 { error: 'export_disabled', message: string }
 */

import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json(
    {
      error: 'export_disabled',
      message:
        'Member data export is not available. For questions about your data, contact support@binperks.com.',
    },
    { status: 403, headers: { 'Cache-Control': 'no-store' } }
  )
}
