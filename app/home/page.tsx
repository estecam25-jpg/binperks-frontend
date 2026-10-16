/**
 * binperks.com — the member marketing homepage.
 *
 * Served at the root domain by the middleware, and reachable at
 * app.binperks.com/home so it can be reviewed before DNS moves. Both render
 * this one file; there is no second copy to keep in step.
 *
 * SERVER COMPONENT, for two reasons. The participating-stores list is a live
 * database read, and this is the page search engines and link previews fetch —
 * both want the HTML to arrive already filled in.
 *
 * ── WHERE THE NUMBERS COME FROM ────────────────────────────────────────────
 * Every tier figure, coupon value and multiplier is read from lib/tiers, and
 * the VIP price from lib/mrr. Nothing on this page is typed out by hand: the
 * old merchant landing page hardcoded "lifetime stamps" and drifted away from
 * what the app actually did, and a marketing page that disagrees with the
 * product is worse than no page.
 *
 * ── WHAT "JOIN FREE" DOES ──────────────────────────────────────────────────
 * It goes to app.binperks.com with no store attached, which is the existing
 * BinPerks-direct join: the member is created against the BinPerks house
 * origin and moves to the first store that stamps them. That is the same path
 * a member already takes today, not a new one. Sign-in is the same screen —
 * the phone number decides which branch they are on — so both buttons point
 * there and the page says so rather than implying two different flows.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import {
  TIERS, STARTER_TIER, COUPON_CYCLE, TIER_EMOJI, TIER_LABELS,
} from '@/lib/tiers'
import { VIP_PRICE } from '@/lib/mrr'
import { MEMBER_APP_ORIGIN } from '@/lib/pwa-manifest'
import BennyMascot from '@/components/marketing/BennyMascot'

/** Re-read on every request: a store going live should show up the same day. */
export const dynamic = 'force-dynamic'

const SITE  = 'https://binperks.com'
const TITLE = 'BinPerks — Earn rewards at your favorite bin stores'
const DESCRIPTION =
  `Join free and earn a stamp every time you shop at a participating bin store. `
  + `Every ${COUPON_CYCLE} stamps is a $${STARTER_TIER.couponValue} coupon — free forever, no expiry. `
  + `VIP members earn up to ${TIERS[TIERS.length - 1].multiplier}× faster.`

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  metadataBase: new URL(SITE),
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: SITE,
    siteName: 'BinPerks',
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: '/icon.png', width: 512, height: 512, alt: 'BinPerks' }],
  },
  twitter: {
    card: 'summary',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/icon.png'],
  },
}

interface StoreCard {
  id: string
  name: string
  city: string | null
  state: string | null
}

/**
 * Participating stores.
 *
 * is_active AND network_visible, which between them exclude every store that
 * must not be advertised: pre-setup stores (both false from the moment they
 * are created), merchants whose stores were taken down for non-payment, and
 * the BinPerks house store. Nothing here needs to know those categories exist
 * — it asks for stores the network is willing to show, and that is the same
 * pair of flags the member app and the public store list use.
 */
async function participatingStores(): Promise<StoreCard[]> {
  try {
    const admin = createAdminSupabaseClient()
    const { data, error } = await admin
      .from('stores')
      .select('id, display_name, brand_name, city, state')
      .eq('is_active', true)
      .eq('network_visible', true)
      .order('state', { ascending: true })
      .order('city', { ascending: true })

    if (error) {
      console.error('[home] store list failed:', error)
      return []
    }
    return (data ?? []).map(s => ({
      id:    s.id as string,
      name:  (s.display_name as string) || (s.brand_name as string) || 'BinPerks store',
      city:  s.city as string | null,
      state: s.state as string | null,
    }))
  } catch (err) {
    // The page is worth serving without the list; an empty section says so.
    console.error('[home] store list threw:', err)
    return []
  }
}

