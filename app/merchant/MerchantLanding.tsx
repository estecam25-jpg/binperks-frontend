'use client'

/**
 * The merchant landing page.
 *
 * ONE COPY, TWO ROUTES. merchant.binperks.com/ renders it for a signed-out
 * visitor (app/merchant/page.tsx), and /merchant/signup still renders it so
 * printed material and old links keep working. Both import this file, so the
 * pricing and the claims cannot drift between them.
 *
 * ── EVERY NUMBER IS READ, NOT TYPED ────────────────────────────────────────
 * Tiers and coupon values from lib/tiers, the VIP price and the merchant's
 * share of it from lib/mrr, the fees from lib/merchant-signup-session. This
 * page previously said "lifetime stamps" under each tier, which stopped being
 * true when VIP progression stamps were introduced — a selling page that
 * quietly disagrees with the product is how a merchant ends up promising their
 * customers something the app will not do.
 *
 * ── WHAT IT MAY CLAIM ──────────────────────────────────────────────────────
 * Only what is built. "Weekly reports by email" and "Facebook reviews" were
 * both on this page and neither exists: there is no weekly report job, and the
 * automated review request only ever uses a store's Google review URL. Both
 * were rewritten to describe what actually ships.
 *
 * Review wording is deliberately neutral. Steering happy customers to a public
 * review and unhappy ones to a private form is review gating, which the FTC
 * prohibits and Merchant Agreement §8.4 forbids — every member gets the same
 * prompt.
 *
 * NO PROMO CODES, EVER. They are internal and are entered on Stripe's own
 * checkout page; naming one here would publish it.
 */

import { useRouter } from 'next/navigation'
import {
  MERCHANT_SETUP_FEE,
  MERCHANT_PLATFORM_PRICE,
  MERCHANT_EXTRA_LOCATION_PRICE,
} from '@/lib/merchant-signup-session'
import { TIERS, STARTER_TIER, COUPON_CYCLE, TIER_EMOJI, TIER_LABELS } from '@/lib/tiers'
import { VIP_PRICE, ORIGIN_COMMISSION_PER_VIP } from '@/lib/mrr'
import { PWA_APPS } from '@/lib/pwa-manifest'

/** Absolute, so the links are right whichever host rendered the page. */
const MERCHANT_ORIGIN = PWA_APPS.merchant.origin
const MEMBER_SITE     = 'https://binperks.com'

