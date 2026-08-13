'use client'

/**
 * Merchant Settings — Pricing Schedule.
 *
 * A bin store's price changes by day of week (fresh restock Friday at $10,
 * down to $1 by Thursday), so members need to know what today costs before
 * they drive over. This is where the merchant publishes that.
 *
 * Per location. The Settings tab is already scoped to one store by the
 * location selector in MerchantNav, so this card just takes that storeId.
 *
 * Module scope, not nested inside SettingsTab: a component declared inside
 * another gets a fresh identity every render, React unmounts and remounts the
 * subtree, and every price input loses focus after one keystroke. That exact
 * bug was fixed in the Perks tab (8b422a3) and is not being reintroduced here.
 */

import { useEffect, useState } from 'react'
import {
  WEEK_ORDER, formatPrice,
  type DayName, type PricingSchedule, type TodayPrice,
} from '@/lib/store-pricing'

const DAY_LABEL: Record<DayName, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
}

/** Prices are held as strings while editing so a half-typed "1." does not get
 *  coerced to a number and fight the cursor. Converted on save. */
type DayInputs = Partial<Record<DayName, string>>

export default function PricingScheduleCard({ storeId }: { storeId: string | null }) {
  const [prices,   setPrices]   = useState<DayInputs>({})
  const [restock,  setRestock]  = useState<DayName[]>([])
  const [ovPrice,  setOvPrice]  = useState('')
  const [ovLabel,  setOvLabel]  = useState('')
  const [ovExpiry, setOvExpiry] = useState('')

  const [today,  setToday]  = useState<TodayPrice | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [error,  setError]  = useState('')

  /**
   * Loading is DERIVED, not stored: the card is loading exactly while the
   * fields on screen belong to a different store than the one selected.
   *
   * Storing it would mean a setLoading(true) in the effect body, which
   * cascades an extra render (react-hooks/set-state-in-effect) — and it also
   * gets the location-selector case wrong, showing the previous store's prices
   * for a frame before the skeleton appears.
   */
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const loading = !!storeId && loadedFor !== storeId

  useEffect(() => {
    if (!storeId) return

    // The Settings tab has a location selector above it. Switching stores
    // twice quickly must not let the first response land on the second store.
    let cancelled = false

    fetch(`/api/merchant/store?storeId=${storeId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled) return
        if (d) applyResponse(d)
        setLoadedFor(storeId)
      })
      // A failed load still clears the skeleton — empty fields the merchant
      // can retype beat a spinner that never resolves.
      .catch(() => { if (!cancelled) setLoadedFor(storeId) })

    return () => { cancelled = true }

    function applyResponse(d: {
      pricingSchedule?: PricingSchedule
      restockDays?: string[]
      todayPrice?: TodayPrice | null
    }) {
      const sched = d.pricingSchedule ?? {}
      const next: DayInputs = {}
      for (const day of WEEK_ORDER) {
        const v = sched[day]
        next[day] = typeof v === 'number' ? String(v) : ''
      }
      setPrices(next)
      setRestock((d.restockDays ?? []).filter(
        (x): x is DayName => (WEEK_ORDER as string[]).includes(x),
      ))
      const o = sched.special_override
      setOvPrice(o && typeof o.price === 'number' ? String(o.price) : '')
      setOvLabel(o?.label ?? '')
      setOvExpiry(o?.expires ?? '')
      setToday(d.todayPrice ?? null)
    }
  }, [storeId])

  function toggleRestock(day: DayName) {
    setRestock(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])
  }

  async function handleSave() {
    if (!storeId) return
    setError('')

    // The whole schedule goes up every save, so clearing a field genuinely
    // clears it — including removing the override by emptying its price.
    const schedule: PricingSchedule = {}
    for (const day of WEEK_ORDER) {
      const raw = (prices[day] ?? '').trim()
      if (raw === '') continue                       // no price published for that day
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0) {
        setError(`${DAY_LABEL[day]} needs a valid price, or leave it blank.`)
        return
      }
      schedule[day] = n
    }

    const rawOv = ovPrice.trim()
    if (rawOv !== '') {
      const n = Number(rawOv)
      if (!Number.isFinite(n) || n < 0) {
        setError('The special price needs to be a valid amount.')
        return
      }
      schedule.special_override = {
        price: n,
        label: ovLabel.trim(),
        expires: ovExpiry.trim() || null,
      }
    }

    setSaving(true)
    const res = await fetch('/api/merchant/store', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId, pricingSchedule: schedule, restockDays: restock }),
    })
    setSaving(false)

    if (!res.ok) {
      const d = await res.json().catch(() => null)
      setError(d?.error ?? 'Could not save. Try again.')
      return
    }

    // Trust the server's resolved price rather than recomputing here — it
    // decides the day in the store's timezone, which the browser may not share.
    const d = await res.json()
    setToday(d.todayPrice ?? null)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const inputClass =
    'w-24 rounded-xl border border-[#EBEBF2] bg-[#F5F5F8] px-3 py-2 text-[13px] text-[#1A1A2E] ' +
    'focus:outline-none focus:ring-2 focus:ring-[#4A4B98]/30 placeholder:text-[#D1D1DC]'

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[#EBEBF2]">
        <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">Pricing Schedule</h2>
        <p className="text-[11px] text-[#8E8EA8] font-medium mt-0.5">
          What one item costs each day. Members see today&apos;s price on your store card
          and when they scan an item here.
        </p>
      </div>

      {loading ? (
        <div className="p-5 flex flex-col gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-[#F5F5F8] rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="p-5 flex flex-col gap-5">

          {/* Today's price, up top — the one number a merchant checks at a glance. */}
          <div
            className="rounded-xl px-4 py-3 flex items-baseline justify-between"
            style={{ backgroundColor: today ? '#4A4B98' : '#F5F5F8' }}
          >
            <span className={`text-[13px] font-bold ${today ? 'text-white/80' : 'text-[#8E8EA8]'}`}>
              Today&apos;s Bin Price
            </span>
            <span className={`text-2xl font-bold ${today ? 'text-white' : 'text-[#8E8EA8]'}`}>
              {today ? formatPrice(today.price) : 'Not set'}
            </span>
          </div>
          {today?.label && (
            <p className="-mt-3 text-[11px] font-bold" style={{ color: '#DA1212' }}>
              Special running: {today.label}
            </p>
          )}

          {/* Day-by-day */}
          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-bold text-[#1A1A2E]">Price by Day</label>
            <p className="text-[11px] text-[#8E8EA8] font-medium -mt-1">
              Leave a day blank if you don&apos;t want to publish a price for it. Tick
              &ldquo;Restock&rdquo; on the days you put fresh inventory out.
            </p>

            <div className="flex flex-col gap-1.5 mt-1">
              {WEEK_ORDER.map(day => (
                <div key={day} className="flex items-center gap-3">
                  <span className="text-[13px] font-semibold text-[#1A1A2E] w-24 flex-shrink-0">
                    {DAY_LABEL[day]}
                  </span>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-[#8E8EA8] pointer-events-none">
                      $
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      placeholder="—"
                      value={prices[day] ?? ''}
                      onChange={e => setPrices(prev => ({ ...prev, [day]: e.target.value }))}
                      className={`${inputClass} pl-6`}
                      aria-label={`${DAY_LABEL[day]} price`}
                    />
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={restock.includes(day)}
                      onChange={() => toggleRestock(day)}
                      className="w-4 h-4 rounded accent-[#4A4B98] cursor-pointer"
                    />
                    <span className="text-[11px] font-semibold text-[#8E8EA8]">Restock</span>
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Special override */}
          <div className="flex flex-col gap-2 pt-1 border-t border-[#EBEBF2]">
            <label className="text-[13px] font-bold text-[#1A1A2E] mt-3">
              Special Price <span className="font-medium text-[#8E8EA8]">(optional)</span>
            </label>
            <p className="text-[11px] text-[#8E8EA8] font-medium -mt-1">
              Overrides every day above while it runs — for a sale or a holiday.
              Clear the price to remove it.
            </p>

            <div className="flex flex-wrap items-center gap-2 mt-1">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-[#8E8EA8] pointer-events-none">
                  $
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  placeholder="5"
                  value={ovPrice}
                  onChange={e => setOvPrice(e.target.value)}
                  className={`${inputClass} pl-6`}
                  aria-label="Special price"
                />
              </div>
              <input
                type="text"
                maxLength={40}
                placeholder='Label, e.g. "$5 Blowout"'
                value={ovLabel}
                onChange={e => setOvLabel(e.target.value)}
                className={`${inputClass} w-48`}
                aria-label="Special price label"
              />
              <input
                type="date"
                value={ovExpiry}
                onChange={e => setOvExpiry(e.target.value)}
                className={`${inputClass} w-40`}
                aria-label="Special price last day"
              />
            </div>
            <p className="text-[11px] text-[#8E8EA8] font-medium">
              The date is the <strong>last day</strong> the special runs. Leave it empty
              to keep it going until you remove it.
            </p>
          </div>

          {error && (
            <p className="text-[12px] font-semibold" style={{ color: '#DA1212' }}>{error}</p>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3.5 rounded-xl font-bold text-[14px] text-white transition-colors disabled:opacity-60"
            style={{ backgroundColor: '#4A4B98' }}
          >
            {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Pricing'}
          </button>
        </div>
      )}
    </div>
  )
}