export default async function MemberHomePage() {
  const stores = await participatingStores()

  const topTier = TIERS[TIERS.length - 1]

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">

      {/* ── 1. Hero ──────────────────────────────────────────────────────── */}
      <header className="bg-[#4A4B98] px-6 pt-14 pb-24 flex flex-col items-center gap-6 text-center">
        <div className="flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="BinPerks" className="h-20 w-20 object-contain" />
          <BennyMascot size={150} className="mt-1" />
        </div>

        <h1 className="font-['Coiny'] text-[32px] leading-tight text-white max-w-sm">
          Earn rewards at your favorite bin stores.
        </h1>

        <p className="text-[16px] font-semibold text-white/80 leading-relaxed max-w-sm">
          A stamp every time you shop. A coupon every {COUPON_CYCLE} stamps.
          Free forever, at every participating store.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs sm:max-w-md">
          <a
            href={MEMBER_APP_ORIGIN}
            className="flex-1 px-8 py-4 rounded-2xl font-bold text-[17px] font-['Montserrat']
                       tracking-wide bg-[#FFB217] text-[#1A1A2E] shadow-lg
                       active:scale-[0.97] transition-all"
          >
            Join free
          </a>
          <a
            href={MEMBER_APP_ORIGIN}
            className="flex-1 px-8 py-4 rounded-2xl font-bold text-[17px] font-['Montserrat']
                       tracking-wide bg-white/10 text-white border border-white/25
                       active:scale-[0.97] transition-all"
          >
            Sign in
          </a>
        </div>

        <p className="text-[12px] text-white/45 font-medium">
          No card, no app to download. Your phone number is your membership.
        </p>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 -mt-12 pb-16 gap-8 max-w-lg mx-auto w-full">

        {/* ── 2. Why shoppers join ───────────────────────────────────────── */}
        <section className="w-full bg-white rounded-2xl shadow-sm px-5 py-5 flex flex-col gap-3">
          <h2 className="font-['Coiny'] text-2xl text-[#1A1A2E]">Why shoppers join</h2>
          <div className="flex flex-col gap-2.5">
            {[
              `Earn a stamp every visit — one per store, per day`,
              `Free forever. No expiry, no limit, nothing to renew`,
              `Use your coupons at every participating store, not just the one you joined at`,
              `VIP earns faster — up to ${topTier.multiplier}× the stamps and $${topTier.couponValue} coupons`,
            ].map(benefit => (
              <div key={benefit} className="flex items-start gap-2.5">
                <span className="text-[13px] flex-shrink-0 mt-0.5">✅</span>
                <p className="text-[13px] font-medium text-[#1A1A2E] leading-relaxed">{benefit}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 3. What you earn ───────────────────────────────────────────── */}
        <section className="w-full bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-[#4A4B98] px-5 py-4">
            <h2 className="font-['Coiny'] text-2xl text-white">What you earn</h2>
            <p className="text-[12px] text-white/70 font-medium mt-0.5">
              Every {COUPON_CYCLE} stamps is a coupon. VIP tiers rise with the stamps you earn while subscribed.
            </p>
          </div>

          <div className="divide-y divide-[#EBEBF2]">
            {/* Starter first: it is where everybody begins, and it never ends. */}
            <div className="flex items-center px-5 py-3.5 gap-4 bg-[#FAFAFC]">
              <div className="w-8 text-xl flex-shrink-0">{TIER_EMOJI[STARTER_TIER.name]}</div>
              <div className="flex-1">
                <p className="text-[14px] font-bold text-[#1A1A2E]">
                  {TIER_LABELS[STARTER_TIER.name]} · free
                </p>
                <p className="text-[11px] text-[#8E8EA8] font-medium">
                  Free forever · earns {STARTER_TIER.multiplier}× per visit
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[15px] font-bold text-[#1A1A2E]">${STARTER_TIER.couponValue}</p>
                <p className="text-[10px] text-[#8E8EA8] font-medium">per coupon</p>
              </div>
            </div>

            {TIERS.map(tier => (
              <div key={tier.name} className="flex items-center px-5 py-3.5 gap-4">
                <div className="w-8 text-xl flex-shrink-0">{TIER_EMOJI[tier.name]}</div>
                <div className="flex-1">
                  <p className="text-[14px] font-bold text-[#1A1A2E]">
                    {TIER_LABELS[tier.name]} VIP
                  </p>
                  <p className="text-[11px] text-[#8E8EA8] font-medium">
                    {tier.minStamps.toLocaleString()}
                    {tier.maxStamps ? `–${tier.maxStamps.toLocaleString()}` : '+'} VIP progression stamps
                    {' '}· earns {tier.multiplier}× per visit
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[15px] font-bold text-[#1A1A2E]">${tier.couponValue}</p>
                  <p className="text-[10px] text-[#8E8EA8] font-medium">per coupon</p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-[#F5F5F8] px-5 py-3 border-t border-[#EBEBF2]">
            <p className="text-[11px] text-[#8E8EA8] font-medium text-center leading-relaxed">
              VIP progression stamps are the stamps you earn while subscribed. They never reset —
              cancel and come back and you pick up where you left off.
            </p>
          </div>
        </section>

        {/* ── 4. Free vs VIP ─────────────────────────────────────────────── */}
        <section className="w-full flex flex-col gap-3">
          <h2 className="font-['Coiny'] text-2xl text-[#1A1A2E]">Free or VIP</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

            <div className="bg-white rounded-2xl px-5 py-5 shadow-sm flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <p className="text-[15px] font-bold text-[#1A1A2E]">
                  {TIER_EMOJI[STARTER_TIER.name]} {TIER_LABELS[STARTER_TIER.name]}
                </p>
                <p className="font-['Coiny'] text-xl text-[#4A4B98]">Free</p>
              </div>
              <ul className="flex flex-col gap-1.5 mt-1">
                {[
                  'Free forever',
                  `$${STARTER_TIER.couponValue} coupon every ${COUPON_CYCLE} stamps`,
                  'No limit, no expiry',
                  `${STARTER_TIER.multiplier} stamp per visit`,
                ].map(line => (
                  <li key={line} className="text-[12px] font-medium text-[#1A1A2E] flex gap-2">
                    <span className="text-[#8E8EA8]">·</span>{line}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white rounded-2xl px-5 py-5 shadow-sm flex flex-col gap-2 ring-2 ring-[#FFB217]">
              <div className="flex items-baseline justify-between">
                <p className="text-[15px] font-bold text-[#1A1A2E]">
                  {TIER_EMOJI.Diamond} VIP
                </p>
                <p className="font-['Coiny'] text-xl text-[#4A4B98]">${VIP_PRICE}/mo</p>
              </div>
              <ul className="flex flex-col gap-1.5 mt-1">
                {[
                  `${TIERS[0].multiplier}× to ${topTier.multiplier}× stamps per visit`,
                  `Coupons from $${TIERS[0].couponValue} to $${topTier.couponValue}`,
                  'Tier rises as you keep shopping',
                  "Cancel anytime from your account",
                ].map(line => (
                  <li key={line} className="text-[12px] font-medium text-[#1A1A2E] flex gap-2">
                    <span className="text-[#8E8EA8]">·</span>{line}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── 5. Participating stores ────────────────────────────────────── */}
        <section className="w-full flex flex-col gap-3">
          <h2 className="font-['Coiny'] text-2xl text-[#1A1A2E]">Where you can earn</h2>
          {stores.length === 0 ? (
            <div className="bg-white rounded-2xl px-5 py-5 shadow-sm">
              <p className="text-[13px] text-[#8E8EA8] font-medium leading-relaxed">
                New stores are joining now. Join free today and your stamps start at the
                first store that scans you.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm divide-y divide-[#EBEBF2] overflow-hidden">
              {stores.map(store => (
                <div key={store.id} className="px-5 py-3.5 flex items-center gap-3">
                  <span className="text-lg flex-shrink-0">🏪</span>
                  <div className="min-w-0">
                    <p className="text-[14px] font-bold text-[#1A1A2E] truncate">{store.name}</p>
                    {(store.city || store.state) && (
                      <p className="text-[11px] text-[#8E8EA8] font-medium">
                        {[store.city, store.state].filter(Boolean).join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-[#8E8EA8] font-medium px-1">
            Your coupons work at every store on this list, wherever you earned them.
          </p>
        </section>

        {/* ── 6. FAQ ─────────────────────────────────────────────────────── */}
        <section className="w-full flex flex-col gap-3">
          <h2 className="font-['Coiny'] text-2xl text-[#1A1A2E]">Questions</h2>
          <div className="flex flex-col gap-2.5">
            {[
              {
                q: 'How do stamps work?',
                a: `You earn a stamp each time you shop at a participating store — one visit per store `
                 + `per day. At ${COUPON_CYCLE} stamps you get a coupon and the count starts again. `
                 + `VIP members earn more than one stamp per visit, so they reach ${COUPON_CYCLE} faster.`,
              },
              {
                q: 'Does the free membership expire?',
                a: `No. Free is free forever. There is no cap on how many coupons you can earn, `
                 + `your stamps never expire, and there is nothing to renew.`,
              },
              {
                q: 'Where can I use my coupons?',
                a: `At any participating BinPerks store, not only the one where you earned them. `
                 + `Show your coupon at the register and the cashier applies it.`,
              },
              {
                q: 'How do I cancel VIP?',
                a: `From your account screen in the app, any time. You keep the tier you reached — `
                 + `if you resubscribe later, your VIP progression picks up where it left off, and `
                 + `you stay a free member in the meantime.`,
              },
            ].map(item => (
              <div key={item.q} className="bg-white rounded-2xl px-5 py-4 shadow-sm">
                <p className="text-[14px] font-bold text-[#1A1A2E]">{item.q}</p>
                <p className="text-[12px] text-[#8E8EA8] font-medium mt-1 leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Bottom CTA ─────────────────────────────────────────────────── */}
        <a
          href={MEMBER_APP_ORIGIN}
          className="w-full py-5 rounded-2xl font-bold text-[17px] text-white text-center
                     font-['Montserrat'] bg-[#4A4B98] tracking-wide
                     active:scale-[0.97] transition-all"
        >
          Join free
        </a>
      </main>

      {/* ── 7. Footer ────────────────────────────────────────────────────── */}
      <footer className="bg-[#1A1A2E] px-6 py-8 flex flex-col items-center gap-4 text-center">
        <a
          href="https://merchant.binperks.com"
          className="text-[14px] font-bold text-[#FFB217] hover:underline"
        >
          Own a bin store? Partner with BinPerks →
        </a>

        <div className="flex items-center gap-4 flex-wrap justify-center">
          <Link href="/terms/member" className="text-[12px] font-medium text-white/60 hover:text-white">
            Terms
          </Link>
          <Link href="/terms/privacy" className="text-[12px] font-medium text-white/60 hover:text-white">
            Privacy
          </Link>
          <a href="mailto:support@binperks.com" className="text-[12px] font-medium text-white/60 hover:text-white">
            support@binperks.com
          </a>
        </div>

        <p className="text-[11px] text-white/30 font-medium">
          © {new Date().getFullYear()} BinPerks LLC
        </p>
      </footer>
    </div>
  )
}
