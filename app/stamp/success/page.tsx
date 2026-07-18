'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import StoreHeader from '@/components/stamp/StoreHeader'
import TierBadge from '@/components/stamp/TierBadge'
import { cashierSession, storeSession, foundMemberSession, stampResultSession, signOutCashier, type StampResult } from '@/lib/stamp-session'
import { getTier, cyclePosition, stampsToNextCoupon } from '@/lib/tiers'

export default function SuccessPage() {
  const router = useRouter()
  const [result, setResult] = useState<StampResult | null>(null)
  const [store, setStore] = useState({ name: 'BinPerks', brandColor: '#4A4B98', logoUrl: null as string | null })
  const [displayStamps, setDisplayStamps] = useState(0)
  const [progressWidth, setProgressWidth] = useState(0)
  const hasAnimated = useRef(false)

  useEffect(() => {
    const c = cashierSession.get()
    if (!c) { router.replace('/stamp'); return }
    const s = storeSession.get()
    if (s) setStore({ name: s.name, brandColor: s.brandColor, logoUrl: s.logoUrl })
    const r = stampResultSession.get()
    if (!r) { router.replace('/stamp/lookup'); return }
    setResult(r)

    if (!hasAnimated.current) {
      hasAnimated.current = true
      const cyclePos = cyclePosition(r.newTotalStamps)
      const displayTarget = r.couponIssued ? 20 : cyclePos
      animateCount(Math.max(0, displayTarget - 4), displayTarget, 500, setDisplayStamps)
      setTimeout(() => {
        const pct = Math.min((displayTarget / 20) * 100, 100)
        setProgressWidth(pct)
      }, 200)
    }
  }, [router])

  function handleNextMember() {
    foundMemberSession.clear()
    stampResultSession.clear()
    router.push('/stamp/lookup')
  }

  function handleReturnToSignIn() {
    signOutCashier()
    router.push('/stamp')
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

  const tier = getTier(result.newTotalStamps)
  const cyclePos = cyclePosition(result.newTotalStamps)
  const cycleDisplay = result.couponIssued ? 20 : cyclePos
  const remaining = result.couponIssued ? 20 : stampsToNextCoupon(result.newTotalStamps)
  const exhausted = result.freeCouponExhausted

  function buildScriptParts(): { text: string; highlight?: boolean }[] {
    const name = result!.memberFirstName
    const cv = result!.couponValue
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
        { text: `"You've been stamped, ` },
        { text: name, highlight: true },
        { text: `! Your ` },
        { text: `$${cv} coupon`, highlight: true },
        { text: ` was applied today — ` },
        { text: `${remaining} more stamp${remaining !== 1 ? 's' : ''}`, highlight: true },
        { text: ` and you earn another!"` },
      ]
    }
    if (exhausted) {
      return [
        { text: `"You've been stamped, ` },
        { text: name, highlight: true },
        { text: `! You're collecting stamps — upgrade to ` },
        { text: `VIP`, highlight: true },
        { text: ` to keep earning coupons!"` },
      ]
    }
    return [
      { text: `"You've been stamped, ` },
      { text: name, highlight: true },
      { text: `! You have ` },
      { text: `${cycleDisplay} stamp${cycleDisplay !== 1 ? 's' : ''}`, highlight: true },
      { text: ` — ` },
      { text: `${remaining} more`, highlight: true },
      { text: ` and you earn a ` },
      { text: `$${tier.couponValue} coupon`, highlight: true },
      { text: `."` },
    ]
  }

  const progressLabel = () => {
    if (exhausted) return <><strong className="text-[#1A1A2E]">Free coupon used</strong> — upgrade to VIP to keep earning</>
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

        {result.couponRedeemed && (
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

        {/* VIP upgrade nudge — shown when free member has used their one lifetime coupon */}
        {exhausted && !result.couponRedeemed && (
          <div className="w-full max-w-md bg-[#FFB217] rounded-2xl px-5 py-4 flex items-center gap-3.5">
            <span className="text-3xl flex-shrink-0">⭐</span>
            <div className="flex-1">
              <p className="text-[15px] font-bold text-[#1A1A2E] leading-tight">Upgrade to VIP to keep earning</p>
              <p className="text-[12px] text-[#1A1A2E]/70 font-medium mt-0.5">
                {result.memberFirstName} has used their free lifetime coupon — stamps still count toward VIP upgrade
              </p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl px-6 pb-6 pt-7 w-full max-w-md shadow-sm flex flex-col items-center gap-1.5">
          <p className="text-[11px] font-bold tracking-[0.1em] uppercase text-[#2A7D34] mb-1">
            ✓ Stamp awarded
          </p>
          <div className="flex items-baseline gap-1.5">
            <span className="font-['Coiny'] text-[88px] text-[#FFB217] leading-none tracking-tight">
              {displayStamps}
            </span>
            <span className="font-['Coiny'] text-3xl text-[#D1D1DC] leading-none pb-2">stamps</span>
          </div>
          <p className="text-[17px] font-bold text-[#1A1A2E]">
            {result.memberFirstName} {result.memberLastName}
          </p>
          <TierBadge totalStamps={result.newTotalStamps} className="mt-1" />
        </div>

        <div className="w-full max-w-md bg-amber-50 border-2 border-amber-200 rounded-2xl px-5 py-4">
          <p className="text-[10px] font-bold tracking-[0.08em] uppercase text-[#8E8EA8] mb-2">
            Say to member
          </p>
          <p className="text-[15px] font-semibold text-[#1A1A2E] leading-relaxed">
            {buildScriptParts().map((part, i) => (
              part.highlight
                ? <span key={i} className="text-[#2A7D34]">{part.text}</span>
                : <span key={i}>{part.text}</span>
            ))}
          </p>
        </div>

        <div className="bg-white rounded-2xl px-5 py-4 w-full max-w-md shadow-sm">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[12px] font-bold tracking-[0.06em] uppercase text-[#8E8EA8]">
              {exhausted ? 'Free member — no new coupons' : 'Toward next coupon'}
            </span>
            <span className="text-[13px] font-bold text-[#1A1A2E]">{cycleDisplay} / 20</span>
          </div>
          <div className="h-2 rounded-full bg-[#EBEBF2] overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-500 ${exhausted ? 'bg-[#D1D1DC]' : 'bg-[#FFB217]'}`}
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
