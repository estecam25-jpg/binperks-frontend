'use client'

/**
 * Merchant Settings — store address, per location.
 *
 * Feeds the Directions button on member store cards. The merchant's own Google
 * Maps link is preferred there because they paste the pin for their exact unit;
 * the structured address is the fallback a search is built from.
 *
 * Reuses the EXISTING stores.address / city / state / zip columns rather than
 * introducing address_line1 / zip_code alongside them — two of those columns
 * already hold real values, and a parallel set would have stranded that data
 * behind a second source of truth. Only address_line2 and google_maps_url were
 * genuinely missing.
 *
 * Module scope for the same reason as PricingScheduleCard: a component defined
 * inside another remounts on every render and the inputs lose focus.
 */

import { useEffect, useState } from 'react'

const BLUE = '#4A4B98'

const inputClass =
  'w-full rounded-xl border border-[#EBEBF2] bg-[#F5F5F8] px-4 py-2.5 text-[13px] text-[#1A1A2E] ' +
  'focus:outline-none focus:ring-2 focus:ring-[#4A4B98]/30 placeholder:text-[#D1D1DC]'

export default function StoreAddressCard({ storeId }: { storeId: string | null }) {
  const [address, setAddress]   = useState('')
  const [line2, setLine2]       = useState('')
  const [city, setCity]         = useState('')
  const [state, setState]       = useState('FL')
  const [zip, setZip]           = useState('')
  const [mapsUrl, setMapsUrl]   = useState('')

  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [error, setError]   = useState('')

  // Derived, so nothing calls setState in the effect body.
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const loading = !!storeId && loadedFor !== storeId

  useEffect(() => {
    if (!storeId) return
    let cancelled = false

    fetch(`/api/merchant/store?storeId=${storeId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled) return
        if (d) {
          setAddress(d.address ?? '')
          setLine2(d.addressLine2 ?? '')
          setCity(d.city ?? '')
          setState(d.state ?? 'FL')
          setZip(d.zip ?? '')
          setMapsUrl(d.googleMapsUrl ?? '')
        }
        setLoadedFor(storeId)
      })
      .catch(() => { if (!cancelled) setLoadedFor(storeId) })

    return () => { cancelled = true }
  }, [storeId])

  async function handleSave() {
    if (!storeId) return
    setError('')

    const url = mapsUrl.trim()
    // Only http(s). A javascript: or data: URL here would end up as the href of
    // a link every member taps from their store card.
    if (url && !/^https?:\/\//i.test(url)) {
      setError('The Google Maps link should start with https://')
      return
    }
    if (zip.trim() && !/^\d{5}$/.test(zip.trim())) {
      setError('Zip code should be 5 digits.')
      return
    }

    setSaving(true)
    const res = await fetch('/api/merchant/store', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId,
        address: address.trim(),
        addressLine2: line2.trim(),
        city: city.trim(),
        state: state.trim(),
        zip: zip.trim(),
        googleMapsUrl: url,
      }),
    })
    setSaving(false)

    if (!res.ok) {
      const d = await res.json().catch(() => null)
      setError(d?.error ?? 'Could not save. Try again.')
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[#EBEBF2]">
        <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">Address</h2>
        <p className="text-[11px] text-[#8E8EA8] font-medium mt-0.5">
          Used by the Directions button members tap on your store card.
        </p>
      </div>

      {loading ? (
        <div className="p-5 flex flex-col gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-[#F5F5F8] rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="p-5 flex flex-col gap-4">

          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-bold text-[#1A1A2E]">Street Address</label>
            <input
              type="text" value={address} onChange={e => setAddress(e.target.value)}
              placeholder="123 Main Street" aria-label="Street Address"
              autoComplete="address-line1" className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-bold text-[#1A1A2E]">
              Suite/Unit <span className="font-medium text-[#8E8EA8]">(optional)</span>
            </label>
            <input
              type="text" value={line2} onChange={e => setLine2(e.target.value)}
              placeholder="Suite 4" aria-label="Suite or Unit"
              autoComplete="address-line2" className={inputClass}
            />
          </div>

          <div className="flex gap-2">
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-[12px] font-bold text-[#1A1A2E]">City</label>
              <input
                type="text" value={city} onChange={e => setCity(e.target.value)}
                placeholder="Tampa" aria-label="City"
                autoComplete="address-level2" className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5 w-20">
              <label className="text-[12px] font-bold text-[#1A1A2E]">State</label>
              <input
                type="text" maxLength={2} value={state}
                onChange={e => setState(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                placeholder="FL" aria-label="State"
                autoComplete="address-level1" className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5 w-28">
              <label className="text-[12px] font-bold text-[#1A1A2E]">Zip Code</label>
              <input
                type="text" inputMode="numeric" maxLength={5} value={zip}
                onChange={e => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                placeholder="33601" aria-label="Zip Code"
                autoComplete="postal-code" className={inputClass}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-bold text-[#1A1A2E]">Google Maps URL</label>
            <input
              type="url" value={mapsUrl} onChange={e => setMapsUrl(e.target.value)}
              placeholder="https://maps.app.goo.gl/..." aria-label="Google Maps URL"
              className={inputClass}
            />
            <p className="text-[11px] text-[#8E8EA8] font-medium">
              Paste your Google Maps link here so members can get directions.
            </p>
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
            {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Address'}
          </button>
        </div>
      )}
    </div>
  )
}
