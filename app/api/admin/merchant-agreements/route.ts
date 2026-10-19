/**
 * GET /api/admin/merchant-agreements          every acceptance on record
 * GET /api/admin/merchant-agreements?merchantId=…&download=1   that copy, as a PDF
 *
 * What the Merchants tab shows under each merchant, and where the Download PDF
 * button points.
 *
 * MERCHANTS WITH NO ROW ARE NOT A PROBLEM. Everyone who joined before in-app
 * acceptance existed signed another way; the tab says so rather than implying
 * something is missing, and nothing here touches their data.
 *
 * Auth: admin allow-list. The bucket is private and the file is streamed
 * through this route, so the check is on the caller, not on knowing the path.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin-auth'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

const BUCKET = 'merchant-agreements'

export async function GET(req: NextRequest) {
  if (!await verifyAdmin()) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const admin = createAdminSupabaseClient()
  const merchantId = req.nextUrl.searchParams.get('merchantId')
  const download   = req.nextUrl.searchParams.get('download') === '1'

  // ── One merchant's PDF ───────────────────────────────────────────────────
  if (merchantId && download) {
    const { data: a } = await admin
      .from('merchant_agreement_acceptances')
      .select('agreement_version, pdf_path')
      .eq('merchant_id', merchantId)
      .order('accepted_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!a?.pdf_path) return NextResponse.json({ error: 'no_copy' }, { status: 404 })

    const { data: file, error } = await admin.storage
      .from(BUCKET).download(a.pdf_path as string)
    if (error || !file) {
      console.error('[admin/merchant-agreements] download failed:', error)
      return NextResponse.json({ error: 'download_failed' }, { status: 500 })
    }

    return new NextResponse(new Uint8Array(await file.arrayBuffer()), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition':
          `attachment; filename="BinPerks-Merchant-Agreement-${a.agreement_version}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  // ── The list ─────────────────────────────────────────────────────────────
  const { data, error } = await admin
    .from('merchant_agreement_acceptances')
    .select('merchant_id, agreement_version, accepted_at, signer_name, signer_title, pdf_path')
    .order('accepted_at', { ascending: false })

  if (error) {
    console.error('[admin/merchant-agreements] list failed:', error)
    return NextResponse.json({ error: 'load_failed' }, { status: 500 })
  }

  // Keyed by merchant, newest first, so the tab can look one up directly.
  const byMerchant: Record<string, {
    version: string; acceptedAt: string; signerName: string
    signerTitle: string; hasPdf: boolean
  }> = {}
  for (const a of data ?? []) {
    const id = a.merchant_id as string
    if (byMerchant[id]) continue
    byMerchant[id] = {
      version:     a.agreement_version as string,
      acceptedAt:  a.accepted_at as string,
      signerName:  a.signer_name as string,
      signerTitle: a.signer_title as string,
      hasPdf:      !!a.pdf_path,
    }
  }

  return NextResponse.json({ acceptances: byMerchant })
}
