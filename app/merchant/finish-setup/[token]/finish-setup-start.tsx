'use client'

/**
 * The finish-setup screen's own interactivity: one button, three states.
 *
 * The price shown is LIST PRICE and says so. A promo code is entered on
 * Stripe's page, where the real total is worked out — telling someone here
 * that they will pay $299.99 and then charging them $99.99 would be the same
 * mistake in reverse, so the number is labelled as "before any discount".
 *
 * The button disables itself on the first click. A double tap on a phone would
 * otherwise open two Stripe customers for one store.
 */

import { useState } from 'react'

interface Props {
  state: 'invalid' | 'ready' | 'started'
  token: string | null
  companyName: string
  storeName: string
  ownerName: string
  locationCount: number
}

const SETUP_FEE = 200
const PLATFORM  = 99.99
const LOCATION  = 49.99

export default function FinishSetupStart({
  state, token, companyName, storeName, ownerName, locationCount,
}: Props) {
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState<string | null>(null)

  const additional = Math.max(0, locationCount - 1)
  const dueToday   = SETUP_FEE + PLATFORM + additional * LOCATION
  const monthly    = PLATFORM + additional * LOCATION

  async function start() {
    if (!token || busy) return
    setBusy(true); setError(null)
    try {
      const res  = await fetch('/api/merchant/finish-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.checkoutUrl) {
        window.location.href = data.checkoutUrl
        return
      }
      setError(
        data.error === 'already_started'
          ? 'This store has already been set up. Check your email for the signing link.'
          : data.error === 'not_configured'
            ? 'Checkout is not configured. Contact BinPerks support.'
            : 'This link is no longer valid. Contact BinPerks support.',
      )
    } catch {
      setError('Something went wrong. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (state !== 'ready') {
    return (
      <Shell>
        <h1 className="font-['Coiny'] text-2xl text-[#1A1A2E]">
          {state === 'started' ? 'Setup already started' : 'Link not valid'}
        </h1>
        <p className="text-[14px] text-[#5A5A72] leading-relaxed mt-2">
          {state === 'started'
            ? 'This store has already started setup. Check your email for the link to sign your agreement, or contact BinPerks support.'
            : 'This setup link is no longer valid. It may have already been used, or the store may have been removed. Contact BinPerks support and we will send you a new one.'}
        </p>
        <p className="text-[13px] text-[#8E8EA8] mt-4">
          support@binperks.com
        </p>
      </Shell>
    )
  }

  return (
    <Shell>
      <h1 className="font-['Coiny'] text-2xl text-[#1A1A2E]">Finish setting up {storeName}</h1>
      <p className="text-[14px] text-[#5A5A72] leading-relaxed mt-2">
        {ownerName ? `${ownerName.split(' ')[0]}, your` : 'Your'} store is already built and your
        signs are printed. Two steps left: payment, then your agreement.
      </p>

      <div className="bg-[#F5F5F8] rounded-2xl px-4 py-4 mt-5 flex flex-col gap-2">
        <Row label="Business"  value={companyName} />
        <Row label="Store"     value={storeName} />
        {locationCount > 1 && <Row label="Locations" value={String(locationCount)} />}
        <div className="h-px bg-[#EBEBF2] my-1" />
        <Row label="One-time setup fee" value={`$${SETUP_FEE.toFixed(2)}`} />
        <Row label="Monthly" value={`$${monthly.toFixed(2)}/mo`} />
        <div className="h-px bg-[#EBEBF2] my-1" />
        <Row label="Due today" value={`$${dueToday.toFixed(2)}`} strong />
        <p className="text-[11px] text-[#8E8EA8] leading-snug mt-1">
          List price before any discount. If you have a promotion code, enter it on the
          payment page and the total will update there.
        </p>
      </div>

      <button
        onClick={start}
        disabled={busy}
        className="w-full mt-5 bg-[#4A4B98] text-white font-bold text-[15px] rounded-2xl py-4
                   hover:bg-[#3A3B78] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {busy ? 'Opening payment…' : 'Continue to payment'}
      </button>

      {error && (
        <p className="text-[13px] text-[#DA1212] font-bold text-center mt-3">{error}</p>
      )}

      <p className="text-[11px] text-[#8E8EA8] text-center mt-4 leading-snug">
        Step 1 of 2 · After payment you will sign the Merchant Agreement and W-9.
        Your store goes live the moment you sign.
      </p>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[12px] text-[#8E8EA8] font-medium">{label}</span>
      <span className={strong
        ? "font-['Coiny'] text-lg text-[#1A1A2E]"
        : 'text-[13px] font-bold text-[#1A1A2E] text-right'}>
        {value}
      </span>
    </div>
  )
}
