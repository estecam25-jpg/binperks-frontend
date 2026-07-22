// --- RedemptionsTab ---
'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

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

import type { RefObject } from 'react'

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function QrImg({ url, size }: { url: string; size: number }) {
  if (!url) return <div style={{ width: size, height: size, background: '#eee' }} />
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=${size * 2}x${size * 2}&data=${encodeURIComponent(url)}&format=png&margin=1`
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={size} height={size} alt="QR" crossOrigin="anonymous" style={{ display: 'block' }} />
}

/* ── off-screen material templates ──────────────────────────────── */

function PosterTemplate({ brandColor, brandName, logoUrl, joinUrl }: {
  brandColor: string; brandName: string; logoUrl: string | null; joinUrl: string
}) {
  return (
    <div style={{
      width: 816, height: 1056, background: brandColor,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 28, fontFamily: 'Montserrat, sans-serif',
      padding: '60px 48px',
    }}>
      {/* Logo / initials */}
      <div style={{
        width: 120, height: 120, borderRadius: '50%', background: 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', flexShrink: 0,
      }}>
        {logoUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={logoUrl} alt="" width={120} height={120} style={{ objectFit: 'cover', width: '100%', height: '100%' }} crossOrigin="anonymous" />
          : <span style={{ fontFamily: 'Coiny, cursive', fontSize: 44, color: brandColor, lineHeight: 1 }}>{initials(brandName)}</span>
        }
      </div>
      {/* Store name */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'Coiny, cursive', fontSize: 72, color: 'white', lineHeight: 1.1 }}>{brandName}</div>
        <div style={{ fontSize: 26, color: 'rgba(255,255,255,0.8)', fontWeight: 700, marginTop: 8, letterSpacing: 2 }}>REWARDS PROGRAM</div>
      </div>
      {/* QR */}
      <div style={{ background: 'white', padding: 20, borderRadius: 24 }}>
        <QrImg url={joinUrl} size={280} />
      </div>
      {/* CTA */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 28, color: 'white', fontWeight: 800 }}>Scan to join &amp; earn rewards</div>
        <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.65)', marginTop: 8 }}>Free to join · No app needed</div>
      </div>
      {/* Footer */}
      <div style={{ position: 'absolute', bottom: 32, fontSize: 14, color: 'rgba(255,255,255,0.5)', fontWeight: 600, letterSpacing: 1 }}>
        POWERED BY BINPERKS
      </div>
    </div>
  )
}

function TableTentTemplate({ brandColor, brandName, joinUrl }: {
  brandColor: string; brandName: string; joinUrl: string
}) {
  return (
    <div style={{
      width: 384, height: 576, background: 'white',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Montserrat, sans-serif', overflow: 'hidden',
    }}>
      {/* Color bar top */}
      <div style={{ height: 12, background: brandColor, flexShrink: 0 }} />
      {/* Content */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 20, padding: '32px 28px',
      }}>
        <div style={{ fontFamily: 'Coiny, cursive', fontSize: 42, color: '#1A1A2E', textAlign: 'center', lineHeight: 1.1 }}>
          {brandName}
        </div>
        <div style={{ background: '#F5F5F8', padding: 16, borderRadius: 16 }}>
          <QrImg url={joinUrl} size={180} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: brandColor }}>Scan to join BinPerks</div>
          <div style={{ fontSize: 13, color: '#8E8EA8', fontWeight: 600, marginTop: 4 }}>Earn rewards every visit</div>
        </div>
      </div>
      {/* Color bar bottom */}
      <div style={{ height: 12, background: brandColor, flexShrink: 0 }} />
    </div>
  )
}

function WindowClingTemplate({ brandColor, brandName, joinUrl }: {
  brandColor: string; brandName: string; joinUrl: string
}) {
  return (
    <div style={{
      width: 400, height: 400, background: 'white',
      border: `6px solid ${brandColor}`, borderRadius: 24,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 16, fontFamily: 'Montserrat, sans-serif', padding: 28,
    }}>
      <div style={{ fontFamily: 'Coiny, cursive', fontSize: 34, color: brandColor, textAlign: 'center', lineHeight: 1.1 }}>
        We&apos;re on BinPerks!
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, color: '#1A1A2E', textAlign: 'center' }}>{brandName}</div>
      <div style={{ background: '#F5F5F8', padding: 12, borderRadius: 14 }}>
        <QrImg url={joinUrl} size={160} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#8E8EA8', textAlign: 'center' }}>
        Scan to earn loyalty rewards
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(142,142,168,0.6)', letterSpacing: 0.5 }}>
        POWERED BY BINPERKS
      </div>
    </div>
  )
}

function SocialTemplate({ brandColor, brandName, joinUrl }: {
  brandColor: string; brandName: string; joinUrl: string
}) {
  return (
    <div style={{
      width: 1080, height: 1080, background: brandColor,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 36, fontFamily: 'Montserrat, sans-serif', padding: '80px 100px',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'Coiny, cursive', fontSize: 80, color: 'white', lineHeight: 1.1 }}>
          Join our BinPerks
        </div>
        <div style={{ fontFamily: 'Coiny, cursive', fontSize: 80, color: 'rgba(255,255,255,0.85)', lineHeight: 1 }}>
          Rewards Program!
        </div>
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, color: 'rgba(255,255,255,0.9)' }}>{brandName}</div>
      <div style={{ background: 'white', padding: 28, borderRadius: 28 }}>
        <QrImg url={joinUrl} size={320} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: 'white' }}>Free to join · No app needed</div>
        <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.65)', marginTop: 8, fontWeight: 600 }}>Earn rewards every visit you shop</div>
      </div>
    </div>
  )
}

/* ── download helper ─────────────────────────────────────────────── */

async function downloadMaterial(ref: RefObject<HTMLDivElement | null>, filename: string) {
  if (!ref.current) return
  const html2canvas = (await import('html2canvas')).default
  const canvas = await html2canvas(ref.current, {
    useCORS: true,
    allowTaint: false,
    scale: 1,
    logging: false,
  })
  const link = document.createElement('a')
  link.download = filename
  link.href = canvas.toDataURL('image/png')
  link.click()
}

async function downloadMaterialAsPdf(
  ref: RefObject<HTMLDivElement | null>,
  filename: string,
  widthIn: number,
  heightIn: number,
) {
  if (!ref.current) return
  const html2canvas = (await import('html2canvas')).default
  const { jsPDF } = await import('jspdf')
  const canvas = await html2canvas(ref.current, {
    useCORS: true,
    allowTaint: false,
    scale: 1,
    logging: false,
  })
  const orientation = widthIn >= heightIn ? 'landscape' : 'portrait'
  const doc = new jsPDF({ orientation, unit: 'in', format: [widthIn, heightIn] })
  doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, widthIn, heightIn)
  doc.save(filename)
}

/* ── MaterialCard ────────────────────────────────────────────────── */

function MaterialCard({
  title, description, previewScale, previewWidth, previewHeight, children,
  onDownload, downloading, onDownloadPdf, downloadingPdf,
}: {
  title: string; description: string
  previewScale: number; previewWidth: number; previewHeight: number
  children: React.ReactNode
  onDownload: () => void; downloading: boolean
  onDownloadPdf: () => void; downloadingPdf: boolean
}) {
  const scaledW = Math.round(previewWidth * previewScale)
  const scaledH = Math.round(previewHeight * previewScale)
  return (
    <div className="bg-white rounded-2xl px-5 py-5 shadow-sm flex flex-col gap-4">
      <div>
        <h3 className="font-['Coiny'] text-lg text-[#1A1A2E]">{title}</h3>
        <p className="text-[11px] text-[#8E8EA8] font-medium mt-0.5">{description}</p>
      </div>
      {/* Scaled preview */}
      <div className="flex justify-center">
        <div style={{ width: scaledW, height: scaledH, overflow: 'hidden', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
          <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'top left', width: previewWidth, height: previewHeight }}>
            {children}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onDownload}
          disabled={downloading || downloadingPdf}
          className="flex-1 py-3.5 rounded-xl font-bold text-[14px] text-[#4A4B98] font-['Montserrat'] border-2 border-[#4A4B98] disabled:opacity-50 active:bg-indigo-50 transition-colors"
        >
          {downloading ? 'Generating…' : '⬇ PNG'}
        </button>
        <button
          onClick={onDownloadPdf}
          disabled={downloading || downloadingPdf}
          className="flex-1 py-3.5 rounded-xl font-bold text-[14px] text-white font-['Montserrat'] bg-[#4A4B98] disabled:opacity-50 active:opacity-80 transition-opacity"
        >
          {downloadingPdf ? 'Generating…' : '⬇ PDF'}
        </button>
      </div>
    </div>
  )
}

export function MarketingTab({ storeId, stores }: { storeId: string | null; stores: { id: string; storeName: string; storeKey?: string; city: string; state: string }[] }) {
  const activeStore = storeId ? stores.find(s => s.id === storeId) : stores[0]
  const [copied, setCopied] = useState(false)
  const [memo, setMemo] = useState('')
  const [memoSaving, setMemoSaving] = useState(false)
  const [memoSaved, setMemoSaved] = useState(false)
  const [memoLoading, setMemoLoading] = useState(true)
  const [brandColor, setBrandColor] = useState('#4A4B98')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)

  const posterRef = useRef<HTMLDivElement>(null)
  const tentRef   = useRef<HTMLDivElement>(null)
  const clingRef  = useRef<HTMLDivElement>(null)
  const socialRef = useRef<HTMLDivElement>(null)

  const joinUrl = activeStore?.storeKey
    ? `https://app.binperks.com/join/${activeStore.storeKey}`
    : ''
  const brandName = activeStore?.storeName ?? 'BinPerks'

  const activeStoreId = storeId ?? stores[0]?.id

  useEffect(() => {
    if (!activeStoreId) return
    setMemoLoading(true)
    fetch(`/api/merchant/store?storeId=${activeStoreId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setMemo(d.memberMemo ?? '')
          setBrandColor(d.brandColor ?? '#4A4B98')
          setLogoUrl(d.logoUrl ?? null)
        }
        setMemoLoading(false)
      })
  }, [activeStoreId])

  async function handleCopyLink() {
    await navigator.clipboard.writeText(joinUrl).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  async function handleDownloadQR() {
    window.open(`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(joinUrl)}&format=png`, '_blank')
  }

  async function handleMemoSave() {
    if (!activeStoreId) return
    setMemoSaving(true)
    const res = await fetch('/api/merchant/store', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: activeStoreId, memberMemo: memo.trim() || null }),
    })
    setMemoSaving(false)
    if (res.ok) { setMemoSaved(true); setTimeout(() => setMemoSaved(false), 3000) }
  }

  async function handleDownload(key: string, ref: RefObject<HTMLDivElement | null>, filename: string) {
    if (!joinUrl) return
    setDownloading(key)
    try {
      await downloadMaterial(ref, filename)
    } finally {
      setDownloading(null)
    }
  }

  async function handleDownloadPdf(
    key: string,
    ref: RefObject<HTMLDivElement | null>,
    filename: string,
    widthIn: number,
    heightIn: number,
  ) {
    if (!joinUrl) return
    setDownloading(key)
    try {
      await downloadMaterialAsPdf(ref, filename, widthIn, heightIn)
    } finally {
      setDownloading(null)
    }
  }

  const safeName = (activeStore?.storeName ?? 'store').replace(/\s+/g, '-').toLowerCase()

  const materialProps = { brandColor, brandName, logoUrl, joinUrl }

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

      {/* Member Memo */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EBEBF2]">
          <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">Member Memo</h2>
          <p className="text-[11px] text-[#8E8EA8] font-medium mt-0.5">
            If left blank, the memo won&apos;t show on member dashboards.
          </p>
        </div>
        <div className="px-5 py-5 flex flex-col gap-3">
          {memoLoading ? (
            <div className="h-20 bg-[#F5F5F8] rounded-xl animate-pulse" />
          ) : (
            <>
              <div className="relative">
                <textarea
                  value={memo}
                  onChange={e => setMemo(e.target.value.slice(0, 160))}
                  placeholder="Shop our online auctions."
                  rows={3}
                  className="w-full rounded-xl border-2 border-[#EBEBF2] px-4 py-3 text-[14px] font-medium text-[#1A1A2E] placeholder-[#C5C5D5] resize-none focus:outline-none focus:border-[#4A4B98] transition-colors"
                />
                <span className={`absolute bottom-3 right-3 text-[11px] font-bold ${memo.length >= 150 ? 'text-[#DA1212]' : 'text-[#C5C5D5]'}`}>
                  {memo.length}/160
                </span>
              </div>
              <button
                onClick={handleMemoSave}
                disabled={memoSaving || memoSaved}
                className="w-full py-3.5 rounded-xl font-bold text-[14px] font-['Montserrat'] transition-all disabled:opacity-70"
                style={{
                  backgroundColor: memoSaved ? '#2A7D34' : '#4A4B98',
                  color: 'white',
                }}
              >
                {memoSaving ? 'Saving…' : memoSaved ? '✓ Saved' : 'Save Memo'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Marketing Materials */}
      <div className="flex flex-col gap-1 px-1 pt-2">
        <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">Marketing materials</h2>
        <p className="text-[12px] text-[#8E8EA8] font-medium">
          Download print-ready and digital materials branded for your store.
        </p>
      </div>

      {/* Off-screen templates for capture */}
      <div style={{ position: 'fixed', left: -9999, top: -9999, pointerEvents: 'none', zIndex: -1 }}>
        <div ref={posterRef}><PosterTemplate {...materialProps} /></div>
        <div ref={tentRef}><TableTentTemplate {...materialProps} /></div>
        <div ref={clingRef}><WindowClingTemplate {...materialProps} /></div>
        <div ref={socialRef}><SocialTemplate {...materialProps} /></div>
      </div>

      {/* Material 1 — QR Code Poster */}
      <MaterialCard
        title="QR Code Poster"
        description="8.5×11 — print and hang at your register or entrance"
        previewScale={0.31}
        previewWidth={816}
        previewHeight={1056}
        onDownload={() => handleDownload('poster', posterRef, `binperks-poster-${safeName}.png`)}
        downloading={downloading === 'poster-png'}
        onDownloadPdf={() => handleDownloadPdf('poster-pdf', posterRef, `binperks-poster-${safeName}.pdf`, 8.5, 11)}
        downloadingPdf={downloading === 'poster-pdf'}
      >
        <PosterTemplate {...materialProps} />
      </MaterialCard>

      {/* Material 2 — Table Tent */}
      <MaterialCard
        title="Table Tent Card"
        description="4×6 — fold and stand on your checkout counter"
        previewScale={0.55}
        previewWidth={384}
        previewHeight={576}
        onDownload={() => handleDownload('tent', tentRef, `binperks-tabletent-${safeName}.png`)}
        downloading={downloading === 'tent-png'}
        onDownloadPdf={() => handleDownloadPdf('tent-pdf', tentRef, `binperks-tabletent-${safeName}.pdf`, 4, 6)}
        downloadingPdf={downloading === 'tent-pdf'}
      >
        <TableTentTemplate {...materialProps} />
      </MaterialCard>

      {/* Material 3 — Window Cling */}
      <MaterialCard
        title="Window Cling"
        description="Square — print on window cling paper and stick to your door"
        previewScale={0.7}
        previewWidth={400}
        previewHeight={400}
        onDownload={() => handleDownload('cling', clingRef, `binperks-windowcling-${safeName}.png`)}
        downloading={downloading === 'cling-png'}
        onDownloadPdf={() => handleDownloadPdf('cling-pdf', clingRef, `binperks-windowcling-${safeName}.pdf`, 5, 5)}
        downloadingPdf={downloading === 'cling-pdf'}
      >
        <WindowClingTemplate {...materialProps} />
      </MaterialCard>

      {/* Material 4 — Social Media Graphic */}
      <MaterialCard
        title="Social Media Graphic"
        description="1080×1080 — share on Instagram, Facebook, or TikTok"
        previewScale={0.27}
        previewWidth={1080}
        previewHeight={1080}
        onDownload={() => handleDownload('social', socialRef, `binperks-social-${safeName}.png`)}
        downloading={downloading === 'social-png'}
        onDownloadPdf={() => handleDownloadPdf('social-pdf', socialRef, `binperks-social-${safeName}.pdf`, 6, 6)}
        downloadingPdf={downloading === 'social-pdf'}
      >
        <SocialTemplate {...materialProps} />
      </MaterialCard>

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

interface Cashier { id: string; name: string; role: string; isActive: boolean }

export function SettingsTab({ storeId, stores }: { storeId: string | null; stores: StoreRef[] }) {
  const activeStoreId = storeId ?? stores[0]?.id

  const [brandColor,    setBrandColor]    = useState('#4A4B98')
  const [fontFamily,    setFontFamily]    = useState('Google Sans')
  const [logoUrl,       setLogoUrl]       = useState<string | null>(null)
  const [reviewUrl,     setReviewUrl]     = useState<string>('')
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
          setReviewUrl(d.reviewUrl ?? '')
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
      body: JSON.stringify({ storeId: activeStoreId, brandColor, fontFamily: fontFamily || null, logoUrl, reviewUrl: reviewUrl || null }),
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

            {/* Review URL */}
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-bold text-[#1A1A2E]">Google Review URL</label>
              <input
                type="url"
                placeholder="https://g.page/r/your-review-link"
                value={reviewUrl}
                onChange={e => setReviewUrl(e.target.value)}
                className="rounded-xl border border-[#EBEBF2] bg-[#F5F5F8] px-4 py-2.5 text-[13px] text-[#1A1A2E] focus:outline-none focus:ring-2 focus:ring-[#4A4B98]/30 placeholder:text-[#D1D1DC]"
              />
              <p className="text-[11px] text-[#8E8EA8] font-medium">
                Members will see a &ldquo;Leave a Review&rdquo; button after submitting feedback.
              </p>
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
                    {c.role}
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
