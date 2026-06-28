'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { signupStore, signupMember, type SignupStore } from '@/lib/signup-session'

const VIP_PRICE = '$29.99'

// VIP perks list — specific, not vague
const VIP_PERKS = [
  { icon: '⚡', text: 'Earn stamps up to 5× faster as you level up' },
  { icon: '🎟️', text: 'Bigger coupons — up to $15 per reward at Diamond tier' },
  { icon: '🔓', text: 'Unlock exclusive monthly member perks at this store' },
  { icon: '📣', text: 'First to know about new inventory and restock days' },
  { icon: '♾️', text: 'Stamps never expire — earn at your own pace' },
]

export default function VipUpsellPage() {
  const router = useRouter()
  const params = useParams()
  const storeKey = params.storeKey as string

  const [store, setStore] = useState<SignupStore | null>(null)
  const [loading, setLoading] = useState<'vip' | 'free' | null>(null)

  useEffect(() => {
    const s = signupStore.get()
    if (!s) { router.replace(`/join/${storeKey}`); return }
    setStore(s)

    const m = signupMember.get()
    if (!m) { router.replace(`/join/${storeKey}/signup`); return }
  }, [router, storeKey])

  async function handleVip() {
    if (!store) return
    const member = signupMember.get()
    if (!member) return

    setLoading('vip')

    // merchantId is resolved to the merchant's Stripe Connect ID server-side
    // (never trust a connect ID supplied by the client)
    const res = await fetch('/api/join/vip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memberId:   member.id,
        merchantId: store.merchantId,
        successUrl: `${window.location.origin}/join/${storeKey}/thankyou?plan=vip`,
        cancelUrl:  `${window.location.origin}/join/${storeKey}/vip`,
      }),
    })

    const data = await res.json()
    if (data.checkoutUrl) {
      window.location.href = data.checkoutUrl  // full redirect to Stripe Checkout
    } else {
      setLoading(null)
    }
  }

  function handleFree() {
    setLoading('free')
    router.push(`/join/${storeKey}/thankyou?plan=free`)
  }

  if (!store) return null

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">

      {/* Mini header */}
      <div
        className="px-5 py-3 flex items-center gap-2.5"
        style={{ backgroundColor: store.brandColor }}
      >
        <span className="font-['Coiny'] text-xl leading-none text-white">{store.brandName}</span>
        <span className="text-white/50 text-[10px] font-semibold tracking-widest uppercase ml-auto">
          Powered by BinPerks
        </span>
      </div>

      <main className="flex-1 flex flex-col items-center px-4 py-8 gap-6 max-w-md mx-auto w-full">

        <div className="w-full text-center">
          <p className="font-['Coiny'] text-3xl text-[#1A1A2E] mb-1">One last step</p>
          <p className="text-[14px] text-[#8E8EA8] font-medium">
            Choose how you want to earn. You can always upgrade later.
          </p>
        </div>

        {/* ── VIP card — deliberately prominent ── */}
        <div
          className="w-full rounded-2xl overflow-hidden shadow-lg"
          style={{ boxShadow: `0 4px 24px ${store.brandColor}30, 0 2px 8px rgba(0,0,0,0.08)` }}
        >
          {/* VIP header band */}
          <div
            className="px-5 py-3 flex items-center justify-between"
            style={{ backgroundColor: store.brandColor }}
          >
            <span className="font-['Coiny'] text-xl text-white tracking-wide">VIP Member</span>
            <span
              className="text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-full bg-white/20 text-white"
            >
              Recommended
            </span>
          </div>

          <div className="bg-white px-5 py-5 flex flex-col gap-4">
            {/* Price */}
            <div className="flex items-baseline gap-1">
              <span className="font-['Coiny'] text-5xl text-[#1A1A2E]">{VIP_PRICE}</span>
              <span className="text-[14px] font-semibold text-[#8E8EA8]">/month</span>
            </div>

            {/* Perks */}
            <div className="flex flex-col gap-2.5">
              {VIP_PERKS.map((perk, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-lg flex-shrink-0 leading-snug">{perk.icon}</span>
                  <p className="text-[13px] font-semibold text-[#1A1A2E] leading-snug">{perk.text}</p>
                </div>
              ))}
            </div>

            {/* CTA */}
            <button
              onClick={handleVip}
              disabled={loading === 'vip'}
              className="w-full py-5 rounded-2xl font-bold text-[17px] text-white font-['Montserrat'] tracking-wide disabled:opacity-60 active:scale-[0.97] transition-all flex items-center justify-center gap-2 mt-1"
              style={{ backgroundColor: store.brandColor }}
            >
              {loading === 'vip' && (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              )}
              {loading === 'vip' ? 'Redirecting to payment…' : `Start VIP — ${VIP_PRICE}/mo`}
            </button>

            <p className="text-[11px] text-[#8E8EA8] text-center font-medium">
              Cancel anytime · 30-day grace period on payment issues
            </p>
          </div>
        </div>

        {/* ── Free card — intentionally low contrast ── */}
        <div className="w-full rounded-2xl border-2 border-[#EBEBF2] bg-white px-5 py-5 flex flex-col gap-3">
          <div className="flex items-baseline gap-2">
            <span className="font-['Coiny'] text-3xl text-[#8E8EA8]">Free</span>
            <span className="text-[13px] font-medium text-[#8E8EA8]">membership</span>
          </div>

          <div className="flex flex-col gap-1.5">
            {[
              'Earn 1 stamp per visit',
              'Earn a $5 coupon every 20 visits',
              'One $5 coupon (upgrade to keep earning)',
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[#D1D1DC] text-sm">–</span>
                <p className="text-[12px] font-medium text-[#8E8EA8]">{item}</p>
              </div>
            ))}
          </div>

          {/* Outlined secondary button — visible and tappable but lower visual weight than VIP CTA */}
          <button
            onClick={handleFree}
            disabled={loading === 'free'}
            className="w-full py-4 rounded-2xl font-semibold text-[15px] font-['Montserrat'] text-[#8E8EA8] border-2 border-[#EBEBF2] active:border-[#D1D1DC] active:bg-[#F5F5F8] transition-colors disabled:opacity-50"
          >
            {loading === 'free' ? 'Continuing…' : 'Stay with the free plan'}
          </button>
        </div>

        <p className="text-[11px] text-[#8E8EA8] text-center font-medium px-4">
          You can always upgrade from your member dashboard. Coupons and stamps are never lost when upgrading.
        </p>
      </main>
    </div>
  )
}
