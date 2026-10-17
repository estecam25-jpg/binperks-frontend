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
import { FREE_SLOTS, FREE_REQUIRED, VIP_SLOTS, VIP_REQUIRED } from '@/lib/perks'
import { MERCHANT_EXTRA_LOCATION_PRICE as EXTRA_LOCATION } from '@/lib/merchant-signup-session'
import { VIP_PRICE, ORIGIN_COMMISSION_PER_VIP } from '@/lib/mrr'
import { PWA_APPS } from '@/lib/pwa-manifest'

/** Absolute, so the links are right whichever host rendered the page. */
const MERCHANT_ORIGIN = PWA_APPS.merchant.origin
const MEMBER_SITE     = 'https://binperks.com'

/**
 * The owner-facing FAQ.
 *
 * Grouped the way the questions actually arrive: what do I do first, what does
 * it cost me, how do I get paid, and what am I signing. Values that exist as
 * constants are interpolated rather than typed out, so a price change cannot
 * leave a wrong answer sitting in the FAQ.
 */
const FAQ_GROUPS: { title: string; items: { q: string; a: string }[] }[] = [
  {
    title: 'Getting started',
    items: [
      {
        q: 'How long does setup take?',
        a: 'Your store goes live as soon as you pay and sign the agreement. Your QR codes and '
         + 'marketing materials are generated automatically, ready to print on your office printer, '
         + 'so there’s nothing technical for you to do.',
      },
      {
        q: 'Do I get professional prints?',
        a: 'Yes. Every location gets a professional print kit: 10 poster decals and a sheet of '
         + 'countertop decals, delivered to your store about 10 business days after you sign up.',
      },
      {
        q: 'What do I need?',
        a: 'Any phone or tablet with internet for your register, and your Google review link. '
         + 'No special hardware and no app of your own.',
      },
      {
        q: 'Do my staff need training?',
        a: 'Barely. Cashiers sign in to the stamp tool with their own PIN, look up the member by '
         + 'phone number, and tap to award a stamp or redeem a coupon. It takes a few minutes to learn.',
      },
      {
        q: 'Can my employees be members?',
        a: 'No. To keep stamps fair, cashiers and staff should not hold a BinPerks member account.',
      },
    ],
  },
  {
    title: 'Rewards and perks',
    items: [
      {
        q: 'What do coupons cost me?',
        a: `Members earn a coupon every ${COUPON_CYCLE} stamps: $${STARTER_TIER.couponValue} for free `
         + `Starter members, and $${TIERS[0].couponValue} to $${TIERS[TIERS.length - 1].couponValue} for `
         + 'paying VIP members depending on their tier. Members who stop visiting may also get a '
         + 'one-time $2 comeback coupon. You set these discounts in your POS.',
      },
      {
        q: 'Can I choose my own perks?',
        a: `Yes. Offer at least ${FREE_REQUIRED} perk for free Starter members (up to ${FREE_SLOTS}) and `
         + `at least ${VIP_REQUIRED} for paying VIP members (up to ${VIP_SLOTS}), and change them anytime `
         + 'from your dashboard.',
      },
      {
        q: 'What if a stamp is given by mistake?',
        a: 'Email support@binperks.com and we’ll fix it.',
      },
    ],
  },
  {
    title: 'Money and locations',
    items: [
      {
        q: 'How do I get paid my VIP share?',
        a: 'Your share of each VIP membership is paid out through Stripe to your bank account.',
      },
      {
        q: 'Can I use BinPerks at more than one location?',
        a: `Yes. Each additional location is $${EXTRA_LOCATION} a month, and your members earn stamps `
         + 'at all of your locations.',
      },
    ],
  },
  {
    title: 'Contract',
    items: [
      {
        q: 'Is there a long-term contract? What if I cancel?',
        a: 'No long-term contract. It’s month to month. To cancel, give 30 days’ notice. '
         + 'You’ll keep honoring coupons members already earned for 30 days after you leave, and '
         + 'your shoppers stay BinPerks members. The setup fee isn’t refundable.',
      },
    ],
  },
]

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
          <h2 className="font-['Coiny'] text-[22px] text-[#1A1A2E] leading-snug">
            Most bin store owners don&rsquo;t have time to chase reviews or follow up with
            shoppers. BinPerks is more than an app. BinPerks is that system, and we run it
            for you.
          </h2>
          <div className="flex flex-col gap-2.5">
            {[
              { lead: 'Reward shoppers every time they shop.',
                body: `A stamp every visit, and a coupon every ${COUPON_CYCLE} stamps.` },
              { lead: 'Reward shoppers who bring a friend.',
                body: 'When a friend joins and gets their first stamp, both earn bonus stamps.' },
              { lead: 'Get more Google reviews.',
                body: 'Every member gets a review request after their visit, which helps your store get found and stand out online.' },
              { lead: 'Bring inactive shoppers back.',
                body: 'Automatic “we miss you” reminders, plus a comeback coupon.' },
              { lead: 'You control the perks.',
                body: `Offer at least ${FREE_REQUIRED} perk for free Starter members (up to ${FREE_SLOTS}) and at least ${VIP_REQUIRED} for paying VIP members (up to ${VIP_SLOTS}).` },
              { lead: 'Promote your daily bin price.',
                body: 'Your store card shows today’s bin price, what’s in the bins and your store message, so members check it before they drive over.' },
              { lead: 'Mitigate open boxes.',
                body: 'Shoppers can take a snapshot by scanning an item in your bins and see what it is and what it sells for at retail. That’s a reason to keep digging.' },
              { lead: 'Earn from VIP memberships.',
                body: `You earn $${ORIGIN_COMMISSION_PER_VIP} of every $${VIP_PRICE} VIP membership attributed to your store, every month.` },
              { lead: 'Marketing materials, ready to go.',
                body: 'Posters, table tents, QR codes and social media content, made with your store name.' },
              { lead: 'No hardware.',
                body: 'Cashiers stamp from any phone or tablet with their own PIN.' },
            ].map(item => (
              <div key={item.lead} className="flex items-start gap-2.5">
                <span className="text-[13px] flex-shrink-0 mt-0.5">✅</span>
                <p className="text-[13px] font-medium text-[#1A1A2E] leading-relaxed">
                  <span className="font-bold">{item.lead}</span> {item.body}
                </p>
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
              { icon: '📦', title: 'Professional print kit included', body: 'About 10 business days after you sign up, a professionally printed kit of poster decals and countertop decals arrives at your store. Need something today? Print table tents and posters from your office printer while you wait.' },
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

        {/* ── Questions from store owners ──────────────────────────────────
            Native <details>, not a hand-rolled accordion: closed by default,
            keyboard operable (Enter and Space on the summary), announced as a
            disclosure by screen readers, and it still opens with JavaScript
            off. The only custom part is hiding the default marker so the
            BinPerks chevron can sit on the right. */}
        <div className="w-full flex flex-col gap-4">
          <h2 className="font-['Coiny'] text-2xl text-[#1A1A2E]">Questions from store owners</h2>

          {FAQ_GROUPS.map(group => (
            <div key={group.title} className="flex flex-col gap-2">
              <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#8E8EA8] px-1">
                {group.title}
              </p>

              {group.items.map(item => (
                <details key={item.q} className="group bg-white rounded-2xl shadow-sm overflow-hidden">
                  <summary
                    className="cursor-pointer list-none [&::-webkit-details-marker]:hidden
                               px-4 py-3.5 flex items-start justify-between gap-3"
                  >
                    <span className="text-[13px] font-bold text-[#1A1A2E] leading-snug">
                      {item.q}
                    </span>
                    <span
                      aria-hidden="true"
                      className="text-[#4A4B98] text-[18px] leading-none font-bold shrink-0
                                 transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="px-4 pb-4 -mt-1 text-[12px] font-medium text-[#8E8EA8] leading-relaxed">
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
          ))}
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
