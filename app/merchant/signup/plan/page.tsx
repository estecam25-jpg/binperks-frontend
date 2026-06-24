'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  merchantSignupForm,
  calculateMonthlyTotal, formatPrice,
  MERCHANT_BASE_PRICE, MERCHANT_EXTRA_LOCATION_PRICE,
  type MerchantSignupForm,
} from '@/lib/merchant-signup-session'

export default function MerchantPlanPage() {
  const router = useRouter()
  const [form, setForm] = useState<MerchantSignupForm | null>(null)
  const [locationCount, setLocationCount] = useState(1)
  const [checkingOut, setCheckingOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const saved = merchantSignupForm.get()
    if (!saved) { router.replace('/merchant/signup/apply'); return }
    setForm(saved)
    setLocationCount(saved.locationCount)
  }, [router])

  if (!form) return null

  const isMulti = locationCount > 1
  const monthlyTotal = calculateMonthlyTotal(locationCount)
  const additionalLocations = locationCount - 1

  async function handleCheckout() {
    if (!form || checkingOut) return
    setCheckingOut(true)
    setError(null)

    // Save updated location count back to form
    const updatedForm = { ...form, locationCount }
    merchantSignupForm.set(updatedForm)

    const res = await fetch('/api/merchant/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedForm),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Something went wrong. Please try again.')
      setCheckingOut(false)
      return
    }

    // Redirect to Stripe Checkout
    if (data.checkoutUrl) {
      window.location.href = data.checkoutUrl
    } else {
      setError('Could not start checkout. Please try again.')
      setCheckingOut(false)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">

      {/* Header */}
      <div className="bg-[#1A1A2E] px-5 py-3 flex items-center gap-3">
        <button onClick={() => router.push('/merchant/signup/apply')}
          className="text-white/60 text-[22px] leading-none" aria-label="Back">←</button>
        <span className="font-['Coiny'] text-xl text-white leading-none">Your Plan</span>
      </div>

      <main className="flex-1 flex flex-col items-center px-4 py-8 pb-16 gap-5 max-w-lg mx-auto w-full">

        {/* Plan summary header */}
        <div className="w-full text-center">
          <p className="font-['Coiny'] text-3xl text-[#1A1A2E] mb-1">
            {isMulti ? 'Multi-Location Plan' : 'Single Location Plan'}
          </p>
          <p className="text-[13px] text-[#8E8EA8] font-medium">
            {form.storeName} · {form.city}, {form.state}
          </p>
        </div>

        {/* ── Live pricing calculator — the signature element ── */}
        <div className="w-full bg-white rounded-2xl shadow-sm overflow-hidden">

          {/* Location count adjuster (multi-location only) */}
          {isMulti && (
            <div className="px-5 py-4 border-b border-[#EBEBF2]">
              <p className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#8E8EA8] mb-3">
                Adjust location count
              </p>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setLocationCount(c => Math.max(1, c - 1))}
                  disabled={locationCount <= 1}
                  className="w-10 h-10 rounded-xl bg-[#F5F5F8] text-[#1A1A2E] text-xl font-bold flex items-center justify-center disabled:opacity-30 active:bg-[#EBEBF2] transition-colors"
                >
                  −
                </button>
                <div className="flex-1 text-center">
                  <span className="font-['Coiny'] text-4xl text-[#1A1A2E]">{locationCount}</span>
                  <span className="text-[14px] font-semibold text-[#8E8EA8] ml-2">
                    location{locationCount > 1 ? 's' : ''}
                  </span>
                </div>
                <button
                  onClick={() => setLocationCount(c => Math.min(20, c + 1))}
                  className="w-10 h-10 rounded-xl bg-[#F5F5F8] text-[#1A1A2E] text-xl font-bold flex items-center justify-center active:bg-[#EBEBF2] transition-colors"
                >
                  +
                </button>
              </div>
            </div>
          )}

          {/* Transparent math breakdown */}
          <div className="px-5 py-5 flex flex-col gap-3">
            <p className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#8E8EA8]">
              Monthly breakdown
            </p>

            <div className="flex items-center justify-between">
              <span className="text-[14px] font-semibold text-[#8E8EA8]">
                First location
              </span>
              <span className="text-[14px] font-bold text-[#1A1A2E]">
                {formatPrice(MERCHANT_BASE_PRICE)}
              </span>
            </div>

            {locationCount > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold text-[#8E8EA8]">
                  {additionalLocations} additional location{additionalLocations > 1 ? 's' : ''}
                  {' '}× {formatPrice(MERCHANT_EXTRA_LOCATION_PRICE)}
                </span>
                <span className="text-[14px] font-bold text-[#1A1A2E]">
                  {formatPrice(additionalLocations * MERCHANT_EXTRA_LOCATION_PRICE)}
                </span>
              </div>
            )}

            {/* Total — updates live */}
            <div className="flex items-center justify-between pt-3 border-t-2 border-[#1A1A2E]">
              <span className="text-[15px] font-bold text-[#1A1A2E]">Monthly total</span>
              <span
                className="font-['Coiny'] text-3xl text-[#4A4B98] transition-all duration-200"
                key={monthlyTotal}  // remount to re-trigger transition on change
              >
                {formatPrice(monthlyTotal)}<span className="text-[16px] text-[#8E8EA8]">/mo</span>
              </span>
            </div>
          </div>
        </div>

        {/* What's included */}
        <div className="w-full bg-white rounded-2xl shadow-sm px-5 py-5">
          <p className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#8E8EA8] mb-3">
            What you get
          </p>
          <div className="flex flex-col gap-2">
            {[
              'Full loyalty platform — stamps, coupons, tiers',
              'Automated SMS follow-up via BinPerks',
              'Cashier stamp tool (tablet or phone)',
              'Member dashboard for your customers',
              'Weekly email reports',
              'QR code signage (BinPerks provisions)',
              isMulti ? `Aggregate dashboard across all ${locationCount} locations` : 'Add more locations anytime at +$79.99/mo',
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="text-[#4A4B98] font-bold text-[13px] flex-shrink-0 mt-0.5">✓</span>
                <p className="text-[13px] font-medium text-[#1A1A2E]">{item}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Multi-location escape hatch */}
        {isMulti && (
          <div className="w-full bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-start gap-3">
            <span className="text-lg flex-shrink-0">💡</span>
            <div>
              <p className="text-[12px] font-semibold text-amber-800 leading-snug">
                You can start with 1 location and add more later from your dashboard
                at +${MERCHANT_EXTRA_LOCATION_PRICE}/mo each.
              </p>
              <button
                onClick={() => setLocationCount(1)}
                className="text-[12px] font-bold text-amber-800 underline mt-1"
              >
                Start with 1 location instead
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="w-full bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
            <p className="text-[13px] font-semibold text-[#DA1212]">{error}</p>
          </div>
        )}

        {/* Checkout button */}
        <button
          onClick={handleCheckout}
          disabled={checkingOut}
          className="w-full py-5 rounded-2xl font-bold text-[17px] text-white font-['Montserrat'] bg-[#4A4B98] disabled:opacity-60 active:scale-[0.97] transition-all tracking-wide flex items-center justify-center gap-2"
        >
          {checkingOut && (
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          )}
          {checkingOut
            ? 'Redirecting to payment…'
            : `Start for ${formatPrice(monthlyTotal)}/mo`
          }
        </button>

        <p className="text-[11px] text-[#8E8EA8] text-center font-medium">
          Billed monthly via Stripe · Cancel anytime · No setup fees
        </p>
      </main>
    </div>
  )
}
