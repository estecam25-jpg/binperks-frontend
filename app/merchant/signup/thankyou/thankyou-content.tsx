'use client'

import { useEffect, useState } from 'react'
import {
  merchantSignupForm,
  calculateRecurringMonthlyTotal,
  formatPrice,
  MERCHANT_SETUP_FEE,
} from '@/lib/merchant-signup-session'

export interface ThankYouContentProps {
  /** Real amount_total from the Stripe checkout session, in dollars. Null if
   *  the session could not be read (missing/expired session_id). */
  chargedToday: number | null
  /** locationCount from the Stripe session metadata — survives a different
   *  browser or tab, unlike sessionStorage. Null if unavailable. */
  locationCountFromStripe: number | null
  /** True when a promotion code reduced the total. Which codes exist, and what
   *  each discounts, is configured in Stripe — never named here. */
  discountApplied: boolean
  /** The Stripe checkout session id from the success URL — what the status
   *  poll uses to find this merchant's signing link. Null if absent. */
  sessionId: string | null
}

type SignState = 'waiting' | 'ready' | 'active' | 'slow'

/** How long to keep polling before telling the merchant it is taking a while.
 *  Polling carries on in the background regardless. */
const SLOW_AFTER_MS = 60_000
const POLL_MS = 2_500

/**
 * The step that matters now: signing the Merchant Agreement.
 *
 * Polls until the signing session is open, then takes the merchant to it. A
 * merchant who closes this tab has not lost anything — signing in to the
 * dashboard later brings them back to the same agreement.
 */
