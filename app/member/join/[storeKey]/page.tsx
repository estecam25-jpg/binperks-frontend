/**
 * /member/join/[storeKey] — Member join landing page.
 *
 * Server component: fetches store branding from Supabase at request time so
 * the brand color is correct on first paint — zero flash.
 *
 * Also resolves a referral code (?ref=xxx) server-side so the referral banner
 * is present in the initial HTML.
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
  display_name: string
  brand_name: string | null
  brand_color: string | null
  logo_url: string | null
  merchant_id: string
  google_review_url: string | null
  facebook_review_url: string | null
  city: string | null
  state: string | null
  font_family: string | null
}

const FALLBACK = { brandColor: '#4A4B98', brandName: 'BinPerks' }

export default async function JoinLandingPage({
  params,
  searchParams,
}: {
  params:       Promise<{ storeKey: string }>
  searchParams: Promise<{ ref?: string }>
}) {
  const { storeKey }  = await params
  const { ref: code } = await searchParams

  const admin = createAdminSupabaseClient()

  // Fetch store branding server-side — same pattern as /member/login/[storeKey]
  const { data: storeData } = await admin
    .from('stores')
    .select('id, canonical_key, display_name, brand_name, brand_color, logo_url, merchant_id, google_review_url, facebook_review_url, city, state, font_family')
    .eq('canonical_key', storeKey)
    .eq('is_active', true)
    .maybeSingle()
  const store = storeData as StoreRow | null

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
          <p className="text-[11px] text-[#8E8EA8] font-medium">Powered by BinPerks</p>
        </div>
      </div>
    )
  }

  // Resolve referral code server-side if present
  let referrer: { code: string; referrerMemberId: string; referrerFirstName: string } | null = null
  if (code) {
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
      storeName={store.display_name}
      brandColor={store.brand_color ?? FALLBACK.brandColor}
      brandName={store.brand_name ?? FALLBACK.brandName}
      logoUrl={store.logo_url ?? null}
      googleReviewUrl={store.google_review_url ?? null}
      facebookReviewUrl={store.facebook_review_url ?? null}
      city={store.city ?? null}
      state={store.state ?? null}
      fontFamily={store.font_family ?? 'Montserrat'}
      referrer={referrer}
    />
  )
}
// cache bust
