/**
 * JoinLanding — client component for the member join landing page.
 *
 * This is where referral links and QR codes land, and it is a BinPerks
 * surface: BinPerks blue, the BinPerks wordmark, Coiny headings. A member is
 * joining the network, not one store's own loyalty program, and the page has
 * to read that way before they sign up — otherwise the membership looks
 * store-scoped from the first screen.
 *
 * The store still appears, as context ("You were invited to shop at …"), and
 * nothing about Origin Store attribution changes: storeId and merchantId are
 * still passed through to signup exactly as before.
 *
 * Store branding is still received as props and still cached to
 * sessionStorage — the child funnel pages (signup → vip → thankyou) read it
 * from there. It just isn't rendered here.
 */

'use client'

import { useEffect } from 'react'

import { useRouter } from 'next/navigation'
import { signupStore, signupRef, type SignupRef } from '@/lib/signup-session'
import { useStampFill } from '@/lib/use-stamp-fill'

/** The only brand color on this page. */
const BINPERKS_BLUE = '#4A4B98'

interface Props {
  storeKey:          string
  storeId:           string
  merchantId:        string
  storeName:         string
  brandColor:        string
  brandName:         string
  logoUrl:           string | null
  googleReviewUrl:   string | null
  facebookReviewUrl: string | null
  city:              string | null
  state:             string | null
  referrer: {
    code:              string
    referrerMemberId:  string
    referrerFirstName: string
  } | null
}

