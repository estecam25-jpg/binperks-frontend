'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface MeResponse {
  member: { id: string; subscriptionStatus: 'free' | 'vip'; merchantId: string }
  store: { brandName: string; brandColor: string; id: string } | null
}

const VIP_PRICE = '$29.99'

const VIP_PERKS = [
  { icon: '⚡', text: 'Earn stamps up to 5× faster as you level up' },
  { icon: '🎟️', text: 'Bigger coupons — up to $15 per reward at Diamond tier' },
  { icon: '🔓', text: 'Unlock exclusive monthly member perks at this store' },
  { icon: '📣', text: 'First to know about new inventory and restock days' },
  { icon: '♾️', text: 'Stamps never expire — earn at your own pace' },
]

export default function MemberUpgradePage() {
  const router = useRouter()
  const [data, setData] = useState<MeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkingOut, setCheckingOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/member/me').then(res => {
      if (res.status === 401) { router.replace('/member/login'); return null }
      return res.ok ? res.json() : null
    }).then(d => {
      if (d) setData(d)
      setLoading(false)
    })
  }, [router])

  async function handleUpgrade() {
    if (!data || checkingOut) return
    setCheckingOut(true)
    setError(null)

    const res = await fetch('/api/join/vip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memberId:   data.member.id,
        merchantId: data.member.merchantId,
        successUrl: `${window.location.origin}/member/dashboard?upgraded=1`,
        cancelUrl:  `${window.location.origin}/member/upgrade`,
      }),
    })

    const result = await res.json()
    if (result.checkoutUrl) {
      window.location.href = result.checkoutUrl
    } else {
      setError(result.error === 'merchant_not_stripe_connected'
        ? 'VIP upgrades aren\'t available for this store yet.'
        : 'Could not start checkout. Please try again.')
      setCheckingOut(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#F5F5F8]">
        <span className="w-8 h-8 border-[3px] border-[#EBEBF2] border-t-[#4A4B98] rounded-full animate-spin" />
      </div>
    )
  }

  if (!data) return null

  const brandColor = data.store?.brandColor ?? '#4A4B98'
  const brandName = data.store?.brandName ?? 'BinPerks'

  if (data.member.subscriptionStatus === 'vip') {
    return (
      <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">
        <div className="px-5 py-3 flex items-center gap-2.5" style={{ backgroundColor: brandColor }}>
          <span className="font-['Coiny'] text-xl leading-none text-white">{brandName}</span>
        </div>
        <main className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
          <span className="text-3xl">⭐</span>
          <p className="font-['Coiny'] text-2xl text-[#1A1A2E]">You're already VIP</p>
          <button onClick={() => router.push('/member/dashboard')} className="text-[13px] font-semibold text-[#4A4B98] underline mt-2">
            Back to dashboard
          </button>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">
      <div className="px-5 py-3 flex items-center gap-2.5" style={{ backgroundColor: brandColor }}>
        <span className="font-['Coiny'] text-xl leading-none text-white">{brandName}</span>
        <span className="text-white/50 text-[10px] font-semibold tracking-widest uppercase ml-auto">
          Powered by BinPerks
        </span>
      </div>

      <main className="flex-1 flex flex-col items-center px-4 py-8 gap-5 max-w-md mx-auto w-full">
        <div className="w-full text-center">
          <p className="font-['Coiny'] text-3xl text-[#1A1A2E] mb-1">Upgrade to VIP</p>
          <p className="text-[14px] text-[#8E8EA8] font-medium">Cancel anytime. Keep all your stamps either way.</p>
        </div>

        <div className="w-full rounded-2xl overflow-hidden shadow-lg" style={{ boxShadow: `0 4px 24px ${brandColor}30, 0 2px 8px rgba(0,0,0,0.08)` }}>
          <div className="px-5 py-3 flex items-center justify-between" style={{ backgroundColor: brandColor }}>
            <span className="font-['Coiny'] text-xl text-white tracking-wide">VIP Member</span>
          </div>
          <div className="bg-white px-5 py-5 flex flex-col gap-4">
            <div className="flex items-baseline gap-1">
              <span className="font-['Coiny'] text-5xl text-[#1A1A2E]">{VIP_PRICE}</span>
              <span className="text-[14px] font-semibold text-[#8E8EA8]">/month</span>
            </div>
            <div className="flex flex-col gap-2.5">
              {VIP_PERKS.map((perk, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-lg flex-shrink-0 leading-snug">{perk.icon}</span>
                  <p className="text-[13px] font-semibold text-[#1A1A2E] leading-snug">{perk.text}</p>
                </div>
              ))}
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-[12px] font-semibold text-[#DA1212]">{error}</p>
              </div>
            )}

            <button
              onClick={handleUpgrade}
              disabled={checkingOut}
              className="w-full py-5 rounded-2xl font-bold text-[17px] text-white font-['Montserrat'] tracking-wide disabled:opacity-60 active:scale-[0.97] transition-all flex items-center justify-center gap-2 mt-1"
              style={{ backgroundColor: brandColor }}
            >
              {checkingOut && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              {checkingOut ? 'Redirecting to payment…' : `Start VIP — ${VIP_PRICE}/mo`}
            </button>
            <p className="text-[11px] text-[#8E8EA8] text-center font-medium">
              30-day grace period on payment issues
            </p>
          </div>
        </div>

        <button onClick={() => router.push('/member/dashboard')} className="text-[13px] font-semibold text-[#8E8EA8] underline mt-1">
          Not now
        </button>
      </main>
    </div>
  )
}
