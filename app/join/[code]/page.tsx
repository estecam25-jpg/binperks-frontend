/**
 * /join/[code] — short member referral links.
 *
 * app.binperks.com/join/X7K2MP, replacing the old
 * /member/join/FL-Tampa-EstaBins?ref=NR9HR3NF form. Short enough to read aloud,
 * text, or print, and it does not leak the referrer's store into the URL.
 *
 * Resolves the referrer, then hands the signup form their Origin Store so the
 * new member is attributed to the same store — a referral keeps the commission
 * with the store that earned it. A referrer with a BinPerks house origin passes
 * that along, and no merchant commission accrues.
 *
 * OLD LINKS STILL WORK. This is an addition: /member/join/[storeKey]?ref=… is
 * untouched and still resolves through its own funnel.
 *
 * Server component — resolves and redirects before anything paints, so the
 * member never sees an intermediate screen.
 */

import { redirect } from 'next/navigation'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { normalizeReferralCode, isValidReferralCode } from '@/lib/referral-code'

export const dynamic = 'force-dynamic'

export default async function JoinByCodePage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code: raw } = await params
  const code = normalizeReferralCode(raw)

  // Anything that is not a 6-character referral code is treated as a STORE KEY.
  // /join/FL-Tampa-EstaBins is printed on QR codes already in the wild; it used
  // to be handled by a redirect in next.config.ts, which had to be removed
  // because it fired before this route and swallowed every short code.
  if (!isValidReferralCode(code)) {
    redirect(`/member/join/${encodeURIComponent(raw)}`)
  }

  const admin = createAdminSupabaseClient()

  const { data: referrer } = await admin
    .from('members')
    .select('id, origin_store_id, origin_merchant_id, status, is_blacklisted')
    .eq('referral_short_code', code)
    .maybeSingle()

  // Unknown, deactivated or blacklisted referrer: still let the visitor join,
  // just without attribution. Turning a stale link into a dead end would cost a
  // real signup over a bookkeeping detail.
  if (!referrer || referrer.status !== 'active' || referrer.is_blacklisted) {
    redirect('/')
  }

  const q = new URLSearchParams()
  if (referrer.origin_store_id)    q.set('store', referrer.origin_store_id)
  if (referrer.origin_merchant_id) q.set('merchant', referrer.origin_merchant_id)
  q.set('referrer', referrer.id)

  redirect(`/?${q.toString()}`)
}