export default function JoinLanding({
  storeKey,
  storeId,
  merchantId,
  storeName,
  brandColor,
  brandName,
  logoUrl,
  googleReviewUrl,
  facebookReviewUrl,
  city,
  state,
  referrer,
}: Props) {
  const router = useRouter()
  // The full 20 — this card is a demo of what a completed card looks like, not
  // anyone's real progress. Same hook the member dashboard uses, so the two
  // animations cannot drift apart.
  const stampsFilled = useStampFill(20)

  // Cache store + referral in sessionStorage on mount so child pages can read them
  useEffect(() => {
    signupStore.set({
      id:               storeId,
      storeKey,
      storeName,
      brandName,
      brandColor,
      logoUrl,
      merchantId,
      googleReviewUrl,
      facebookReviewUrl,
    })
    if (referrer) {
      signupRef.set(referrer as SignupRef)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Track first join page visit for merchant onboarding checklist
  useEffect(() => {
    if (!storeId) return
    fetch('/api/merchant/store', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId, joinPageVisited: true }),
    }).catch(() => {})
  }, [storeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // No store Google Font is loaded here any more. Headings on a BinPerks
  // surface are Coiny, which merchants are not permitted to use — loading the
  // store's font would put merchant type on a BinPerks page.

  // Fixed against BinPerks blue rather than derived from a store color.
  const textOpacity  = 'rgba(255,255,255,0.75)'
  const locationLine = [city, state].filter(Boolean).join(', ')

  // The store is context, not the headline. Referral arrivals get the phrasing
  // that matches how they got here.
  const storeContext = referrer
    ? `You were invited to shop at ${storeName}`
    : `You're joining at ${storeName}`

  function handleJoin() {
    // The referrer rides in the URL rather than relying on the sessionStorage
    // the layout primes: a member who lands here with private storage blocked,
    // or who opens the signup step directly, still gets credited.
    const qs = referrer
      ? `?referrer=${encodeURIComponent(referrer.referrerMemberId)}`
      : ''
    router.push(`/member/join/${storeKey}/signup${qs}`)
  }

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">

      {/* Referral banner */}
      {referrer && (
        <div className="bg-[#2A7D34] px-4 py-3 flex items-center gap-3">
          <span className="text-xl flex-shrink-0">🎁</span>
          <p className="text-[13px] font-semibold text-white leading-snug">
            <span className="font-bold">{referrer.referrerFirstName}</span> invited you!
            {' '}Join free and you both earn bonus stamps.
          </p>
        </div>
      )}

      {/* Hero — BinPerks is the brand being joined. */}
      <div
        className="flex flex-col items-center px-5 pt-10 pb-12 gap-6"
        style={{ backgroundColor: BINPERKS_BLUE, color: '#FFFFFF' }}
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="font-['Coiny'] text-5xl tracking-wide leading-none text-white">
            BinPerks
          </h1>
          <p className="text-[13px] font-semibold tracking-wide" style={{ color: textOpacity }}>
            One membership. Every participating store.
          </p>

          {/* Store context — the location they arrived through, not the brand
              they're joining. */}
          <div className="mt-3 rounded-full bg-white/15 px-4 py-2">
            <p className="text-[13px] font-semibold text-white leading-snug">
              {storeContext}
            </p>
            {locationLine && (
              <p className="text-[11px] font-medium" style={{ color: textOpacity }}>
                {locationLine}
              </p>
            )}
          </div>
        </div>

        {/* Stamp grid */}
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
                  <span style={{ color: BINPERKS_BLUE }} className="text-[10px] font-black">★</span>
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
          style={{ backgroundColor: '#FFFFFF', color: BINPERKS_BLUE }}
        >
          {referrer ? 'Claim Your Bonus & Join Free' : 'Join Free — Start Earning'}
        </button>

        <p
          className="text-[11px] font-medium text-center"
          style={{ color: textOpacity }}
        >
          Free to join · No app download needed
        </p>
      </div>

      {/* Already a member? */}
      <div className="px-5 pt-6 pb-0 max-w-md mx-auto w-full text-center">
        <p className="text-[13px] text-[#8E8EA8] font-medium">
          Already a member?{' '}
          <a
            href={`/member/login/${storeKey}`}
            className="font-bold underline"
            style={{ color: BINPERKS_BLUE }}
          >
            Sign in →
          </a>
        </p>
      </div>

      {/* How it works */}
      <div className="px-5 py-10 flex flex-col gap-6 max-w-md mx-auto w-full">
        <h2 className="font-['Coiny'] text-2xl text-[#1A1A2E] text-center">
          How it works
        </h2>
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
              body: "Give your number at the register. That's it. One stamp per day.",
            },
            {
              icon: '🎟️',
              title: 'Earn coupons you can spend anywhere',
              body: "Hit 20 stamps and you'll earn a coupon, good at any participating BinPerks store. Bigger rewards as you level up.",
            },
          ].map((step, i) => (
            <div key={i} className="flex gap-4 items-start">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 text-2xl"
                style={{ backgroundColor: `${BINPERKS_BLUE}18` }}
              >
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

      {/* Referral benefit callout */}
      {referrer && (
        <div className="mx-5 mb-8 bg-green-50 border-2 border-green-200 rounded-2xl p-5 max-w-md mx-auto w-full">
          <p className="font-['Coiny'] text-xl text-[#1A1A2E] mb-1">You were referred! 🎉</p>
          <p className="text-[13px] text-[#8E8EA8] font-medium leading-relaxed">
            Join today and <strong className="text-[#1A1A2E]">{referrer.referrerFirstName}</strong> earns
            {' '}2 bonus stamps as a thank-you. You&apos;ll get a head start on your first reward.
          </p>
        </div>
      )}

      {/* Level-up teaser */}
      <div className="px-5 pb-10 max-w-md mx-auto w-full">
        <div
          className="rounded-2xl p-5 flex flex-col gap-2"
          style={{ backgroundColor: `${BINPERKS_BLUE}12`, border: `1.5px solid ${BINPERKS_BLUE}30` }}
        >
          <p className="font-['Coiny'] text-xl" style={{ color: BINPERKS_BLUE }}>
            Bigger rewards as you level up
          </p>
          <p className="text-[13px] text-[#8E8EA8] font-medium leading-relaxed">
            The more you shop, the faster you earn — and the bigger your coupons get.
            VIP members unlock even more perks.
          </p>
          <button
            onClick={handleJoin}
            className="mt-1 text-[14px] font-bold self-start"
            style={{ color: BINPERKS_BLUE }}
          >
            Start earning today →
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 pb-8 text-center">
        <p className="text-[10px] text-[#8E8EA8] font-medium">
          Powered by BinPerks ·{' '}
          <a href="mailto:support@binperks.com" className="underline">support@binperks.com</a>
        </p>
      </div>
    </div>
  )
}
