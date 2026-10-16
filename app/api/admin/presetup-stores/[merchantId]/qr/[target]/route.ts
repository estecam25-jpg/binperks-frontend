/**
 * GET /api/admin/presetup-stores/[merchantId]/qr/[target] — the bare QR PNG
 *
 * target 'register' → /join/<key>/in-store_at-the_register, which awards the
 *                     day's visit stamp on signup
 * target 'social'   → /join/<key>, which awards nothing
 *
 * The same two URLs the printed materials carry, from the same joinUrlFor, so
 * a QR downloaded here and a QR on the table tent cannot drift apart. This is
 * for the cases the six materials do not cover — a window vinyl cut locally, a
 * code dropped into a flyer someone else is designing.
 *
 * 1000px: the largest the QR service returns, and enough for a letter-size
 * print at 300dpi with room to spare.
 *
 * Auth: admin allow-list.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin-auth'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { joinUrlFor, fetchQr } from '@/lib/marketing-render'
import { PRESETUP } from '@/lib/presetup'
import type { QrTarget } from '@/lib/marketing-materials'

const TARGETS: QrTarget[] = ['register', 'social']

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ merchantId: string; target: string }> },
) {
  if (!await verifyAdmin()) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { merchantId, target } = await params
  if (!TARGETS.includes(target as QrTarget)) {
    return NextResponse.json({ error: 'unknown_target' }, { status: 404 })
  }

  const admin = createAdminSupabaseClient()
  const { data: merchant } = await admin
    .from('merchants').select('id, billing_status').eq('id', merchantId).maybeSingle()
  if (!merchant || merchant.billing_status !== PRESETUP) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const { data: store } = await admin
    .from('stores').select('canonical_key').eq('merchant_id', merchantId)
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!store) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const storeKey = store.canonical_key as string

  try {
    const png = await fetchQr(joinUrlFor(target as QrTarget, storeKey), 1000)
    return new NextResponse(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="binperks-qr-${target}-${storeKey}.png"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error(`[admin/presetup qr/${target}] fetch failed:`, err)
    return NextResponse.json({ error: 'qr_failed' }, { status: 502 })
  }
}
