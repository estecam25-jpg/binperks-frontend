'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import StoreHeader from '@/components/stamp/StoreHeader'
import TierBadge from '@/components/stamp/TierBadge'
import { cashierSession, storeSession, foundMemberSession, stampResultSession, signOutCashier, type StampResult } from '@/lib/stamp-session'
import { PWA_APPS } from '@/lib/pwa-manifest'
import { readLastStore, isStoreKeyShape } from '@/lib/stamp-store-url'
import { COUPON_CYCLE, tierFor, cycleRemaining, TIER_DISPLAY_NAMES } from '@/lib/tiers'

export default function SuccessPage() {
  const router = useRouter()
  const [result, setResult] = useState<StampResult | null>(null)
  const [store, setStore] = useState({ name: 'BinPerks', brandColor: '#4A4B98', logoUrl: null as string | null })
  const [displayStamps, setDisplayStamps] = useState(0)
  const [progressWidth, setProgressWidth] = useState(0)
  const hasAnimated = useRef(false)

  useEffect(() => {
    const c = cashierSession.get()
    if (!c) { router.replace('/stamptool'); return }
    const s = storeSession.get()
    if (s) setStore({ name: s.name, brandColor: s.brandColor, logoUrl: s.logoUrl })
    const r = stampResultSession.get()
    if (!r) { router.replace('/stamptool/lookup'); return }
    setResult(r)

    if (!hasAnimated.current) {
      hasAnimated.current = true
      const cyclePos = r.cycleStamps % COUPON_CYCLE
      const displayTarget = r.couponIssued ? COUPON_CYCLE : cyclePos
      animateCount(Math.max(0, displayTarget - 4), displayTarget, 500, setDisplayStamps)
      setTimeout(() => {
        const pct = Math.min((displayTarget / COUPON_CYCLE) * 100, 100)
        setProgressWidth(pct)
      }, 200)
    }
  }, [router])

  function handleNextMember() {
    foundMemberSession.clear()
    stampResultSession.clear()
    router.push('/stamptool/lookup')
  }

  /**
   * Back to the PIN pad for THIS store, not the store list.
   *
   * The next person to pick the tablet up is a cashier at the same store, so
   * the list was a step they had to undo every shift. The store key comes from
   * the session set when the store page loaded, falling back to the store
   * remembered on this device.
   *
   * Read before signOutCashier() so it cannot depend on what that clears, and
   * the list stays the answer when no store is known.
   */
  function handleReturnToSignIn() {
    const storeKey = storeSession.get()?.storeKey ?? readLastStore()
    signOutCashier()

    if (!storeKey) { router.push('/stamptool'); return }

    // The short /<storeKey> form only resolves on the cashier subdomain.
    const onCashierHost = PWA_APPS.cashier.hosts.has(window.location.hostname)
    router.push(
      onCashierHost && isStoreKeyShape(storeKey)
        ? `/${encodeURIComponent(storeKey)}`
        : `/stamptool/${encodeURIComponent(storeKey)}`,
    )
  }

  if (!result) {
    return (
      <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">
        <StoreHeader storeName={store.name} brandColor={store.brandColor} logoUrl={store.logoUrl} />
        <div className="flex-1 flex items-center justify-center">
          <span className="w-8 h-8 border-[3px] border-[#EBEBF2] border-t-[#4A4B98] rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  // Tier from VIP progression, never the lifetime count — the cashier reads
  // the coupon value out loud, and a free member's $5 must not be announced as
  // a Bronze $7. This page carries isVip rather than the raw status string.
  const tier = tierFor({
    vipProgressionStamps: result.vipProgressionStamps,
    subscriptionStatus:   result.isVip ? 'vip' : 'free',
  })
  const cyclePos = result.cycleStamps % COUPON_CYCLE
  const cycleDisplay = result.couponIssued ? COUPON_CYCLE : cyclePos
  const remaining = result.couponIssued ? COUPON_CYCLE : cycleRemaining(result.cycleStamps)
  const leveledUp = result.justLeveledUp
  const approaching = result.approachingLevelUp

  function buildScriptParts(): { text: string; highlight?: boolean }[] {
    const name = result!.memberFirstName
    const cv = result!.couponValue
    // tier already accounts for isVip, so no second free-member check here.
    const tierLabel = TIER_DISPLAY_NAMES[tier.name]
    const storeName = store.name
    if (leveledUp === 'silver') return [
      { text: `"🥈 Congratulations ` },
      { text: name, highlight: true },
      { text: `! You just became a ` },
      { text: `Silver BinPerks member`, highlight: true },
      { text: `! You now earn ` },
      { text: `3 stamps every visit`, highlight: true },
      { text: `!"` },
    ]
    if (leveledUp === 'gold') return [
      { text: `"🥇 Congratulations ` },
      { text: name, highlight: true },
      { text: `! You just became a ` },
      { text: `Gold BinPerks member`, highlight: true },
      { text: `! You now earn ` },
      { text: `4 stamps every visit`, highlight: true },
      { text: `!"` },
    ]
    if (leveledUp === 'diamond') return [
      { text: `"💎 Congratulations ` },
      { text: name, highlight: true },
      { text: `! You just became a ` },
      { text: `Diamond BinPerks member`, highlight: true },
      { text: ` — the highest level! You now earn ` },
      { text: `5 stamps every visit`, highlight: true },
      { text: `!"` },
    ]
    if (approaching === 'silver') return [
      { text: `"` },
      { text: name, highlight: true },
      { text: `, you're almost a 🥈 ` },
      { text: `Silver BinPerks member`, highlight: true },
      { text: `! Just a few more visits to unlock your ` },
      { text: `3x stamp multiplier`, highlight: true },
      { text: `!"` },
    ]
    if (approaching === 'gold') return [
      { text: `"` },
      { text: name, highlight: true },
      { text: `, you're almost a 🥇 ` },
      { text: `Gold BinPerks member`, highlight: true },
      { text: `! Just a few more visits to unlock your ` },
      { text: `4x stamp multiplier`, highlight: true },
      { text: `!"` },
    ]
    if (approaching === 'diamond') return [
      { text: `"` },
      { text: name, highlight: true },
      { text: `, you're almost a 💎 ` },
      { text: `Diamond BinPerks member`, highlight: true },
      { text: `! Just a few more visits to unlock your ` },
      { text: `5x stamp multiplier`, highlight: true },
      { text: `!"` },
    ]
    if (result!.couponIssued) {
      return [
        { text: `"You've been stamped, ` },
        { text: name, highlight: true },
        { text: `! You just earned a ` },
        { text: `$${cv} coupon`, highlight: true },
        { text: ` — it'll be waiting for you on your next visit!"` },
      ]
    }
    if (result!.couponRedeemed) {
      return [
        { text: `"Thank you ` },
        { text: name, highlight: true },
        { text: ` for being a ` },
        { text: `BinPerks ${tierLabel} member`, highlight: true },
        { text: `! Your ` },
        { text: `$${cv} coupon`, highlight: true },
        { text: ` was applied today — ` },
        { text: `${remaining} more stamp${remaining !== 1 ? 's' : ''}`, highlight: true },
        { text: ` and you earn another at ` },
        { text: storeName, highlight: true },
        { text: `!"` },
      ]
    }
    return [
      { text: `"Thank you ` },
      { text: name, highlight: true },
      { text: ` for being a ` },
      { text: `BinPerks ${tierLabel} member`, highlight: true },
      { text: `! I'm awarding you a stamp today — ` },
      { text: `${remaining} more stamp${remaining !== 1 ? 's' : ''}`, highlight: true },
      { text: ` and you earn a ` },
      { text: `$${tier.couponValue} coupon`, highlight: true },
      { text: ` at ` },
      { text: storeName, highlight: true },
      { text: `!"` },
    ]
  }

  const progressLabel = () => {
    if (result.couponIssued) return <><strong className="text-[#1A1A2E]">Coupon earned!</strong> New cycle starts on next visit</>
    if (result.couponRedeemed) return <>Coupon redeemed · <strong className="text-[#1A1A2E]">{remaining} more stamps</strong> to earn a <strong className="text-[#1A1A2E]">${tier.couponValue} coupon</strong></>
    return <><strong className="text-[#1A1A2E]">{remaining} more stamp{remaining !== 1 ? 's' : ''}</strong> to earn a <strong className="text-[#1A1A2E]">${tier.couponValue} coupon</strong></>
  }

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">
      <StoreHeader storeName={store.name} brandColor={store.brandColor} logoUrl={store.logoUrl} />

      <main className="flex-1 flex flex-col items-center px-4 py-6 gap-3.5">

        {result.couponIssued && (
          <div className="w-full max-w-md bg-[#2A7D34] rounded-2xl px-5 py-4 flex items-center gap-3.5">
            <span className="text-3xl flex-shrink-0">🎟️</span>
            <div className="flex-1">
              <p className="text-[15px] font-bold text-white leading-tight">New coupon earned!</p>
              <p className="text-[12px] text-white/80 font-medium mt-0.5">
                {result.memberFirstName} earned a ${result.couponValue} coupon — active on next visit
              </p>
            </div>
            <div className="font-['Coiny'] text-2xl text-white flex-shrink-0">${result.couponValue}</div>
          </div>
        )}

        {result.couponRedeemed && !result.couponIssued && (
          <div className="w-full max-w-md bg-[#4A4B98] rounded-2xl px-5 py-4 flex items-center gap-3.5">
            <span className="text-3xl flex-shrink-0">✅</span>
            <div className="flex-1">
              <p className="text-[15px] font-bold text-white leading-tight">Coupon redeemed</p>
              <p className="text-[12px] text-white/80 font-medium mt-0.5">
                ${result.couponValue} coupon applied · stamp awarded
              </p>
            </div>
            <div className="font-['Coiny'] text-2xl text-white flex-shrink-0">${result.couponValue}</div>
          </div>
        )}

        <div className="bg-white rounded-2xl px-5 py-4 w-full max-w-md shadow-sm">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[12px] font-bold tracking-[0.06em] uppercase text-[#8E8EA8]">
              Toward next coupon
            </span>
            <span className="text-[13px] font-bold text-[#1A1A2E]">{cycleDisplay} / 20</span>
          </div>
          <div className="h-2 rounded-full bg-[#EBEBF2] overflow-hidden mb-2">
            <div
              className="h-full rounded-full transition-all duration-500 bg-[#FFB217]"
              style={{ width: `${progressWidth}%` }}
            />
          </div>
          <p className="text-[12px] font-semibold text-[#8E8EA8]">{progressLabel()}</p>
        </div>

        <div className="w-full max-w-md flex flex-col gap-2.5 mt-1">
          <button
            onClick={handleNextMember}
            className="w-full py-5 rounded-2xl font-bold text-[17px] text-white font-['Montserrat'] bg-[#4A4B98] active:scale-[0.97] transition-all tracking-wide"
          >
            Next Member →
          </button>
          <button
            onClick={handleReturnToSignIn}
            className="w-full py-4 rounded-2xl font-semibold text-[15px] text-[#8E8EA8] font-['Montserrat'] border-2 border-[#EBEBF2] active:border-[#1A1A2E] active:text-[#1A1A2E] transition-colors"
          >
            Return to Sign In
          </button>
        </div>
      </main>
    </div>
  )
}

function animateCount(from: number, to: number, duration: number, setter: (n: number) => void): void {
  const start = performance.now()
  function step(now: number) {
    const elapsed = now - start
    const progress = Math.min(elapsed / duration, 1)
    const eased = 1 - Math.pow(1 - progress, 3)
    setter(Math.round(from + (to - from) * eased))
    if (progress < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}
