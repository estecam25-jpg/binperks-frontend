'use client'

/**
 * Merchant Settings — Pricing Schedule.
 *
 * A bin store's price changes by day of week, so members need to know what
 * today costs before they drive over. This is where the merchant publishes it.
 *
 * THREE STATES PER DAY, not two. "Closed" used to be expressed as a $0 price,
 * which is ambiguous — $0 is also a legitimate free-bin day. A day is now:
 *   open with a price   the normal case
 *   Closed              toggled explicitly, stored as null
 *   blank               no price published yet
 *
 * Restock is no longer editable here. The flag still lives inside each day in
 * the stored schedule and is round-tripped untouched on save, so existing data
 * survives — it just has no control in this card any more. Special events are
 * likewise stored data only: the PATCH below never sends specialEvents, which
 * leaves whatever is on the store row alone.
 *
 * Per location: the Settings tab is already scoped by the location selector in
 * MerchantNav, so this card just takes that storeId.
 *
 * Module scope, not nested inside SettingsTab: a component declared inside
 * another gets a fresh identity every render, React remounts the subtree, and
 * every input loses focus after one keystroke (the bug fixed in 8b422a3).
 */

import { useEffect, useState } from 'react'
import {
  WEEK_ORDER, formatPrice,
  type DayName, type PricingSchedule, type TodayPrice,
} from '@/lib/store-pricing'

const BLUE = '#4A4B98'

const DAY_LABEL: Record<DayName, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
}

/** Prices are held as strings while editing so a half-typed "1." is not coerced
 *  to a number and made to fight the cursor. Converted on save. */
interface DayDraft {
  price: string
  /** Carried through from the stored schedule so a save does not erase it.
   *  Not editable — this card has no control for it. */
  restock: boolean
  closed: boolean
}

type Draft = Record<DayName, DayDraft>

const blankDraft = (): Draft => Object.fromEntries(
  WEEK_ORDER.map(d => [d, { price: '', restock: false, closed: false }]),
) as Draft

const inputClass =
  'rounded-xl border border-[#EBEBF2] bg-[#F5F5F8] px-3 py-2 text-[13px] text-[#1A1A2E] ' +
  'focus:outline-none focus:ring-2 focus:ring-[#4A4B98]/30 placeholder:text-[#D1D1DC] ' +
  'disabled:opacity-40 disabled:cursor-not-allowed'

