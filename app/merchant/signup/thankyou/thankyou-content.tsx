'use client'

import { useEffect, useState } from 'react'
import {
  merchantSignupForm,
  calculateFirstMonthTotal,
  calculateRecurringMonthlyTotal,
  formatPrice,
  MERCHANT_IMPLEMENTATION_PRICE,
} from '@/lib/merchant-signup-session'

export interface ThankYouContentProps {
  /** Real amount_total from the Stripe checkout session, in dollars. Null if
   *  the session could not be read (missing/expired session_id). */
  chargedToday: number | null
  /** locationCount from the Stripe session metadata — survives a different
   *  browser or tab, unlike sessionStorage. Null if unavailable. */
  locationCountFromStripe: number | null
  /** True when a promotion code (e.g. FOUNDING100) reduced the total. */
  discountApplied: boolean
}

export default function ThankYouContent({
  chargedToday,
  locationCountFromStripe,
  discountApplied,
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

  // What Stripe actually charged, falling back to the list-price estimate.
  const chargedAmount = chargedToday ?? calculateFirstMonthTotal(locationCount)
  const recurringTotal = calculateRecurringMonthlyTotal(locationCount)

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
          {storeName ? `${storeName} is now part of the BinPerks network.` : 'Your store is now part of the BinPerks network.'}
          {' '}We&apos;ll get you set up and running within 1 business day.
        </p>
      </div>

      <div className="flex-1 flex flex-col items-center px-4 -mt-10 pb-16 gap-5 max-w-lg mx-auto w-full">

        {/* Subscription confirmation card */}
        <div className="w-full bg-white rounded-2xl shadow-xl px-5 py-5 flex flex-col gap-4">
          <div className="flex items-center gap-3 pb-3 border-b border-[#EBEBF2]">
            <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-xl flex-shrink-0">
              ✅
            </div>
            <div>
              <p className="text-[14px] font-bold text-[#1A1A2E]">Payment confirmed</p>
              <p className="text-[12px] text-[#8E8EA8] font-medium">BinPerks subscription active</p>
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
                  Your promo code was applied — the {formatPrice(MERCHANT_IMPLEMENTATION_PRICE)}{' '}
                  Implementation &amp; Launch fee is discounted on this first charge.
                </>
              ) : (
                <>
                  Your first month includes the one-time {formatPrice(MERCHANT_IMPLEMENTATION_PRICE)}{' '}
                  Implementation &amp; Launch fee.
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
                icon: '📧',
                title: 'Check your email',
                body: 'A sign-in link is on its way to your inbox. Use it to access your merchant dashboard.',
                timing: 'Within minutes',
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