function SignAgreementStep({ sessionId }: { sessionId: string | null }) {
  const [state, setState] = useState<SignState>(sessionId ? 'waiting' : 'slow')
  const [signUrl, setSignUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) return
    let stopped = false
    const started = Date.now()

    const tick = () => {
      if (stopped) return
      fetch(`/api/merchant/signup/status?session_id=${encodeURIComponent(sessionId)}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (stopped) return
          if (d?.state === 'ready' && d.signUrl) {
            setSignUrl(d.signUrl)
            setState('ready')
            // Straight there — the merchant came to finish signing up.
            window.location.href = d.signUrl
            return
          }
          if (d?.state === 'active') { setState('active'); return }
          if (Date.now() - started > SLOW_AFTER_MS) setState('slow')
          setTimeout(tick, POLL_MS)
        })
        .catch(() => { if (!stopped) setTimeout(tick, POLL_MS) })
    }
    tick()
    return () => { stopped = true }
  }, [sessionId])

  return (
    <div className="w-full bg-white rounded-2xl shadow-xl px-5 py-5 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-xl flex-shrink-0">
          ✍️
        </div>
        <div className="flex-1">
          <p className="text-[15px] font-bold text-[#1A1A2E]">
            {state === 'active' ? 'Agreement signed' : 'Next: sign your Merchant Agreement'}
          </p>
          <p className="text-[12px] text-[#8E8EA8] font-medium">
            {state === 'active'
              ? 'Your account is active. Sign in to your dashboard.'
              : 'Your account goes live as soon as it is signed.'}
          </p>
        </div>
      </div>

      {state === 'active' ? (
        <a href="/merchant/login" className="w-full py-3.5 rounded-xl font-bold text-[14px] text-white bg-[#4A4B98] text-center">
          Go to your dashboard →
        </a>
      ) : state === 'ready' && signUrl ? (
        <a href={signUrl} className="w-full py-3.5 rounded-xl font-bold text-[14px] text-white bg-[#4A4B98] text-center">
          Sign your agreement →
        </a>
      ) : (
        <div className="flex items-center gap-3 bg-[#F5F5F8] rounded-xl px-4 py-3">
          <span className="w-5 h-5 border-[3px] border-[#EBEBF2] border-t-[#4A4B98] rounded-full animate-spin flex-shrink-0" />
          <p className="text-[12px] text-[#8E8EA8] font-medium leading-relaxed text-left">
            {state === 'slow'
              ? <>This is taking longer than usual. You can also sign in to your dashboard with the email you used — it will take you to your agreement. Or email <a href="mailto:support@binperks.com" className="text-[#4A4B98] font-semibold underline">support@binperks.com</a>.</>
              : 'Preparing your agreement…'}
          </p>
        </div>
      )}
    </div>
  )
}

export default function ThankYouContent({
  chargedToday,
  locationCountFromStripe,
  discountApplied,
  sessionId,
}: ThankYouContentProps) {
  const [companyName, setCompanyName] = useState('')
  const [storeName, setStoreName] = useState('')
  const [ownerFirstName, setOwnerFirstName] = useState('')
  const [locationCountFromForm, setLocationCountFromForm] = useState<number | null>(null)

  useEffect(() => {
    const form = merchantSignupForm.get()
    if (form) {
      setCompanyName(form.companyName)
      setStoreName(form.storeName)
      setOwnerFirstName(form.firstName)
      setLocationCountFromForm(form.locationCount)
    }
  }, [])

  // Stripe metadata is authoritative; sessionStorage is the fallback when the
  // merchant lands here without a readable session (or in a different browser).
  const locationCount = locationCountFromStripe ?? locationCountFromForm ?? 1

  const recurringTotal = calculateRecurringMonthlyTotal(locationCount)

  // What Stripe actually charged, falling back to the list-price estimate:
  // month one is the one-time setup fee on top of the ordinary monthly total.
  const chargedAmount = chargedToday ?? MERCHANT_SETUP_FEE + recurringTotal

  const nextBillingDate = (() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  })()

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">

      {/* Dark hero — confident, done */}
      <div className="bg-[#1A1A2E] px-6 pt-16 pb-24 flex flex-col items-center gap-4 text-center">
        <div className="w-16 h-16 rounded-full bg-[#FFB217]/20 flex items-center justify-center text-3xl">
          🎉
        </div>
        <h1 className="font-['Coiny'] text-4xl text-white leading-tight">
          {ownerFirstName ? `Welcome aboard, ${ownerFirstName}!` : "You're in!"}
        </h1>
        <p className="text-[14px] text-white/70 font-medium leading-relaxed max-w-sm">
          Payment received. One more step: sign your Merchant Agreement and
          {storeName ? ` ${storeName}` : ' your store'} joins the BinPerks network.
        </p>
      </div>

      <div className="flex-1 flex flex-col items-center px-4 -mt-10 pb-16 gap-5 max-w-lg mx-auto w-full">

        {/* First, above the receipt: the one thing the merchant still has to do. */}
        <SignAgreementStep sessionId={sessionId} />

        {/* Subscription confirmation card */}
        <div className="w-full bg-white rounded-2xl shadow-xl px-5 py-5 flex flex-col gap-4">
          <div className="flex items-center gap-3 pb-3 border-b border-[#EBEBF2]">
            <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-xl flex-shrink-0">
              ✅
            </div>
            <div>
              <p className="text-[14px] font-bold text-[#1A1A2E]">Payment confirmed</p>
              <p className="text-[12px] text-[#8E8EA8] font-medium">Your account activates once your agreement is signed</p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <span className="text-[13px] text-[#8E8EA8] font-medium">Charged today</span>
              <span className="text-[13px] font-bold text-[#1A1A2E]">{formatPrice(chargedAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[13px] text-[#8E8EA8] font-medium">Then from {nextBillingDate}</span>
              <span className="text-[13px] font-bold text-[#1A1A2E]">{formatPrice(recurringTotal)}/mo</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[13px] text-[#8E8EA8] font-medium">Business</span>
              <span className="text-[13px] font-bold text-[#1A1A2E]">{companyName || '—'}</span>
            </div>
          </div>

          <div className="bg-[#F5F5F8] rounded-xl px-4 py-3">
            <p className="text-[11px] text-[#8E8EA8] font-medium leading-relaxed">
              {discountApplied ? (
                <>
                  A promotional discount was applied to this first charge.
                </>
              ) : (
                <>
                  Your first charge includes the one-time {formatPrice(MERCHANT_SETUP_FEE)}{' '}
                  setup fee.
                </>
              )}
              {' '}Billing moves to {formatPrice(recurringTotal)}/mo automatically from{' '}
              {nextBillingDate} — nothing for you to do.
            </p>
          </div>
        </div>

        {/* Next steps */}
        <div className="w-full bg-white rounded-2xl shadow-sm px-5 py-5 flex flex-col gap-4">
          <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">What happens next</h2>

          <div className="flex flex-col gap-4">
            {[
              {
                icon: '✍️',
                title: 'Sign your Merchant Agreement',
                body: 'Right here in the app. Your account and your store go live the moment it is signed.',
                timing: 'Now',
              },
              {
                icon: '🔑',
                title: 'Sign in to your dashboard',
                body: 'Use the email you signed up with — we send you a sign-in code, no password needed.',
                timing: 'After signing',
              },
              {
                icon: '🎨',
                title: 'BinPerks provisions your store',
                body: 'We\'ll configure your store logo, brand colors, QR code, and cashier PINs. We may reach out for your logo file.',
                timing: 'Within 1 business day',
              },
              {
                icon: '📲',
                title: 'You go live',
                body: 'Once provisioned, print your QR code signage, brief your cashiers, and start earning stamps from day one.',
                timing: 'Day 1',
              },
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-xl flex-shrink-0">
                  {step.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <p className="text-[14px] font-bold text-[#1A1A2E]">{step.title}</p>
                    <span className="text-[10px] font-bold tracking-wide uppercase text-[#4A4B98] bg-indigo-50 px-2 py-0.5 rounded-full">
                      {step.timing}
                    </span>
                  </div>
                  <p className="text-[12px] text-[#8E8EA8] font-medium leading-relaxed">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Help */}
        <div className="w-full bg-white rounded-2xl shadow-sm px-5 py-4">
          <p className="text-[13px] font-bold text-[#1A1A2E] mb-1">Questions?</p>
          <p className="text-[12px] text-[#8E8EA8] font-medium leading-relaxed">
            Email us at{' '}
            <a href="mailto:support@binperks.com" className="text-[#4A4B98] font-semibold underline">
              support@binperks.com
            </a>
            {' '}or reply to your confirmation email. We&apos;re quick to respond.
          </p>
        </div>
      </div>
    </div>
  )
}
