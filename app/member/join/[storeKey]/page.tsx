'use client'

import { useEffect, useState, useRef } from 'react'
import Image from 'next/image'
import { useRouter, useParams } from 'next/navigation'
import { signupStore, signupRef, type SignupStore, type SignupRef } from '@/lib/signup-session'
import { headerTextColor, storeInitials } from '@/lib/branding'

type PageState = 'loading' | 'error' | 'ready'

export default function JoinLandingPage() {
  const router = useRouter()
  const params = useParams()
  const storeKey = params.storeKey as string

  const [store, setStore]           = useState<SignupStore | null>(null)
  const [ref, setRef]               = useState<SignupRef | null>(null)
  const [pageState, setPageState]   = useState<PageState>('loading')
  const [stampsFilled, setStampsFilled] = useState(0)
  const animRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Fetch store data on mount ──────────────────────────────────────────────
  useEffect(() => {
    const r = signupRef.get()
    if (r) setRef(r)

    async function loadStore() {
      // Use session cache when navigating back within the funnel
      const cached = signupStore.get()
      if (cached && cached.storeKey === storeKey) {
        setStore(cached)
        setPageState('ready')
        return
      }

      try {
        const res = await fetch(`/api/join/${storeKey}`)
        if (!res.ok) {
          setPageState('error')
          return
        }
        const data: SignupStore = await res.json()
        signupStore.set(data)
        setStore(data)
        setPageState('ready')
      } catch {
        setPageState('error')
      }
    }

    loadStore()
  }, [storeKey])

  // ── Stamp animation — starts only once store is ready ─────────────────────
  useEffect(() => {
    if (pageState !== 'ready') return
    let count = 0
    function fillNext() {
      count++
      setStampsFilled(count)
      if (count < 20) {
        animRef.current = setTimeout(fillNext, count < 10 ? 60 : 40)
      }
    }
    animRef.current = setTimeout(fillNext, 400)
    return () => { if (animRef.current) clearTimeout(animRef.current) }
  }, [pageState])

  // ── Loading ────────────────────────────────────────────────────────────────
  if (pageState === 'loading') {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#F5F5F8]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-4 border-[#4A4B98] border-t-transparent animate-spin" />
          <p className="text-[14px] font-semibold text-[#8E8EA8] font-['Montserrat']">Loading…</p>
        </div>
      </div>
    )
  }

  // ── Error / store not found ────────────────────────────────────────────────
  if (pageState === 'error' || !store) {
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

  // ── Ready ──────────────────────────────────────────────────────────────────
  const textColor        = headerTextColor(store.brandColor)
  const textOpacity      = textColor === '#FFFFFF' ? 'rgba(255,255,255,0.75)' : 'rgba(26,26,46,0.65)'
  const textOpacityStrong = textColor === '#FFFFFF' ? 'rgba(255,255,255,0.92)' : 'rgba(26,26,46,0.9)'

  function handleJoin() {
    router.push(`/member/join/${storeKey}/signup`)
  }

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">

      {/* ── Referral banner ── */}
      {ref && (
        <div className="bg-[#2A7D34] px-4 py-3 flex items-center gap-3">
          <span className="text-xl flex-shrink-0">🎁</span>
          <p className="text-[13px] font-semibold text-white leading-snug">
            <span className="font-bold">{ref.referrerFirstName}</span> invited you!
            {' '}Join free and you both earn bonus stamps.
          </p>
        </div>
      )}

      {/* ── Hero — full white-label branding ── */}
      <div
        className="flex flex-col items-center px-5 pt-10 pb-12 gap-6"
        style={{ backgroundColor: store.brandColor, color: textColor }}
      >
        {/* Store logo + name */}
        <div className="flex flex-col items-center gap-3">
          {store.logoUrl ? (
            <div className="w-20 h-20 rounded-full bg-white overflow-hidden shadow-lg">
              <Image
                src={store.logoUrl}
                alt={`${store.brandName} logo`}
                width={80} height={80}
                className="object-cover w-full h-full"
              />
            </div>
          ) : (
            <div
              className="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-lg"
            >
              <span
                className="font-['Coiny'] text-3xl leading-none"
                style={{ color: store.brandColor }}
              >
                {storeInitials(store.brandName)}
              </span>
            </div>
          )}
          <h1 className="font-['Coiny'] text-4xl tracking-wide leading-none text-center">
            {store.brandName}
          </h1>
          <p className="text-[13px] font-semibold tracking-wide" style={{ color: textOpacity }}>
            Rewards Program
          </p>
        </div>

        {/* ── Stamp grid — the signature element ── */}
        <div className="flex flex-col items-center gap-3 w-full max-w-xs">
          <div className="grid grid-cols-10 gap-2 w-full">
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className={`
                  aspect-square rounded-full border-2 flex items-center justify-center
                  transition-all duration-150
                  ${i < stampsFilled
                    ? 'border-white bg-white'
                    : 'border-white/30 bg-white/10'
                  }
                `}
                style={i < stampsFilled ? { transitionDelay: '0ms' } : undefined}
              >
                {i < stampsFilled && (
                  <span style={{ color: store.brandColor }} className="text-[10px] font-black">★</span>
                )}
              </div>
            ))}
          </div>
          <p className="text-[12px] font-bold tracking-widest uppercase" style={{ color: textOpacity }}>
            20 stamps = your first reward
          </p>
        </div>

        {/* Join CTA */}
        <button
          onClick={handleJoin}
          className="w-full max-w-xs py-5 rounded-2xl font-bold text-[18px] font-['Montserrat'] tracking-wide shadow-lg active:scale-[0.97] transition-transform"
          style={{ backgroundColor: textColor, color: store.brandColor }}
        >
          {ref ? 'Claim Your Bonus & Join Free' : 'Join Free — Start Earning'}
        </button>

        <p
          className="text-[11px] font-medium text-center"
          style={{ color: textOpacity }}
        >
          Free to join · No app download needed
        </p>
      </div>

      {/* ── Already a member? ── */}
      <div className="px-5 pt-6 pb-0 max-w-md mx-auto w-full text-center">
        <p className="text-[13px] text-[#8E8EA8] font-medium">
          Already a member?{' '}
          <a
            href={`/member/login/${storeKey}`}
            className="font-bold underline"
            style={{ color: store.brandColor }}
          >
            Sign in →
          </a>
        </p>
      </div>

      {/* ── How it works ── */}
      <div className="px-5 py-10 flex flex-col gap-6 max-w-md mx-auto w-full">
        <h2 className="font-['Coiny'] text-2xl text-[#1A1A2E] text-center">How it works</h2>

        <div className="flex flex-col gap-4">
          {[
            {
              icon: '📱',
              title: 'Sign up in 30 seconds',
              body: 'Just your name and number — no app, no download, no passwords.',
            },
            {
              icon: '🏷️',
              title: 'Get stamped every visit',
              body: 'Give your number at the register. That\'s it. One stamp per day.',
            },
            {
              icon: '🎟️',
              title: 'Earn coupons to spend here',
              body: 'Hit 20 stamps and you\'ll earn a coupon to use on your next visit. Bigger rewards as you level up.',
            },
          ].map((step, i) => (
            <div key={i} className="flex gap-4 items-start">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 text-2xl"
                style={{ backgroundColor: `${store.brandColor}18` }}>
                {step.icon}
              </div>
              <div>
                <p className="text-[15px] font-bold text-[#1A1A2E] mb-0.5">{step.title}</p>
                <p className="text-[13px] text-[#8E8EA8] font-medium leading-relaxed">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Referral benefit callout ── */}
      {ref && (
        <div className="mx-5 mb-8 bg-green-50 border-2 border-green-200 rounded-2xl p-5 max-w-md mx-auto w-full">
          <p className="font-['Coiny'] text-xl text-[#1A1A2E] mb-1">You were referred! 🎉</p>
          <p className="text-[13px] text-[#8E8EA8] font-medium leading-relaxed">
            Join today and <strong className="text-[#1A1A2E]">{ref.referrerFirstName}</strong> earns
            {' '}2 bonus stamps as a thank-you. You'll get a head start on your first reward.
          </p>
        </div>
      )}

      {/* ── Level-up teaser ── */}
      <div className="px-5 pb-10 max-w-md mx-auto w-full">
        <div
          className="rounded-2xl p-5 flex flex-col gap-2"
          style={{ backgroundColor: `${store.brandColor}12`, borderColor: `${store.brandColor}30`, border: '1.5px solid' }}
        >
          <p className="font-['Coiny'] text-xl" style={{ color: store.brandColor }}>
            Bigger rewards as you level up
          </p>
          <p className="text-[13px] text-[#8E8EA8] font-medium leading-relaxed">
            The more you shop, the faster you earn — and the bigger your coupons get.
            VIP members unlock even more perks.
          </p>
          <button
            onClick={handleJoin}
            className="mt-1 text-[14px] font-bold self-start"
            style={{ color: store.brandColor }}
          >
            Start earning today →
          </button>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="px-5 pb-8 text-center">
        <p className="text-[10px] text-[#8E8EA8] font-medium">
          Powered by BinPerks · <a href="mailto:support@binperks.com" className="underline">support@binperks.com</a>
        </p>
      </div>
    </div>
  )
}
