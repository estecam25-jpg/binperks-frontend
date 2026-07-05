// ─── RedemptionsTab ───────────────────────────────────────────────────────────
'use client'

import { useEffect, useState, useCallback } from 'react'

interface Redemption {
  id: string; couponValue: number; redeemedAt: string
  memberName: string; storeName: string
}

export function RedemptionsTab({ storeId }: { storeId: string | null }) {
  const [redemptions, setRedemptions] = useState<Redemption[]>([])
  const [total, setTotal] = useState(0)
  const [weekOffset, setWeekOffset] = useState(0)
  const [weekStart, setWeekStart] = useState('')
  const [weekEnd, setWeekEnd] = useState('')
  const [loading, setLoading] = useState(true)

  const fetch_ = useCallback(async (offset: number) => {
    setLoading(true)
    const params = new URLSearchParams({ weekOffset: String(offset) })
    if (storeId) params.set('storeId', storeId)
    const res = await fetch(`/api/merchant/redemptions?${params}`)
    if (res.ok) {
      const d = await res.json()
      setRedemptions(d.redemptions)
      setTotal(d.total)
      setWeekStart(d.weekStart)
      setWeekEnd(d.weekEnd)
    }
    setLoading(false)
  }, [storeId])

  useEffect(() => { fetch_(weekOffset) }, [weekOffset, storeId, fetch_])

  function formatWeekRange() {
    if (!weekStart) return ''
    const s = new Date(weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const e = new Date(weekEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${s} – ${e}`
  }

  const totalValue = redemptions.reduce((sum, r) => sum + r.couponValue, 0)

  return (
    <div className="flex flex-col gap-4 p-4 pb-12">

      {/* Week navigator */}
      <div className="bg-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm">
        <button
          onClick={() => setWeekOffset(w => w - 1)}
          className="w-8 h-8 rounded-lg bg-[#F5F5F8] flex items-center justify-center text-[#1A1A2E] font-bold active:bg-[#EBEBF2]"
        >
          ←
        </button>
        <div className="flex-1 text-center">
          <p className="text-[13px] font-bold text-[#1A1A2E]">
            {weekOffset === 0 ? 'Current fiscal week' : weekOffset === -1 ? 'Last fiscal week' : `${Math.abs(weekOffset)} weeks ago`}
          </p>
          <p className="text-[11px] text-[#8E8EA8] font-medium">{formatWeekRange()}</p>
        </div>
        <button
          onClick={() => setWeekOffset(w => Math.min(0, w + 1))}
          disabled={weekOffset >= 0}
          className="w-8 h-8 rounded-lg bg-[#F5F5F8] flex items-center justify-center text-[#1A1A2E] font-bold disabled:opacity-30 active:bg-[#EBEBF2]"
        >
          →
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl px-4 py-4 shadow-sm">
          <p className="text-[11px] font-bold tracking-[0.06em] uppercase text-[#8E8EA8] mb-1">Coupons redeemed</p>
          <p className="font-['Coiny'] text-3xl text-[#DA1212]">{total}</p>
        </div>
        <div className="bg-white rounded-2xl px-4 py-4 shadow-sm">
          <p className="text-[11px] font-bold tracking-[0.06em] uppercase text-[#8E8EA8] mb-1">Total value given</p>
          <p className="font-['Coiny'] text-3xl text-[#1A1A2E]">
            ${totalValue.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Redemption log */}
      {loading ? (
        <div className="flex flex-col gap-2">
          {[...Array(4)].map((_, i) => <div key={i} className="bg-white rounded-xl h-14 animate-pulse" />)}
        </div>
      ) : redemptions.length === 0 ? (
        <div className="bg-white rounded-2xl py-16 text-center">
          <p className="text-[14px] font-semibold text-[#8E8EA8]">No redemptions this week.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="divide-y divide-[#EBEBF2]">
            {redemptions.map(r => (
              <div key={r.id} className="px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center text-lg flex-shrink-0">🎟️</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-[#1A1A2E] truncate">{r.memberName}</p>
                  <p className="text-[11px] text-[#8E8EA8] font-medium">
                    {new Date(r.redeemedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {' · '}{r.storeName}
                  </p>
                </div>
                <span className="font-['Coiny'] text-xl text-[#DA1212] flex-shrink-0">${r.couponValue}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── PerksTab ─────────────────────────────────────────────────────────────────

interface Perk { slot: number; title: string; description: string; isActive: boolean }
interface StoreRef { id: string; storeName: string; storeKey?: string }

export function PerksTab({ storeId, stores }: { storeId: string | null; stores: StoreRef[] }) {
  const activeStoreId = storeId ?? stores[0]?.id
  const [perks, setPerks] = useState<Perk[]>(
    Array.from({ length: 5 }, (_, i) => ({ slot: i + 1, title: '', description: '', isActive: false }))
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeStoreId) return
    setLoading(true)
    fetch(`/api/merchant/perks?storeId=${activeStoreId}`)
      .then(r => r.json())
      .then(d => { setPerks(d.perks); setLoading(false) })
  }, [activeStoreId])

  function updatePerk(slot: number, field: keyof Perk, value: string | boolean) {
    setPerks(prev => prev.map(p => p.slot === slot ? { ...p, [field]: value } : p))
    setSaved(false)
  }

  async function handleSave() {
    if (!activeStoreId) return
    setSaving(true)
    const res = await fetch('/api/merchant/perks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: activeStoreId, perks }),
    })
    setSaving(false)
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 3000) }
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-12">
      <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
        <p className="text-[12px] font-semibold text-amber-800 leading-snug">
          Update your perks monthly. If you don't update them, last month's carry over automatically.
          Members see these on their dashboard.
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[...Array(5)].map((_, i) => <div key={i} className="bg-white rounded-2xl h-28 animate-pulse" />)}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {perks.map(perk => (
            <div key={perk.slot} className="bg-white rounded-2xl px-4 py-4 shadow-sm flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#8E8EA8]">
                  Perk {perk.slot}
                </span>
                {/* Active toggle */}
                <button
                  onClick={() => updatePerk(perk.slot, 'isActive', !perk.isActive)}
                  className={`relative w-10 h-6 rounded-full transition-colors ${perk.isActive ? 'bg-[#4A4B98]' : 'bg-[#D1D1DC]'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${perk.isActive ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>
              <input
                type="text"
                placeholder={`Perk ${perk.slot} title…`}
                value={perk.title}
                onChange={e => updatePerk(perk.slot, 'title', e.target.value)}
                maxLength={60}
                className="w-full px-3 py-2.5 rounded-xl bg-[#F5F5F8] border-2 border-transparent focus:border-[#4A4B98] outline-none text-[14px] font-bold text-[#1A1A2E] placeholder:font-normal placeholder:text-[#D1D1DC]"
              />
              <textarea
                rows={2}
                placeholder="Short description members will see…"
                value={perk.description}
                onChange={e => updatePerk(perk.slot, 'description', e.target.value)}
                maxLength={140}
                className="w-full px-3 py-2.5 rounded-xl bg-[#F5F5F8] border-2 border-transparent focus:border-[#4A4B98] outline-none text-[13px] font-medium text-[#1A1A2E] placeholder:text-[#D1D1DC] resize-none"
              />
            </div>
          ))}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving || loading}
        className="w-full py-4 rounded-2xl font-bold text-[16px] text-white font-['Montserrat'] bg-[#4A4B98] disabled:opacity-50 active:scale-[0.97] transition-all flex items-center justify-center gap-2"
      >
        {saving && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
        {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save Perks'}
      </button>
    </div>
  )
}

// ─── MarketingTab ─────────────────────────────────────────────────────────────

export function MarketingTab({ storeId, stores }: { storeId: string | null; stores: { id: string; storeName: string; storeKey?: string; city: string; state: string }[] }) {
  const activeStore = storeId ? stores.find(s => s.id === storeId) : stores[0]
  const [copied, setCopied] = useState(false)

  // /join/[storeKey] resolves by canonical_key, NOT the store's UUID.
  const joinUrl = activeStore?.storeKey
    ? `https://app.binperks.com/join/${activeStore.storeKey}`
    : ''

  async function handleCopyLink() {
    await navigator.clipboard.writeText(joinUrl).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  async function handleDownloadQR() {
    // QR code is generated as a PNG from the store's join URL
    // In production: use qrcode library or a QR API
    // For now: open a QR generator service
    window.open(`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(joinUrl)}&format=png`, '_blank')
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-12">

      {/* QR Code */}
      <div className="bg-white rounded-2xl px-5 py-6 shadow-sm flex flex-col items-center gap-4">
        <h2 className="font-['Coiny'] text-xl text-[#1A1A2E] self-start">QR code</h2>
        <div className="w-40 h-40 bg-[#F5F5F8] rounded-2xl flex items-center justify-center border-2 border-[#EBEBF2]">
          {/* In production: render actual QR code SVG using `qrcode` npm package */}
          <div className="text-center">
            <span className="text-4xl">📱</span>
            <p className="text-[10px] text-[#8E8EA8] font-bold mt-1">QR Code</p>
          </div>
        </div>
        <p className="text-[11px] text-[#8E8EA8] font-medium text-center">
          Members scan this to join your rewards program.
          Print and display at your register.
        </p>
        <button
          onClick={handleDownloadQR}
          disabled={!joinUrl}
          className="w-full py-3.5 rounded-xl font-bold text-[14px] text-[#4A4B98] font-['Montserrat'] border-2 border-[#4A4B98] disabled:opacity-50 active:bg-indigo-50 transition-colors"
        >
          Download QR Code
        </button>
      </div>

      {/* Referral / join link */}
      <div className="bg-white rounded-2xl px-5 py-5 shadow-sm flex flex-col gap-3">
        <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">Member join link</h2>
        <p className="text-[12px] text-[#8E8EA8] font-medium">
          Share this link on social media or in your store's bio to let customers sign up online.
        </p>
        <div className="flex items-center gap-2 bg-[#F5F5F8] rounded-xl px-3 py-2.5">
          <p className="flex-1 text-[12px] font-semibold text-[#8E8EA8] truncate">{joinUrl || 'Not provisioned yet'}</p>
          <button
            onClick={handleCopyLink}
            disabled={!joinUrl}
            className="flex-shrink-0 text-[12px] font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            style={{ backgroundColor: copied ? '#2A7D34' : '#4A4B9815', color: copied ? 'white' : '#4A4B98' }}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Printable signage note */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-2xl px-5 py-4 flex items-start gap-3">
        <span className="text-xl flex-shrink-0">🖨️</span>
        <div>
          <p className="text-[13px] font-bold text-[#4A4B98] mb-0.5">Printable signage</p>
          <p className="text-[12px] text-[#4A4B98]/70 font-medium leading-snug">
            Full-size printable QR code posters are coming in a future update.
            For now, use the QR code download above.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── SettingsTab ──────────────────────────────────────────────────────────────

interface Cashier { id: string; name: string; role: string; pin: string; isActive: boolean }

export function SettingsTab({ storeId, stores }: { storeId: string | null; stores: StoreRef[] }) {
  const activeStoreId = storeId ?? stores[0]?.id
  const [cashiers, setCashiers] = useState<Cashier[]>([])
  const [newName, setNewName] = useState('')
  const [newPin, setNewPin] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeStoreId) return
    setLoading(true)
    fetch(`/api/merchant/cashiers?storeId=${activeStoreId}`)
      .then(r => r.json())
      .then(d => { setCashiers(d.cashiers ?? []); setLoading(false) })
  }, [activeStoreId])

  async function handleAddCashier(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim() || !/^\d{4}$/.test(newPin)) {
      setAddError('Name and a 4-digit PIN are required')
      return
    }
    setAdding(true)
    setAddError('')
    const res = await fetch('/api/merchant/cashiers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: activeStoreId, name: newName.trim(), pin: newPin, role: 'cashier' }),
    })
    if (res.ok) {
      setNewName(''); setNewPin('')
      // Refresh
      fetch(`/api/merchant/cashiers?storeId=${activeStoreId}`)
        .then(r => r.json()).then(d => setCashiers(d.cashiers ?? []))
    } else {
      const d = await res.json()
      setAddError(d.error === 'PIN already in use at this location' ? 'That PIN is already taken — choose a different one.' : d.error)
    }
    setAdding(false)
  }

  async function handleDeactivate(id: string) {
    await fetch(`/api/merchant/cashiers/${id}`, { method: 'DELETE' })
    setCashiers(prev => prev.filter(c => c.id !== id))
  }

  return (
    <div className="flex flex-col gap-5 p-4 pb-16">

      {/* Cashier PIN management */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EBEBF2]">
          <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">Cashier PINs</h2>
          <p className="text-[11px] text-[#8E8EA8] font-medium mt-0.5">
            Each cashier has their own 4-digit PIN. Only you can add or remove them.
          </p>
        </div>

        {/* Cashier list */}
        {loading ? (
          <div className="p-4 flex flex-col gap-2">
            {[...Array(2)].map((_, i) => <div key={i} className="h-12 bg-[#F5F5F8] rounded-xl animate-pulse" />)}
          </div>
        ) : cashiers.length === 0 ? (
          <p className="px-5 py-4 text-[13px] text-[#8E8EA8] font-medium">
            No cashiers added yet. Add one below.
          </p>
        ) : (
          <div className="divide-y divide-[#EBEBF2]">
            {cashiers.map(c => (
              <div key={c.id} className="px-5 py-3 flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-[13px] font-bold text-[#1A1A2E]">{c.name}</p>
                  <p className="text-[11px] text-[#8E8EA8] font-medium capitalize">
                    {c.role} · PIN: {c.pin}
                  </p>
                </div>
                {c.role !== 'owner' && (
                  <button
                    onClick={() => handleDeactivate(c.id)}
                    className="text-[12px] font-bold text-[#DA1212] px-3 py-1.5 rounded-lg active:bg-red-50 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add cashier form */}
        <form onSubmit={handleAddCashier} className="px-5 py-4 border-t border-[#EBEBF2] flex flex-col gap-3">
          <p className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#8E8EA8]">Add cashier</p>
          <div className="flex gap-2.5">
            <input
              type="text"
              placeholder="Cashier name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="flex-1 px-3 py-2.5 rounded-xl bg-[#F5F5F8] border-2 border-transparent focus:border-[#4A4B98] outline-none text-[14px] font-semibold text-[#1A1A2E] placeholder:font-normal placeholder:text-[#D1D1DC]"
            />
            <input
              type="text"
              inputMode="numeric"
              placeholder="1234"
              value={newPin}
              onChange={e => setNewPin(e.target.value.replace(/\D/g,'').slice(0,4))}
              maxLength={4}
              className="w-20 px-3 py-2.5 rounded-xl bg-[#F5F5F8] border-2 border-transparent focus:border-[#4A4B98] outline-none text-[14px] font-bold text-[#1A1A2E] placeholder:font-normal placeholder:text-[#D1D1DC] text-center tracking-widest"
            />
          </div>
          {addError && <p className="text-[11px] font-semibold text-[#DA1212]">{addError}</p>}
          <button
            type="submit"
            disabled={adding}
            className="w-full py-3 rounded-xl font-bold text-[14px] text-white font-['Montserrat'] bg-[#4A4B98] disabled:opacity-50"
          >
            {adding ? 'Adding…' : 'Add Cashier'}
          </button>
        </form>
      </div>

      {/* Sign out */}
      <div className="bg-white rounded-2xl shadow-sm px-5 py-5">
        <h2 className="font-['Coiny'] text-xl text-[#1A1A2E] mb-3">Account</h2>
        <p className="text-[12px] text-[#8E8EA8] font-medium mb-3">
          Sign-in links are sent to your email. No password needed.
        </p>
        <button
          onClick={async () => {
            const { createClient } = await import('@/lib/supabase')
            const supabase = createClient()
            await supabase.auth.signOut()
            window.location.href = '/merchant/login'
          }}
          className="text-[13px] font-bold text-[#DA1212]"
        >
          Sign out
        </button>
      </div>

      {/* Support */}
      <p className="text-[11px] text-[#8E8EA8] text-center font-medium">
        Billing, cancellation, or technical issues?{' '}
        <a href="mailto:support@binperks.com" className="underline text-[#4A4B98] font-semibold">
          support@binperks.com
        </a>
      </p>
    </div>
  )
}
