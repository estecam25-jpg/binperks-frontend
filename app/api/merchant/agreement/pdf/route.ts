/**
 * GET /api/merchant/agreement/pdf — the merchant's own accepted copy
 *
 * The bucket is private, so the file is streamed through here rather than
 * linked: that way the check is "does the caller own this merchant", not
 * "does the caller know the URL".
 *
 * Only a merchant's own copy. The admin route is separate and checks the
 * admin allow-list instead.
 */

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { findMerchantForRequest } from '@/lib/merchant-auth'

const BUCKET = 'merchant-agreements'

export async function GET() {
  const merchant = await findMerchantForRequest<{ id: string }>('id')
  if (!merchant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminSupabaseClient()
  const { data: acceptance } = await admin
    .from('merchant_agreement_acceptances')
    .select('agreement_version, pdf_path')
    .eq('merchant_id', merchant.id)
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!acceptance?.pdf_path) {
    return NextResponse.json({ error: 'no_copy' }, { status: 404 })
  }

  const { data: file, error } = await admin.storage
    .from(BUCKET).download(acceptance.pdf_path as string)
  if (error || !file) {
    console.error('[merchant/agreement/pdf] download failed:', error)
    return NextResponse.json({ error: 'download_failed' }, { status: 500 })
  }

  return new NextResponse(new Uint8Array(await file.arrayBuffer()), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition':
        `attachment; filename="BinPerks-Merchant-Agreement-${acceptance.agreement_version}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
