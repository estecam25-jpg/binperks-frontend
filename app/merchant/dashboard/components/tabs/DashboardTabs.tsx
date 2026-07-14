// --- RedemptionsTab ---
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

// --- PerksTab ---

interface Perk { slot: number; title: string; description: string; isActive: boolean }
interface StoreRef { id: string; storeName: string; storeKey?: string }

const FREE_PERK_DEFAULTS: Perk[] = [
  { slot: 1, title: 'Birthday Perk', description: 'Show your ID during your birthday month for 5% off anything from the bins.', isActive: true },
  { slot: 2, title: 'Behind the Register Discount', description: 'Get 10% off any non-bin items.', isActive: true },
]

const VIP_PERK_DEFAULTS: Perk[] = [
  { slot: 1, title: 'VIP Bins', description: 'Shop in your Exclusive VIP bins. All items in these bins have a $50+ retail value.', isActive: true },
  { slot: 2, title: 'VIP Line', description: 'VIP members get to be the first to shop.', isActive: true },
  { slot: 3, title: 'VIP Hour', description: 'Shop for 3 hours with fellow VIP members before we open to the public.', isActive: true },
  { slot: 4, title: 'Behind the Register Discount', description: 'Get 20% off any non-bin items.', isActive: true },
  { slot: 5, title: 'BOGO $1 Day', description: 'Buy One Get One free on Dollar Day.', isActive: true },
]

