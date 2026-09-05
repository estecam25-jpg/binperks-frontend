/**
 * /member/join/[storeKey] — Member join landing page.
 *
 * Server component: resolves the store key at request time.
 *
 * NO STORE BRANDING IS FETCHED OR PASSED. The store record exists here to
 * confirm the key is real and to hand JoinLanding the ids the funnel needs —
 * origin attribution and the merchant for the VIP checkout. Brand colour, brand
 * name, logo and font are deliberately not selected: a member joining through a
 * store is joining BinPerks.
 *
 * Also resolves the referrer server-side so the referral banner is present in
 * the initial HTML. TWO PARAMETER SHAPES arrive here:
 *
 *   ?ref=<referral_code>   legacy 8-character code, links already in the wild
 *   ?referrer=<member id>  the short /join/XXXXXX link, resolved by app/join/[code]
 *
 * Both are optional and neither affects branding — this page is BinPerks either
 * way. The store in the URL is silent Origin Store attribution, nothing more.
 *
 * Interactive parts (stamp animation, join button, referral banner) live in
 * the JoinLanding client component which also caches data in sessionStorage
 * for the child funnel pages (signup → vip → thankyou).
 */

import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import JoinLanding from './JoinLanding'

interface StoreRow {
  id: string
  canonical_key: string
  merchant_id: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function JoinLandingPage({
  params,
  searchParams,
}: {
  params:       Promise<{ storeKey: string }>
  searchParams: Promise<{ ref?: string; referrer?: string }>
}) {
  const { storeKey }  = await params
  const { ref: code, referrer: referrerId } = await searchParams

  const admin = createAdminSupabaseClient()

  // Fetch store branding server-side — same pattern as /member/login/[storeKey]
  const { data: storeData } = await admin
    .from('stores')
    .select('id, canonical_key, merchant_id')
    .eq('canonical_key', storeKey)
    .eq('is_active', true)
    .maybeSingle()
  const store = storeData as any

  // Store not found
  if (!store) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#F5F5F8] px-6">
        <div className="flex flex-col items-center gap-4 text-center max-w-xs">
          <span className="text-5xl">🤔</span>
          <h1 className="font-['Coiny'] text-2xl text-[#1A1A2E]">Store not found</h1>
          <p className="text-[14px] text-[#8E8EA8] font-medium font-['Montserrat'] leading-relaxed">
            This link doesn't match an active BinPerks store. Check with the store and try again.
          </p>
          <p className="text-[11px] text-[#8E8EA8] font-medium">
            Questions? <a href="mailto:support@binperks.com" className="underline">support@binperks.com</a>
          </p>
        </div>
      </div>
    )
  }

  // Resolve the referrer server-side if either parameter is present.
  let referrer: { code: string; referrerMemberId: string; referrerFirstName: string } | null = null

  // ?referrer=<member id> — from the short link. Deliberately NOT filtered by
  // merchant: app/join/[code] already sent the visitor to this referrer's own
  // Origin Store, so a merchant filter here could only ever reject a referral
  // that is correct by construction.
  if (referrerId && UUID_RE.test(referrerId)) {
    const { data: refMember } = await admin
      .from('members')
      .select('id, first_name')
      .eq('id', referrerId)
      .eq('status', 'active')
      .eq('is_blacklisted', false)
      .maybeSingle()

    if (refMember) {
      referrer = {
        code:              refMember.id,
        referrerMemberId:  refMember.id,
        referrerFirstName: refMember.first_name,
      }
    }
  }

  // ?ref=<referral_code> — the legacy form, unchanged.
  if (!referrer && code) {
    const { data: refMember } = await admin
      .from('members')
      .select('id, first_name')
      .eq('referral_code', code)
      .eq('merchant_id', store.merchant_id)
      .maybeSingle()

    if (refMember) {
      referrer = {
        code,
        referrerMemberId:  refMember.id,
        referrerFirstName: refMember.first_name,
      }
    }
  }

  return (
    
    <JoinLanding
      storeKey={storeKey}
      storeId={store.id}
      merchantId={store.merchant_id}
      referrer={referrer}
    />
  )
}
// cache bust
