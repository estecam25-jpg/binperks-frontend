'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import StoreHeader from '@/components/stamp/StoreHeader'
import { cashierSession, storeSession, foundMemberSession, stampResultSession } from '@/lib/stamp-session'

type VerifyState = 'writing' | 'success' | 'duplicate' | 'error'

export default function VerifyPage() {
  const router = useRouter()
  const [verifyState, setVerifyState] = useState<VerifyState>('writing')
  const [memberFirstName, setMemberFirstName] = useState('')
  const [store, setStore] = useState({ name: 'BinPerks', brandColor: '#4A4B98', logoUrl: null as string | null })
  const [ringProgress, setRingProgress] = useState(0)
  const [stepsVisible, setStepsVisible] = useState([false, false, false])
  const [stepsDone, setStepsDone] = useState([false, false, false])
  const hasRun = useRef(false)

  const RADIUS = 54
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    const c = cashierSession.get()
    if (!c) { router.replace('/stamp'); return }

    const s = storeSession.get()
    if (s) setStore({ name: s.name, brandColor: s.brandColor, logoUrl: s.logoUrl })

    const member = foundMemberSession.get()
    if (!member) { router.replace('/stamp/lookup'); return }
    setMemberFirstName(member.firstName)

    runTransaction(member.id, c.storeId, c.id, c.merchantId, member.firstName, member.lastName, c.pin)
  }, [router]) // eslint-disable-line react-hooks/exhaustive-deps

  async function runTransaction(
    memberId: string,
    storeId: string,
    cashierId: string,
    merchantId: string,
    firstName: string,
    lastName: string,
    pin: string
  ) {
    await tick(80)
    setRingProgress(75)

    await tick(200)
    setStepsVisible([true, false, false])
    await tick(300)
    setStepsDone([true, false, false])
    setStepsVisible([true, true, false])
    await tick(250)
    setStepsDone([true, true, false])
    setStepsVisible([true, true, true])
    await tick(250)
    setStepsDone([true, true, true])

    try {
      const res = await fetch('/api/stamp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // pin is included so /api/stamp can re-verify with bcrypt on every stamp
        body: JSON.stringify({ memberId, storeId, cashierId, merchantId, pin }),
      })

      const data = await res.json()

      if (res.status === 409) { setVerifyState('duplicate'); return }
      if (!res.ok) { setVerifyState('error'); return }

      // Free member lifetime coupon exhausted — stamp was BLOCKED server-side.
      // Returns status 200 so we must check data.error explicitly.
      if (data.error === 'free_coupon_exhausted') {
        stampResultSession.set({
          newTotalStamps:      data.totalStamps ?? 0,
          couponIssued:        false,
          couponRedeemed:      false,
          couponValue:         0,
          memberFirstName:     firstName,
          memberLastName:      lastName,
          freeCouponExhausted:  true,
          stampBlocked:         true,
          stampCount:           0,
          justLeveledUp:        null,
          approachingLevelUp:   null,
        })
        setRingProgress(100)
        setVerifyState('success')
        await tick(600)
        router.push('/stamp/success')
        return
      }

      stampResultSession.set({
        newTotalStamps:       data.newTotalStamps,
        couponIssued:         data.couponIssued,
        couponRedeemed:       data.couponRedeemed,
        couponValue:          data.couponValue,
        memberFirstName:      firstName,
        memberLastName:       lastName,
        freeCouponExhausted:  data.freeCouponExhausted ?? false,
        stampBlocked:         false,
        stampCount:           data.stampCount ?? 1,
        justLeveledUp:        data.justLeveledUp ?? null,
        approachingLevelUp:   data.approachingLevelUp ?? null,
      })

      setRingProgress(100)
      setVerifyState('success')
      await tick(600)
      router.push('/stamp/success')

    } catch {
      setVerifyState('error')
    }
  }

  function handleRetry() {
    hasRun.current = false
    setVerifyState('writing')
    setRingProgress(0)
    setStepsVisible([false, false, false])
    setStepsDone([false, false, false])
    const c = cashierSession.get()
    const m = foundMemberSession.get()
    if (c && m) {
      setTimeout(() => {
        runTransaction(m.id, c.storeId, c.id, c.merchantId, m.firstName, m.lastName, c.pin)
      }, 50)
    }
  }

  function handleBack() {
    router.push('/stamp/member')
  }

  const strokeOffset = CIRCUMFERENCE - (ringProgress / 100) * CIRCUMFERENCE
  const isError = verifyState === 'duplicate' || verifyState === 'error'
  const ringColor = verifyState === 'success' ? '#2A7D34' : isError ? '#DA1212' : '#2A7D34'

  const STEP_LABELS = ['Recording visit', 'Awarding stamp', 'Checking for coupon']

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">
      <StoreHeader storeName={store.name} brandColor={store.brandColor} logoUrl={store.logoUrl} />

      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-12 gap-0">

        <div className="relative w-36 h-36 mb-8">
          <svg className="w-36 h-36 -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="#EBEBF2" strokeWidth="8" />
            <circle
              cx="60" cy="60" r={RADIUS}
              fill="none"
              stroke={ringColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={strokeOffset}
              style={{ transition: 'stroke-dashoffset 0.55s cubic-bezier(0.4,0,0.2,1), stroke 0.2s ease' }}
            />
          </svg>

          {verifyState === 'writing' && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full border-[3.5px] border-[#EBEBF2] border-t-[#2A7D34] animate-spin" />
          )}
          {verifyState === 'success' && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-5xl">✓</div>
          )}
          {verifyState === 'duplicate' && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-5xl">!</div>
          )}
          {verifyState === 'error' && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-5xl">✕</div>
          )}
        </div>

        <h1 className={`font-['Coiny'] text-3xl text-center mb-2 ${isError ? 'text-[#DA1212]' : 'text-[#1A1A2E]'}`}>
          {verifyState === 'writing'   && `Stamping ${memberFirstName}'s card…`}
          {verifyState === 'success'   && 'Stamp awarded!'}
          {verifyState === 'duplicate' && 'Already stamped today'}
          {verifyState === 'error'     && 'Something went wrong'}
        </h1>

        <p className="text-[14px] font-medium text-[#8E8EA8] text-center leading-relaxed max-w-xs">
          {verifyState === 'writing'   && 'This takes just a second'}
          {verifyState === 'success'   && `${memberFirstName} has been stamped. Navigating…`}
          {verifyState === 'duplicate' && `${memberFirstName} already received a stamp today. No stamp was added.`}
          {verifyState === 'error'     && "The stamp wasn't saved. Check your connection and try again."}
        </p>

        {verifyState === 'writing' && (
          <div className="mt-8 flex flex-col gap-2.5 w-full max-w-xs">
            {STEP_LABELS.map((label, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 transition-all duration-300 ${stepsVisible[i] ? 'opacity-100' : 'opacity-0'}`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 text-[10px] font-bold transition-all duration-200 ${stepsDone[i] ? 'bg-[#2A7D34] border-[#2A7D34] text-white' : 'border-[#D1D1DC]'}`}>
                  {stepsDone[i] && '✓'}
                </div>
                <span className={`text-[13px] font-semibold ${stepsDone[i] ? 'text-[#1A1A2E]' : 'text-[#8E8EA8]'}`}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div className="mt-8 flex flex-col gap-2.5 w-full max-w-xs">
            {verifyState === 'error' && (
              <button
                onClick={handleRetry}
                className="w-full py-[17px] rounded-2xl font-bold text-[16px] text-white font-['Montserrat'] bg-[#4A4B98] active:scale-[0.97] transition-all"
              >
                Try Again
              </button>
            )}
            <button
              onClick={handleBack}
              className="w-full py-4 rounded-2xl font-semibold text-[15px] text-[#8E8EA8] font-['Montserrat'] border-2 border-[#EBEBF2] active:border-[#4A4B98] active:text-[#4A4B98] transition-colors"
            >
              ← Back to Member
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

function tick(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