export function PerksTab({ storeId, stores }: { storeId: string | null; stores: StoreRef[] }) {
  const activeStoreId = storeId ?? stores[0]?.id
  const [freePerks, setFreePerks] = useState<Perk[]>(FREE_PERK_DEFAULTS)
  const [vipPerks, setVipPerks] = useState<Perk[]>(VIP_PERK_DEFAULTS)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [freeWarning, setFreeWarning] = useState(false)
  const [vipWarning, setVipWarning] = useState(false)

  useEffect(() => {
    if (!activeStoreId) return
    setLoading(true)
    fetch(`/api/merchant/perks?storeId=${activeStoreId}`)
      .then(r => r.json())
      .then(d => {
        const fp: Perk[] = d.freePerks ?? []
        const vp: Perk[] = d.vipPerks ?? []
        setFreePerks(fp.some((p: Perk) => p.title) ? fp : FREE_PERK_DEFAULTS)
        setVipPerks(vp.some((p: Perk) => p.title) ? vp : VIP_PERK_DEFAULTS)
        setLoading(false)
      })
  }, [activeStoreId])

  function updateFree(slot: number, field: keyof Perk, value: string | boolean) {
    setFreePerks(prev => prev.map(p => p.slot === slot ? { ...p, [field]: value } : p))
    setSaved(false); setFreeWarning(false)
  }

  function updateVip(slot: number, field: keyof Perk, value: string | boolean) {
    setVipPerks(prev => prev.map(p => p.slot === slot ? { ...p, [field]: value } : p))
    setSaved(false); setVipWarning(false)
  }

  async function handleSave() {
    if (!activeStoreId) return
    if (freePerks.filter(p => p.isActive).length < 1) { setFreeWarning(true); return }
    if (vipPerks.filter(p => p.isActive).length < 3) { setVipWarning(true); return }
    setSaving(true)
    const res = await fetch('/api/merchant/perks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: activeStoreId, freePerks, vipPerks }),
    })
    setSaving(false)
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 3000) }
  }

  function PerkCard({
    perk, label, onChange,
  }: {
    perk: Perk
    label: string
    onChange: (slot: number, field: keyof Perk, value: string | boolean) => void
  }) {
    return (
      <div className="bg-white rounded-2xl px-4 py-4 shadow-sm flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#8E8EA8]">{label}</span>
          <button
            onClick={() => onChange(perk.slot, 'isActive', !perk.isActive)}
            className={`relative w-10 h-6 rounded-full transition-colors ${perk.isActive ? 'bg-[#4A4B98]' : 'bg-[#D1D1DC]'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${perk.isActive ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        </div>
        <input
          type="text"
          placeholder="Perk title..."
          value={perk.title}
          onChange={e => onChange(perk.slot, 'title', e.target.value)}
          maxLength={60}
          className="w-full px-3 py-2.5 rounded-xl bg-[#F5F5F8] border-2 border-transparent focus:border-[#4A4B98] outline-none text-[14px] font-bold text-[#1A1A2E] placeholder:font-normal placeholder:text-[#D1D1DC]"
        />
        <textarea
          rows={2}
          placeholder="Short description members will see..."
          value={perk.description}
          onChange={e => onChange(perk.slot, 'description', e.target.value)}
          maxLength={140}
          className="w-full px-3 py-2.5 rounded-xl bg-[#F5F5F8] border-2 border-transparent focus:border-[#4A4B98] outline-none text-[13px] font-medium text-[#1A1A2E] placeholder:text-[#D1D1DC] resize-none"
        />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        {[...Array(7)].map((_, i) => <div key={i} className="bg-white rounded-2xl h-28 animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 p-4 pb-12">

      <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
        <p className="text-[12px] font-semibold text-amber-800 leading-snug">
          Update your perks monthly. If you don&apos;t update them, last month&apos;s carry over automatically.
          Members see these on their dashboard.
        </p>
      </div>

      {/* Free member perks */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <p className="font-['Coiny'] text-[52px] text-[#1A1A2E]">Free Member Perks</p>
          <span className="text-[11px] font-semibold text-[#8E8EA8]">2 slots &middot; min 1 active</span>
        </div>
        {freeWarning && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
            <p className="text-[12px] font-semibold text-red-700">At least 1 Free perk must be active.</p>
          </div>
        )}
        {freePerks.map(p => (
          <PerkCard key={p.slot} perk={p} label={`Free Perk ${p.slot}`} onChange={updateFree} />
        ))}
      </div>

      <div className="border-t border-[#EBEBF2]" />

      {/* VIP member perks */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <p className="font-['Coiny'] text-[52px] text-[#1A1A2E]">VIP Member Perks</p>
          <span className="text-[11px] font-semibold text-[#8E8EA8]">5 slots &middot; min 3 active</span>
        </div>
        {vipWarning && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
            <p className="text-[12px] font-semibold text-red-700">At least 3 VIP perks must be active.</p>
          </div>
        )}
        {vipPerks.map(p => (
          <PerkCard key={p.slot} perk={p} label={`VIP Perk ${p.slot}`} onChange={updateVip} />
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-4 rounded-2xl font-bold text-[16px] text-white font-['Montserrat'] bg-[#4A4B98] disabled:opacity-50 active:scale-[0.97] transition-all flex items-center justify-center gap-2"
      >
        {saving && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
        {saved ? '✓ Saved' : saving ? 'Saving...' : 'Save Perks'}
      </button>
    </div>
  )
}

// --- MarketingTab ---

export function MarketingTab({ storeId, stores }: { storeId: string | null; stores: { id: string; storeName: string; storeKey?: string; city: string; state: string }[] }) {
  const activeStore = storeId ? stores.find(s => s.id === storeId) : stores[0]
  const [copied, setCopied] = useState(false)

  const joinUrl = activeStore?.storeKey
    ? `https://app.binperks.com/join/${activeStore.storeKey}`
    : ''

  async function handleCopyLink() {
    await navigator.clipboard.writeText(joinUrl).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  async function handleDownloadQR() {
    window.open(`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(joinUrl)}&format=png`, '_blank')
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-12">

      {/* QR Code */}
      <div className="bg-white rounded-2xl px-5 py-6 shadow-sm flex flex-col items-center gap-4">
        <h2 className="font-['Coiny'] text-xl text-[#1A1A2E] self-start">QR code</h2>
        <div className="w-40 h-40 bg-[#F5F5F8] rounded-2xl flex items-center justify-center border-2 border-[#EBEBF2]">
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

      {/* Join link */}
      <div className="bg-white rounded-2xl px-5 py-5 shadow-sm flex flex-col gap-3">
        <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">Member join link</h2>
        <p className="text-[12px] text-[#8E8EA8] font-medium">
          Share this link on social media or in your store&apos;s bio to let customers sign up online.
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

// --- SettingsTab ---

const GOOGLE_FONTS = [
  'Google Sans', 'Playfair Display', 'Oswald', 'Dancing Script', 'Metamorphous',
  'BioRhyme', 'Aboreto', 'Play', 'Quantico', 'Bebas Neue',
  'Exo 2', 'Cinzel', 'Space Grotesk', 'Barlow', 'Abril Fatface',
]

function googleFontUrl(family: string) {
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@700&display=swap`
}

interface Cashier { id: string; name: string; role: string; pin: string; isActive: boolean }

export function SettingsTab({ storeId, stores }: { storeId: string | null; stores: StoreRef[] }) {
  const activeStoreId = storeId ?? stores[0]?.id

  const [brandColor,    setBrandColor]    = useState('#4A4B98')
  const [fontFamily,    setFontFamily]    = useState('Google Sans')
  const [logoUrl,       setLogoUrl]       = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [brandSaving,   setBrandSaving]   = useState(false)
  const [brandSaved,    setBrandSaved]    = useState(false)
  const [brandLoading,  setBrandLoading]  = useState(true)

  const [cashiers, setCashiers] = useState<Cashier[]>([])
  const [newName,  setNewName]  = useState('')
  const [newPin,   setNewPin]   = useState('')
  const [adding,   setAdding]   = useState(false)
  const [addError, setAddError] = useState('')
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!activeStoreId) return
    setBrandLoading(true)
    fetch(`/api/merchant/store?storeId=${activeStoreId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setBrandColor(d.brandColor ?? '#4A4B98')
          setFontFamily(d.fontFamily ?? 'Coiny')
          setLogoUrl(d.logoUrl ?? null)
        }
        setBrandLoading(false)
      })
  }, [activeStoreId])

  useEffect(() => {
    if (!fontFamily) return
    const id = `gf-preview-${fontFamily.replace(/\s+/g, '-')}`
    if (document.getElementById(id)) return
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = googleFontUrl(fontFamily)
    document.head.appendChild(link)
  }, [fontFamily])

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !activeStoreId) return
    setLogoUploading(true)
    const { createClient } = await import('@/lib/supabase')
    const supabase = createClient()
    const ext = file.name.split('.').pop() ?? 'jpg'
    const filePath = `${activeStoreId}/logo.${ext}`
    const { error } = await supabase.storage
      .from('store-logos')
      .upload(filePath, file, { upsert: true, contentType: file.type })
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('store-logos').getPublicUrl(filePath)
      setLogoUrl(publicUrl)
    }
    setLogoUploading(false)
  }

  async function handleBrandSave() {
    if (!activeStoreId) return
    setBrandSaving(true)
    const res = await fetch('/api/merchant/store', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: activeStoreId, brandColor, fontFamily: fontFamily || null, logoUrl }),
    })
    setBrandSaving(false)
    if (res.ok) { setBrandSaved(true); setTimeout(() => setBrandSaved(false), 3000) }
  }

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

      {/* Store Branding */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EBEBF2]">
          <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">Store Branding</h2>
          <p className="text-[11px] text-[#8E8EA8] font-medium mt-0.5">
            Logo, color, and font shown on your customer-facing join page.
          </p>
        </div>

        {brandLoading ? (
          <div className="p-5 flex flex-col gap-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-[#F5F5F8] rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="p-5 flex flex-col gap-5">

            {/* Logo upload */}
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-bold text-[#1A1A2E]">Store Logo</label>
              <div className="flex items-center gap-4">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden border border-[#EBEBF2]"
                  style={{ backgroundColor: brandColor }}
                >
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-['Coiny'] text-white text-xl leading-none">
                      {stores.find(s => s.id === activeStoreId)?.storeName?.slice(0, 2).toUpperCase() ?? '??'}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="cursor-pointer inline-flex items-center gap-2 bg-[#F5F5F8] rounded-xl px-4 py-2 text-[13px] font-semibold text-[#1A1A2E] hover:bg-[#EBEBF2] transition-colors">
                    {logoUploading ? 'Uploading...' : 'Upload image'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={logoUploading}
                      onChange={handleLogoUpload}
                    />
                  </label>
                  {logoUrl && (
                    <button
                      onClick={() => setLogoUrl(null)}
                      className="text-[11px] text-[#8E8EA8] font-medium text-left hover:text-red-500 transition-colors"
                    >
                      Remove logo
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Brand color */}
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-bold text-[#1A1A2E]">Brand Color</label>
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl border border-[#EBEBF2] flex-shrink-0"
                  style={{ backgroundColor: brandColor }}
                />
                <input
                  type="color"
                  value={brandColor}
                  onChange={e => setBrandColor(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-[#EBEBF2] cursor-pointer p-0.5 bg-white"
                />
                <span className="text-[13px] font-mono text-[#8E8EA8]">{brandColor}</span>
              </div>
            </div>

            {/* Font selector */}
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-bold text-[#1A1A2E]">Heading Font</label>
              <select
                value={fontFamily}
                onChange={e => setFontFamily(e.target.value)}
                className="rounded-xl border border-[#EBEBF2] bg-[#F5F5F8] px-4 py-2 text-[13px] text-[#1A1A2E] focus:outline-none focus:ring-2 focus:ring-[#4A4B98]/30"
              >
                {GOOGLE_FONTS.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              <div
                className="mt-1 rounded-xl px-4 py-3 text-center text-xl font-bold"
                style={{ backgroundColor: brandColor, color: '#fff', fontFamily: `'${fontFamily}', 'Coiny', sans-serif` }}
              >
                {stores.find(s => s.id === activeStoreId)?.storeName ?? 'Store Name Preview'}
              </div>
            </div>

            {/* Save branding */}
            <button
              onClick={handleBrandSave}
              disabled={brandSaving}
              className="w-full py-3.5 rounded-xl font-bold text-[14px] text-white transition-colors disabled:opacity-60"
              style={{ backgroundColor: '#4A4B98' }}
            >
              {brandSaving ? 'Saving...' : brandSaved ? '✓ Saved!' : 'Save Branding'}
            </button>
          </div>
        )}
      </div>

      {/* Cashier PIN management */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EBEBF2]">
          <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">Cashier PINs</h2>
          <p className="text-[11px] text-[#8E8EA8] font-medium mt-0.5">
            Each cashier has their own 4-digit PIN. Only you can add or remove them.
          </p>
        </div>

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
            {adding ? 'Adding...' : 'Add Cashier'}
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
        Billing, cancellation, or technical issues?{'  '}
        <a href="mailto:support@binperks.com" className="underline text-[#4A4B98] font-semibold">
          support@binperks.com
        </a>
      </p>
    </div>
  )
}