export default function PricingScheduleCard({ storeId }: { storeId: string | null }) {
  const [days, setDays] = useState<Draft>(blankDraft)

  const [today,   setToday]   = useState<TodayPrice | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState('')

  // Loading is DERIVED: the card is loading while the fields on screen belong
  // to a different store than the one selected. Storing it would mean a
  // setState in the effect body, which cascades an extra render.
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const loading = !!storeId && loadedFor !== storeId

  useEffect(() => {
    if (!storeId) return
    let cancelled = false

    fetch(`/api/merchant/store?storeId=${storeId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled) return
        if (d) applyResponse(d)
        setLoadedFor(storeId)
      })
      .catch(() => { if (!cancelled) setLoadedFor(storeId) })

    return () => { cancelled = true }

    function applyResponse(d: {
      pricingSchedule?: PricingSchedule
      restockDays?: string[]
      todayPrice?: TodayPrice | null
    }) {
      const sched = (d.pricingSchedule ?? {}) as Record<string, unknown>
      const legacyRestock = new Set((d.restockDays ?? []).map(x => x.toLowerCase()))
      const next = blankDraft()

      for (const day of WEEK_ORDER) {
        const raw = sched[day]
        if (raw === null) { next[day] = { price: '', restock: false, closed: true }; continue }
        if (raw === undefined) { next[day].restock = legacyRestock.has(day); continue }

        // Legacy rows store a bare number with restock in the separate array.
        if (typeof raw === 'number') {
          next[day] = { price: String(raw), restock: legacyRestock.has(day), closed: false }
          continue
        }
        const o = raw as { price?: number; restock?: boolean }
        next[day] = {
          price: typeof o.price === 'number' ? String(o.price) : '',
          restock: o.restock === true || legacyRestock.has(day),
          closed: false,
        }
      }

      setDays(next)
      setToday(d.todayPrice ?? null)
    }
  }, [storeId])

  function setDay(day: DayName, patch: Partial<DayDraft>) {
    setDays(prev => ({ ...prev, [day]: { ...prev[day], ...patch } }))
  }

  async function handleSave() {
    if (!storeId) return
    setError('')

    const schedule: Record<string, unknown> = {}
    for (const day of WEEK_ORDER) {
      const d = days[day]
      if (d.closed) { schedule[day] = null; continue }       // explicit closed
      const raw = d.price.trim()
      if (raw === '') {
        // Nothing published. A restock flag with no price has nowhere to live,
        // so it is dropped rather than written against a phantom price.
        continue
      }
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0) {
        setError(`${DAY_LABEL[day]} needs a valid price, mark it Closed, or leave it blank.`)
        return
      }
      schedule[day] = { price: n, restock: d.restock }
    }

    setSaving(true)
    // specialEvents is deliberately NOT sent. The column still holds whatever
    // was configured while this card still edited events, and omitting the key
    // leaves it alone — sending [] would wipe it.
    const res = await fetch('/api/merchant/store', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId, pricingSchedule: schedule }),
    })
    setSaving(false)

    if (!res.ok) {
      const d = await res.json().catch(() => null)
      setError(d?.error ?? 'Could not save. Try again.')
      return
    }

    // Trust the server's resolved price: it decides the day in the STORE's
    // timezone, which the browser may not share.
    const d = await res.json()
    setToday(d.todayPrice ?? null)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

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

          {/* Today's price up top — the one figure a merchant checks at a glance. */}
          <div
            className="rounded-xl px-4 py-3 flex items-baseline justify-between"
            style={{ backgroundColor: today && !today.closed && today.price !== null ? BLUE : '#F5F5F8' }}
          >
            <span className={`text-[13px] font-bold ${today && !today.closed && today.price !== null ? 'text-white/80' : 'text-[#8E8EA8]'}`}>
              Today&apos;s Bin Price
            </span>
            <span className={`text-2xl font-bold ${today && !today.closed && today.price !== null ? 'text-white' : 'text-[#8E8EA8]'}`}>
              {!today ? 'Not set'
                : today.closed ? 'Closed'
                : today.price !== null ? formatPrice(today.price) : 'Not set'}
            </span>
          </div>
          {today?.isEvent && today.label && (
            <p className="-mt-3 text-[11px] font-bold" style={{ color: '#DA1212' }}>
              🎉 {today.label} running today
            </p>
          )}

          {/* ── Day by day ── */}
          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-bold text-[#1A1A2E]">Price by Day</label>
            <p className="text-[11px] text-[#8E8EA8] font-medium -mt-1">
              Leave a day blank if you have not set a price yet. Mark a day <strong>Closed</strong>
              {' '}if you are not open — that is different from a $0 day.
            </p>

            <div className="flex flex-col gap-1.5 mt-1">
              {WEEK_ORDER.map(day => {
                const d = days[day]
                return (
                  <div key={day} className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-[13px] font-semibold text-[#1A1A2E] w-[74px] flex-shrink-0">
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
                        placeholder={d.closed ? 'Closed' : '—'}
                        value={d.closed ? '' : d.price}
                        disabled={d.closed}
                        onChange={e => setDay(day, { price: e.target.value })}
                        className={`${inputClass} pl-6 w-24`}
                        aria-label={`${DAY_LABEL[day]} price`}
                      />
                    </div>

                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={d.closed}
                        onChange={e => setDay(day, { closed: e.target.checked })}
                        className="w-4 h-4 rounded accent-[#DA1212] cursor-pointer"
                        aria-label={`${DAY_LABEL[day]} closed`}
                      />
                      <span className="text-[11px] font-semibold" style={{ color: d.closed ? '#DA1212' : '#8E8EA8' }}>
                        Closed
                      </span>
                    </label>
                  </div>
                )
              })}
            </div>
          </div>

          {error && (
            <p className="text-[12px] font-semibold" style={{ color: '#DA1212' }}>{error}</p>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3.5 rounded-xl font-bold text-[14px] text-white transition-colors disabled:opacity-60"
            style={{ backgroundColor: BLUE }}
          >
            {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Pricing'}
          </button>
        </div>
      )}
    </div>
  )
}