export default function MerchantLanding() {
  const router = useRouter()

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">

      {/* ── Hero — full BinPerks branding, B2B context ── */}
      <div className="bg-[#4A4B98] px-6 pt-16 pb-24 flex flex-col items-center gap-6 text-center">
        <div className="flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="BinPerks" className="h-24 w-24 object-contain" />
          <p className="text-[13px] font-bold tracking-widest uppercase text-[#FFB217] mt-1">
            For Bin Store Owners
          </p>
        </div>

        <p className="text-[17px] font-semibold text-white/80 leading-relaxed max-w-sm">
          A managed loyalty program built for bin stores. We handle the stamps,
          coupons, follow-up, and customer data — you focus on the floor.
        </p>

        <button
          onClick={() => router.push('/merchant/signup/apply')}
          className="px-8 py-5 rounded-2xl font-bold text-[18px] font-['Montserrat'] tracking-wide bg-[#FFB217] text-[#1A1A2E] active:scale-[0.97] transition-all shadow-lg"
        >
          Apply Now — Setup Done For You
        </button>

        <p className="text-[12px] text-white/40 font-medium">
          ${MERCHANT_SETUP_FEE.toFixed(2)} one-time setup fee, then ${MERCHANT_PLATFORM_PRICE}/month · Cancel anytime with 30 days&rsquo; notice · Setup handled by BinPerks
        </p>

        <a
          href={`${MERCHANT_ORIGIN}/merchant/login`}
          className="text-[13px] font-semibold text-white/60 hover:text-white/90 transition-colors"
        >
          Already a merchant? Sign in →
        </a>
      </div>

      {/* ── What your customers earn — tier table as selling point ── */}
      <div className="flex-1 flex flex-col items-center px-4 -mt-10 pb-16 gap-8 max-w-lg mx-auto w-full">

        {/* What the merchant gets — read before the price, which is the order
            the question actually arrives in. */}
        <div className="w-full bg-white rounded-2xl shadow-sm px-5 py-5 flex flex-col gap-3">
          <h2 className="font-['Coiny'] text-2xl text-[#1A1A2E]">Why bin stores join</h2>
          <div className="flex flex-col gap-2.5">
            {[
              'We run the loyalty program — you focus on your store',
              'Members are motivated to visit more often',
              'No app to manage, no punch cards to print',
              'Real-time stamp tracking and coupon management',
              'Earn revenue share from VIP memberships',
            ].map(benefit => (
              <div key={benefit} className="flex items-start gap-2.5">
                <span className="text-[13px] flex-shrink-0 mt-0.5">✅</span>
                <p className="text-[13px] font-medium text-[#1A1A2E] leading-relaxed">{benefit}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tier rewards card — the merchant selling point */}
        <div className="w-full bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-[#4A4B98] px-5 py-4">
            <h2 className="font-['Coiny'] text-2xl text-white">What your customers earn</h2>
            <p className="text-[12px] text-white/70 font-medium mt-0.5">
              Bigger rewards keep loyal shoppers coming back more often
            </p>
          </div>
          <div className="divide-y divide-[#EBEBF2]">

            {/* Starter — where every member begins, and where most of them
                stay. Leaving it off made the table look like BinPerks costs
                the customer money to use. */}
            <div className="flex items-center px-5 py-3.5 gap-4 bg-[#FAFAFC]">
              <div className="w-8 text-xl flex-shrink-0">{TIER_EMOJI[STARTER_TIER.name]}</div>
              <div className="flex-1">
                <p className="text-[14px] font-bold text-[#1A1A2E]">
                  {TIER_LABELS[STARTER_TIER.name]} · free
                </p>
                <p className="text-[11px] text-[#8E8EA8] font-medium">
                  Free forever, no limit · earns {STARTER_TIER.multiplier}× per visit
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[15px] font-bold text-[#1A1A2E]">${STARTER_TIER.couponValue}</p>
                <p className="text-[10px] text-[#8E8EA8] font-medium">per coupon</p>
              </div>
              <div className="text-right flex-shrink-0 w-14">
                <p className="text-[13px] font-bold text-[#4A4B98]">{STARTER_TIER.visitsPerReward}</p>
                <p className="text-[10px] text-[#8E8EA8] font-medium">visits/reward</p>
              </div>
            </div>

            {TIERS.map(tier => (
              <div key={tier.name} className="flex items-center px-5 py-3.5 gap-4">
                <div className="w-8 text-xl flex-shrink-0">{TIER_EMOJI[tier.name]}</div>
                <div className="flex-1">
                  <p className="text-[14px] font-bold text-[#1A1A2E]">{TIER_LABELS[tier.name]}</p>
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
                <div className="text-right flex-shrink-0 w-14">
                  <p className="text-[13px] font-bold text-[#4A4B98]">{tier.visitsPerReward}</p>
                  <p className="text-[10px] text-[#8E8EA8] font-medium">visits/reward</p>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-[#F5F5F8] px-5 py-3 border-t border-[#EBEBF2]">
            <p className="text-[11px] text-[#8E8EA8] font-medium text-center leading-relaxed">
              Every member earns a coupon every {COUPON_CYCLE} stamps. VIP members earn faster —
              you earn ${ORIGIN_COMMISSION_PER_VIP} of every ${VIP_PRICE}/mo VIP membership attributed to your store
            </p>
          </div>
        </div>

        {/* What’s included */}
        <div className="w-full flex flex-col gap-3">
          <h2 className="font-['Coiny'] text-2xl text-[#1A1A2E]">What’s included</h2>
          <div className="flex flex-col gap-2.5">
            {[
              { icon: '📱', title: 'Done-for-you setup', body: 'BinPerks provisions your store — QR codes, branding, cashier PINs. You don’t touch a line of code.' },
              { icon: '🔁', title: 'Automated follow-up', body: 'Stamp confirmations, coupon alerts, and win-back messages go out automatically by text and email.' },
              { icon: '⭐', title: 'Review requests', body: 'Every member who earns a stamp gets the same request to leave a Google review an hour later, at most once a month.' },
              { icon: '📊', title: 'Live dashboard', body: 'Stamps, redemptions, new members, VIP numbers and review clicks, updated as they happen.' },
              { icon: '🏪', title: 'Multi-location ready', body: 'Aggregate view across all your stores, with per-location breakdowns. Add locations anytime.' },
            ].map((item, i) => (
              <div key={i} className="bg-white rounded-2xl px-4 py-4 flex items-start gap-3 shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-xl flex-shrink-0">
                  {item.icon}
                </div>
                <div className="flex-1">
                  <p className="text-[14px] font-bold text-[#1A1A2E]">{item.title}</p>
                  <p className="text-[12px] text-[#8E8EA8] font-medium mt-0.5 leading-relaxed">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pricing */}
        <div className="w-full flex flex-col gap-3">
          <h2 className="font-['Coiny'] text-2xl text-[#1A1A2E]">Simple pricing</h2>
          <div className="bg-white rounded-2xl px-5 py-5 shadow-sm flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[14px] font-bold text-[#1A1A2E]">
                One-time setup fee
                <span className="block text-[11px] font-medium text-[#8E8EA8]">Charged once, on your first invoice</span>
              </span>
              <span className="font-['Coiny'] text-2xl text-[#4A4B98]">${MERCHANT_SETUP_FEE.toFixed(2)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[14px] font-bold text-[#1A1A2E]">
                Monthly platform fee
                <span className="block text-[11px] font-medium text-[#8E8EA8]">Every month, from month 1</span>
              </span>
              <span className="font-['Coiny'] text-2xl text-[#4A4B98]">${MERCHANT_PLATFORM_PRICE}/mo</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[14px] font-bold text-[#1A1A2E]">
                Each additional location
                <span className="block text-[11px] font-medium text-[#8E8EA8]">Every month, from month 1</span>
              </span>
              <span className="font-['Coiny'] text-2xl text-[#4A4B98]">+${MERCHANT_EXTRA_LOCATION_PRICE}/mo</span>
            </div>
            <div className="border-t border-[#EBEBF2] pt-3 mt-1">
              <p className="text-[12px] text-[#8E8EA8] font-medium leading-relaxed">
                Example: 3 locations = ${MERCHANT_SETUP_FEE.toFixed(2)} setup + ${MERCHANT_PLATFORM_PRICE} + ${MERCHANT_EXTRA_LOCATION_PRICE} + ${MERCHANT_EXTRA_LOCATION_PRICE} = $
                {(MERCHANT_SETUP_FEE + MERCHANT_PLATFORM_PRICE + 2 * MERCHANT_EXTRA_LOCATION_PRICE).toFixed(2)} the first month,
                then ${(MERCHANT_PLATFORM_PRICE + 2 * MERCHANT_EXTRA_LOCATION_PRICE).toFixed(2)}/mo after that.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="w-full flex flex-col gap-3">
          <button
            onClick={() => router.push('/merchant/signup/apply')}
            className="w-full py-5 rounded-2xl font-bold text-[17px] text-white font-['Montserrat'] bg-[#4A4B98] active:scale-[0.97] transition-all tracking-wide"
          >
            Apply Now
          </button>
          <p className="text-[11px] text-[#8E8EA8] text-center font-medium">
            No long-term contract · Cancel anytime with 30 days&rsquo; notice
          </p>
        </div>

        {/* Shoppers land here too — send them to their own front door rather
            than letting them read a B2B page and leave. */}
        <a
          href={MEMBER_SITE}
          className="text-[12px] font-semibold text-[#4A4B98] hover:underline text-center"
        >
          Shopping at a bin store? Join free →
        </a>
      </div>
    </div>
  )
}
