'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { MERCHANT_BASE_PRICE, MERCHANT_EXTRA_LOCATION_PRICE } from '@/lib/merchant-signup-session'
import { TIERS } from '@/lib/tiers'

export default function MerchantLandingPage() {
  const router = useRouter()

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">

      {/* ── Hero — full BinPerks branding, B2B context ── */}
      <div className="bg-[#1A1A2E] px-6 pt-16 pb-24 flex flex-col items-center gap-6 text-center">
        <div className="flex flex-col items-center gap-2">
          <span className="text-4xl">🏷️</span>
          <h1 className="font-['Coiny'] text-5xl text-white tracking-wide leading-none">
            BinPerks
          </h1>
          <p className="text-[13px] font-bold tracking-widest uppercase text-[#FFB217]">
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
          Apply Now — No Setup Fees
        </button>

        <p className="text-[12px] text-white/40 font-medium">
          ${MERCHANT_BASE_PRICE}/mo · Cancel anytime · Setup handled by BinPerks
        </p>

        <Link
          href="/merchant/login"
          className="text-[13px] font-semibold text-white/60 hover:text-white/90 transition-colors"
        >
          Already a merchant? Sign in →
        </Link>
      </div>

      {/* ── What your customers earn — tier table as selling point ── */}
      <div className="flex-1 flex flex-col items-center px-4 -mt-10 pb-16 gap-8 max-w-lg mx-auto w-full">

        {/* Tier rewards card — the merchant selling point */}
        <div className="w-full bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-[#4A4B98] px-5 py-4">
            <h2 className="font-['Coiny'] text-2xl text-white">What your customers earn</h2>
            <p className="text-[12px] text-white/70 font-medium mt-0.5">
              Bigger rewards keep loyal shoppers coming back more often
            </p>
          </div>
          <div className="divide-y divide-[#EBEBF2]">
            {TIERS.map(tier => (
              <div key={tier.name} className="flex items-center px-5 py-3.5 gap-4">
                <div className="w-8 text-xl flex-shrink-0">
                  {tier.name === 'Free' ? '⚪' :
                   tier.name === 'Bronze' ? '🥉' :
                   tier.name === 'Silver' ? '🥈' :
                   tier.name === 'Gold' ? '🥇' : '💎'}
                </div>
                <div className="flex-1">
                  <p className="text-[14px] font-bold text-[#1A1A2E]">{tier.name}</p>
                  <p className="text-[11px] text-[#8E8EA8] font-medium">
                    {tier.minStamps.toLocaleString()}
                    {tier.maxStamps ? `–${tier.maxStamps.toLocaleString()}` : '+'} lifetime stamps
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
            <p className="text-[11px] text-[#8E8EA8] font-medium text-center">
              VIP members earn faster — you keep 80% of every $29.99/mo VIP fee
            </p>
          </div>
        </div>

        {/* What’s included */}
        <div className="w-full flex flex-col gap-3">
          <h2 className="font-['Coiny'] text-2xl text-[#1A1A2E]">What’s included</h2>
          <div className="flex flex-col gap-2.5">
            {[
              { icon: '📱', title: 'Done-for-you setup', body: 'BinPerks provisions your store — QR codes, branding, cashier PINs. You don’t touch a line of code.' },
              { icon: '🔁', title: 'Automated follow-up', body: 'Stamp confirmations, coupon alerts, and win-back messages go out automatically via SMS.' },
              { icon: '⭐', title: 'Review generation', body: 'Happy customers get nudged to leave Google and Facebook reviews. Unhappy ones reach you privately.' },
              { icon: '📊', title: 'Weekly reports', body: 'Stamps, redemptions, new members, and referrals — delivered by email every week.' },
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
              <span className="text-[14px] font-bold text-[#1A1A2E]">First location</span>
              <span className="font-['Coiny'] text-2xl text-[#4A4B98]">${MERCHANT_BASE_PRICE}/mo</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[14px] font-bold text-[#1A1A2E]">Each additional location</span>
              <span className="font-['Coiny'] text-2xl text-[#4A4B98]">+${MERCHANT_EXTRA_LOCATION_PRICE}/mo</span>
            </div>
            <div className="border-t border-[#EBEBF2] pt-3 mt-1">
              <p className="text-[12px] text-[#8E8EA8] font-medium">
                Example: 3 locations = ${MERCHANT_BASE_PRICE} + ${MERCHANT_EXTRA_LOCATION_PRICE} + ${MERCHANT_EXTRA_LOCATION_PRICE} = $
                {(MERCHANT_BASE_PRICE + 2 * MERCHANT_EXTRA_LOCATION_PRICE).toFixed(2)}/mo
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
            No setup fee · No long-term contract · Cancel anytime
          </p>
        </div>
      </div>
    </div>
  )
}
