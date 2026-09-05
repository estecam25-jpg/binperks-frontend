/**
 * /join/[code] — the one short link, handling both shapes.
 *
 * app.binperks.com/join/X7K2MP  → a member's 6-character referral short code
 * app.binperks.com/join/FL-Tampa-EstaBins → a store key, printed on QR codes
 *
 * They are told apart by SHAPE, not by a lookup: a referral code is exactly 6
 * characters from a fixed alphabet with no hyphens, so anything else is a store
 * key. Both end up in the same place — the BinPerks-branded join funnel at
 * /member/join/[storeKey] — with the store carried only as silent Origin Store
 * attribution.
 *
 * A REFERRAL RESOLVES TO ITS REFERRER'S ORIGIN STORE, so the new member is
 * attributed to the store that earned the referral and the commission stays
 * with it.
 *
 * WHY NOT THE HOME PAGE: this used to redirect to `/?store=…&merchant=…`, which
 * dropped the visitor on the generic home screen instead of the join funnel the
 * link promised. The home page is still the right destination for a referrer
 * with no usable store (see below) — it accepts ?referrer= and handles the
 * store-less signup — but it is the fallback, not the default.
 *
 * OLD LINKS STILL WORK. /member/join/[storeKey]?ref=… is untouched.
 *
 * Server component — resolves and redirects before anything paints, so the
 * member never sees an intermediate screen.
 */

import { redirect } from 'next/navigation'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { normalizeReferralCode, isValidReferralCode } from '@/lib/referral-code'
import { toOne } from '@/lib/supabase-relations'
import { isBinPerksHouseStore } from '@/lib/binperks-origin'

export const dynamic = 'force-dynamic'

interface OriginStore {
  canonical_key: string
  is_active: boolean | null
}

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

  // The origin store is embedded rather than fetched separately: its
  // canonical_key is what the funnel URL needs, and is_active decides whether
  // that funnel can render at all. A to-ONE embed comes back as an object, not
  // an array — hence toOne (see lib/supabase-relations).
  const { data: referrer } = await admin
    .from('members')
    .select(`
      id,
      status,
      is_blacklisted,
      origin_store_id,
      stores:origin_store_id ( canonical_key, is_active )
    `)
    .eq('referral_short_code', code)
    .maybeSingle()

  // Unknown, deactivated or blacklisted referrer: still let the visitor join,
  // just without attribution. Turning a stale link into a dead end would cost a
  // real signup over a bookkeeping detail.
  if (!referrer || referrer.status !== 'active' || referrer.is_blacklisted) {
    redirect('/')
  }

  const originStore = toOne<OriginStore>(referrer.stores as OriginStore | OriginStore[] | null)

  // Two cases send the visitor to the home page instead of a store funnel:
  //
  //   the referrer's origin is the BinPerks house store, which is is_active
  //   false by design and has no public funnel to render, and
  //
  //   the origin store has since been deactivated, where /member/join/[storeKey]
  //   would render "Store not found" and lose the signup outright.
  //
  // Both still carry ?referrer=, so the referral is credited either way — the
  // home page reads that parameter and passes it to /api/join/create.
  const usableStore =
    originStore?.canonical_key &&
    originStore.is_active === true &&
    !isBinPerksHouseStore(referrer.origin_store_id)

  if (!usableStore) {
    redirect(`/?referrer=${encodeURIComponent(referrer.id)}`)
  }

  redirect(
    `/member/join/${encodeURIComponent(originStore!.canonical_key)}` +
    `?referrer=${encodeURIComponent(referrer.id)}`,
  )
}
