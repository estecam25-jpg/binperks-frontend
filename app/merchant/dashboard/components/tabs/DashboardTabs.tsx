'use client'

import { useEffect, useState } from 'react'
import PricingScheduleCard from '../PricingScheduleCard'
import BinPhotosCard from '../BinPhotosCard'
import StoreAddressCard from '../StoreAddressCard'
import SuggestedPerks from '../SuggestedPerks'
import { validatePin } from '@/lib/pin-strength'
import { personalizeCaption } from '@/lib/social-caption'
import {
  SECTIONS, materialsInSection, type MaterialSpec,
} from '@/lib/marketing-materials'

// --- PerksTab ---

interface Perk { slot: number; title: string; description: string; isActive: boolean }
interface StoreRef { id: string; storeName: string; storeKey?: string }

/**
 * Empty perk slots — what a merchant starts from.
 *
 * NO PRE-FILLED PERKS. These used to be stocked with example perks ("Birthday
 * Perk", "VIP Bins", …) shown as active, which a merchant could save without
 * reading: the examples then became that store's real member-facing perks, and
 * the onboarding checklist ticked itself. Every perk is now written by the
 * merchant. Ideas still live in the Suggested Perks panel, which copies to the
 * clipboard rather than filling these in.
 *
 * The slots themselves stay (2 free, 5 VIP) — they are the editor, not content.
 */
function emptyPerks(count: number): Perk[] {
  return Array.from({ length: count }, (_, i) => ({
    slot: i + 1, title: '', description: '', isActive: false,
  }))
}

/**
 * One editable perk.
 *
 * MUST stay at module scope. This was previously declared inside PerksTab, so
 * every keystroke — which sets state and re-renders the tab — produced a NEW
 * function identity for this component. React compares element types by
 * identity, saw a different type in the same position, and unmounted the whole
 * subtree to mount a fresh one. The DOM input was destroyed and recreated on
 * every character, which is why focus jumped out after each letter.
 *
 * Declaring it here gives it one stable identity for the life of the module,
 * so React reconciles the existing input instead of replacing it.
 */
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

export function PerksTab({ storeId, stores }: { storeId: string | null; stores: StoreRef[] }) {
  const activeStoreId = storeId ?? stores[0]?.id
  const [freePerks, setFreePerks] = useState<Perk[]>(() => emptyPerks(2))
  const [vipPerks, setVipPerks] = useState<Perk[]>(() => emptyPerks(5))
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
        setFreePerks(fp.length > 0 ? fp : emptyPerks(2))
        setVipPerks(vp.length > 0 ? vp : emptyPerks(5))
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

      {/* Below the Save button on purpose: ideas to borrow, not part of the
          form being submitted. */}
      <SuggestedPerks />
    </div>
  )
}

// --- MarketingTab ---

/**
 * Ready-made social post — BinPerks artwork, and the caption to go with it.
 *
 * ADMIN WRITES BOTH, once, for the whole network (admin dashboard → Social
 * Media). Nothing here is per-merchant except the join link, which is
 * substituted into the caption for whichever store is selected. That is why
 * the caption arrives raw with its placeholder still in it: this component is
 * the only place that knows whose link to put in.
 *
 * The four hardcoded placeholder squares that used to sit here are gone — the
 * strip now shows exactly what admin has uploaded, and says so plainly when
 * that is nothing.
 */
function SocialPostSection({ joinUrl }: { joinUrl: string }) {
  const [images, setImages]   = useState<{ id: string; url: string | null }[]>([])
  const [caption, setCaption] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied]   = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/merchant/social-graphics')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d) return
        setImages(d.images ?? [])
        setCaption(d.caption ?? null)
      })
      .catch(() => { /* the section renders its empty state; no error box */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Substituted HERE, not on the server: a merchant with several locations
  // switches stores from the picker on this page, and the caption has to
  // follow without another round trip.
  const personalized = caption ? personalizeCaption(caption, joinUrl) : ''

  async function handleCopy() {
    if (!personalized) return
    try {
      await navigator.clipboard.writeText(personalized)
    } catch {
      // Clipboard is blocked in some in-app browsers. The caption is on screen
      // to select by hand, and a textarea copy still works where it is not.
      const el = document.createElement('textarea')
      el.value = personalized
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      el.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="bg-white rounded-2xl px-5 py-5 shadow-sm flex flex-col gap-4">
      <div>
        <h3 className="font-['Coiny'] text-lg text-[#1A1A2E]">Social Media Post</h3>
        <p className="text-[11px] text-[#8E8EA8] font-medium mt-0.5">
          Save a graphic, copy the caption, post it on Instagram, Facebook or TikTok.
        </p>
      </div>

      {loading ? (
        <div className="h-40 rounded-xl bg-[#F5F5F8] animate-pulse" />
      ) : images.length === 0 ? (
        <p className="text-[13px] text-[#8E8EA8] font-medium">
          Social media graphics coming soon
        </p>
      ) : (
        /* Scrolls sideways inside its own box; the tab never scrolls sideways.
           The negative margin lets the strip bleed to the card edge while the
           padding keeps the first square aligned with the text above it. */
        <div className="overflow-x-auto -mx-5 px-5">
          <div className="flex gap-2.5 w-max pb-1">
            {images.map((img, i) => (
              img.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={img.id}
                  src={img.url}
                  alt={`BinPerks social graphic ${i + 1}`}
                  className="w-40 h-40 flex-shrink-0 object-cover rounded-xl bg-[#F5F5F8] border border-[#EBEBF2]"
                />
              ) : null
            ))}
          </div>
        </div>
      )}

      {/* No caption written yet shows NOTHING — not an empty box and not a
          dead Copy button. whitespace-pre-wrap because the blank lines between
          paragraphs are the layout, and collapsing them would show the
          merchant something other than what the button copies. */}
      {!loading && personalized && (
        <>
          <div className="rounded-xl bg-[#F5F5F8] px-4 py-3.5">
            <p className="text-[12px] font-medium text-[#1A1A2E] leading-relaxed whitespace-pre-wrap break-words">
              {personalized}
            </p>
          </div>

          <button
            onClick={handleCopy}
            className="w-full py-3.5 rounded-xl font-bold text-[14px] text-white font-['Montserrat'] active:opacity-80 transition-all"
            style={{ backgroundColor: copied ? '#2A7D34' : '#4A4B98' }}
          >
            {copied ? '✓ Caption copied' : 'Copy Caption'}
          </button>
        </>
      )}
    </div>
  )
}


/**
 * One material, as a card in a horizontal strip.
 *
 * THE FILE IS BUILT WHEN IT IS ASKED FOR. There is nothing to preview from
 * storage and nothing cached: the route composes the BinPerks artwork with
 * this store's name and QR on the way out, so a download is a request rather
 * than a link. The button therefore has to show its own progress.
 *
 * A material whose artwork admin has not uploaded is shown, disabled, saying
 * so \u2014 rather than hidden, which would leave a merchant wondering whether
 * they had missed something.
 */
function MaterialCard({
  spec, storeId, available,
}: {
  spec: MaterialSpec
  storeId: string | null
  available: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function download() {
    if (!available || !storeId) return
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/merchant/marketing/${spec.slug}?storeId=${encodeURIComponent(storeId)}`)
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setErr(d.error === 'artwork_missing' ? 'Artwork not ready yet.' : 'Could not build that file.')
        return
      }
      // Blob, not a plain link: the route answers with an attachment and this
      // keeps the merchant on the page rather than navigating away from it.
      const blob = await res.blob()
      const name = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1]
        ?? `${spec.fileStem}.${spec.output}`
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href; a.download = name
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(href)
    } catch {
      setErr('Could not build that file.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="w-[260px] flex-shrink-0 bg-white rounded-2xl px-4 py-4 shadow-sm flex flex-col gap-2.5">
      <div className="min-h-[3.5rem]">
        <h3 className="text-[14px] font-extrabold text-[#1A1A2E] leading-tight">{spec.label}</h3>
        <p className="text-[11px] text-[#8E8EA8] font-medium mt-1 leading-snug">{spec.description}</p>
      </div>

      {err && <p className="text-[11px] font-semibold text-[#DA1212]">{err}</p>}

      <button
        onClick={download}
        disabled={!available || busy || !storeId}
        title={available ? undefined : 'BinPerks has not published this artwork yet'}
        className="w-full mt-auto py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed active:opacity-80 transition-opacity"
        style={{ backgroundColor: '#4A4B98' }}
      >
        {busy ? 'Preparing\u2026'
          : !available ? 'Coming soon'
          : `Download ${spec.output.toUpperCase()}`}
      </button>
    </article>
  )
}

/** One titled, horizontally scrolling strip of materials. */
function MaterialSection({
  section, storeId,
}: {
  section: { id: 'register' | 'signage'; title: string; subtitle: string }
  storeId: string | null
}) {
  const [availability, setAvailability] = useState<Record<string, boolean>>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/merchant/marketing')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d) return
        const map: Record<string, boolean> = {}
        for (const m of d.materials ?? []) map[m.slug] = !!m.available
        setAvailability(map)
      })
      .catch(() => { /* everything shows as not-ready; nothing breaks */ })
      .finally(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [])

  const items = materialsInSection(section.id)

  return (
    <section className="flex flex-col gap-2.5">
      <div className="px-1">
        <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">{section.title}</h2>
        <p className="text-[12px] text-[#8E8EA8] font-medium mt-0.5">{section.subtitle}</p>
      </div>

      {/* Scrolls sideways inside its own box; the tab never scrolls sideways.
          The negative margin lets the cards bleed to the edge while the padding
          keeps the first one aligned with the heading. */}
      <div className="overflow-x-auto -mx-4 px-4 pb-1">
        <div className="flex gap-3 w-max items-stretch">
          {items.map(spec => (
            <MaterialCard
              key={spec.slug}
              spec={spec}
              storeId={storeId}
              available={loaded ? (availability[spec.slug] ?? false) : false}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

export function MarketingTab({ storeId, stores }: { storeId: string | null; stores: { id: string; storeName: string; storeKey?: string; city: string; state: string }[] }) {
  const activeStore = storeId ? stores.find(s => s.id === storeId) : stores[0]
  const [copied, setCopied] = useState(false)
  const [storeMessage, setStoreMessage] = useState('')
  const [messageSaving, setMessageSaving] = useState(false)
  const [messageSaved, setMessageSaved] = useState(false)
  const [messageLoading, setMessageLoading] = useState(true)

  const joinUrl = activeStore?.storeKey
    ? `https://app.binperks.com/join/${activeStore.storeKey}`
    : ''

  const activeStoreId = storeId ?? stores[0]?.id

  useEffect(() => {
    if (!activeStoreId) return
    setMessageLoading(true)
    fetch(`/api/merchant/store?storeId=${activeStoreId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) setStoreMessage(d.storeMessage ?? '')
        setMessageLoading(false)
      })
  }, [activeStoreId])

  async function handleCopyLink() {
    await navigator.clipboard.writeText(joinUrl).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  async function handleStoreMessageSave() {
    if (!activeStoreId) return
    setMessageSaving(true)
    const res = await fetch('/api/merchant/store', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: activeStoreId, storeMessage: storeMessage.trim() || null }),
    })
    setMessageSaving(false)
    if (res.ok) { setMessageSaved(true); setTimeout(() => setMessageSaved(false), 3000) }
  }

  return (
    <div className="flex flex-col gap-5 p-4 pb-12">

      {/* The two material sections. Everything in them is built server-side
          from the BinPerks artwork admin uploads \u2014 see lib/marketing-render. */}
      {SECTIONS.map(section => (
        <MaterialSection
          key={section.id}
          section={section}
          storeId={activeStoreId ?? null}
        />
      ))}

      {/* Social post kit \u2014 admin-written artwork and caption, personalised
          with this store's join link. Not one of the printed materials. */}
      <SocialPostSection joinUrl={joinUrl} />

      {/* Store Message */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EBEBF2]">
          <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">Store Message</h2>
          <p className="text-[11px] text-[#8E8EA8] font-medium mt-0.5">
            Shown to members when they open your store in the BinPerks store finder.
            If left blank, the section is hidden.
          </p>
        </div>
        <div className="px-5 py-5 flex flex-col gap-3">
          {messageLoading ? (
            <div className="h-20 bg-[#F5F5F8] rounded-xl animate-pulse" />
          ) : (
            <>
              <div className="relative">
                <textarea
                  value={storeMessage}
                  onChange={e => setStoreMessage(e.target.value.slice(0, 160))}
                  placeholder="Shop our online auctions."
                  rows={3}
                  className="w-full rounded-xl border-2 border-[#EBEBF2] px-4 py-3 text-[14px] font-medium text-[#1A1A2E] placeholder-[#C5C5D5] resize-none focus:outline-none focus:border-[#4A4B98] transition-colors"
                />
                <span className={`absolute bottom-3 right-3 text-[11px] font-bold ${storeMessage.length >= 150 ? 'text-[#DA1212]' : 'text-[#C5C5D5]'}`}>
                  {storeMessage.length}/160
                </span>
              </div>
              <button
                onClick={handleStoreMessageSave}
                disabled={messageSaving || messageSaved}
                className="w-full py-3.5 rounded-xl font-bold text-[14px] font-['Montserrat'] transition-all disabled:opacity-70"
                style={{ backgroundColor: messageSaved ? '#2A7D34' : '#4A4B98', color: 'white' }}
              >
                {messageSaving ? 'Saving\u2026' : messageSaved ? '\u2713 Saved' : 'Save Message'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* \u2500\u2500 Member join link \u2500\u2500 last on the tab, deliberately.
          It is the raw URL behind every material above it \u2014 the QR codes
          encode it and the social caption embeds it \u2014 so a merchant who needs
          the bare link is looking for it on purpose. */}
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
            {copied ? '\u2713 Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  )
}

// W-9 collection moved to DocuSeal, bundled with the Merchant Agreement.
// The upload UI that lived here is gone; /api/merchant/w9 and every
// merchant_w9 record are deliberately untouched, so the admin W-9 review
// screen still works on already-submitted forms.

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
  const [binCount,      setBinCount]      = useState<string>('')
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
          setBinCount(d.binCount != null ? String(d.binCount) : '')
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
      body: JSON.stringify({ storeId: activeStoreId, brandColor, fontFamily: fontFamily || null, logoUrl, reviewUrl: reviewUrl || null, binCount: binCount ? Number(binCount) : null }),
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
    if (!newName.trim()) {
      setAddError('Name and a 4-digit PIN are required')
      return
    }
    // Immediate feedback before the round trip. The API re-checks with the same
    // shared list — this is convenience, not the enforcement.
    const pinError = validatePin(newPin)
    if (pinError) {
      setAddError(pinError)
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

            {/* Bin count */}
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-bold text-[#1A1A2E]">Number of Bins</label>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                placeholder="e.g. 150"
                value={binCount}
                onChange={e => setBinCount(e.target.value)}
                className="rounded-xl border border-[#EBEBF2] bg-[#F5F5F8] px-4 py-2.5 text-[13px] text-[#1A1A2E] focus:outline-none focus:ring-2 focus:ring-[#4A4B98]/30 placeholder:text-[#D1D1DC]"
              />
              <p className="text-[11px] text-[#8E8EA8] font-medium">
                Update if your bin count changes.
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

      {/* Address — feeds the Directions button on member store cards. */}
      <StoreAddressCard storeId={activeStoreId ?? null} />

      {/* Pricing schedule — own card, own fetch/save against the same route. */}
      <PricingScheduleCard storeId={activeStoreId ?? null} />

      {/* What's In The Bins — the onboarding checklist deep-links to #bin-photos. */}
      <BinPhotosCard storeId={activeStoreId ?? null} />

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


// --- GettingStartedTab ---

interface OnboardingItem {
  id: string; label: string; completed: boolean; binPerks: boolean
  /** Optional second line, for items where the label alone does not say why. */
  description?: string
  /** Optional deep link to wherever the item is actually done. */
  href?: string
}

export function GettingStartedTab({ storeId }: { storeId: string | null }) {
  const [items,          setItems]          = useState<OnboardingItem[]>([])
  const [completedCount, setCompletedCount] = useState(0)
  // Denominator comes from the API, not a constant. It was hardcoded to 13
  // while the route builds 12 items, so the checklist could never reach 100%
  // and read as "x/13" against a list of 12.
  const [total,          setTotal]          = useState(0)
  const [loading,        setLoading]        = useState(true)
  const [loadFailed,     setLoadFailed]     = useState(false)
  const [confirming,     setConfirming]     = useState(false)
  const [confirmed,      setConfirmed]      = useState(false)

  useEffect(() => {
    fetch('/api/merchant/onboarding')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setItems(d.items ?? [])
          setCompletedCount(d.completedCount ?? 0)
          setTotal(d.total ?? (d.items ?? []).length)
        } else {
          // Previously this left an empty checklist behind with no explanation,
          // which reads as "the tab is broken" rather than "we could not load".
          setLoadFailed(true)
        }
        setLoading(false)
      })
      .catch(() => { setLoadFailed(true); setLoading(false) })
  }, [])

  async function handleConfirmTraining() {
    setConfirming(true)
    const res = await fetch('/api/merchant/onboarding', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'confirm_training' }),
    })
    if (res.ok) {
      setConfirmed(true)
      setItems(prev => prev.map(i => i.id === 'cashier_training' ? { ...i, completed: true } : i))
      setCompletedCount(c => c + 1)
    }
    setConfirming(false)
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3 p-4 pb-12">
        {[...Array(6)].map((_, i) => <div key={i} className="h-12 bg-white rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  if (loadFailed || items.length === 0) {
    return (
      <div className="flex flex-col gap-4 p-4 pb-16">
        <div className="bg-white rounded-2xl py-14 px-6 text-center flex flex-col items-center gap-3">
          <span className="text-3xl">📋</span>
          <p className="text-[14px] font-semibold text-[#8E8EA8] max-w-xs leading-relaxed">
            We couldn&apos;t load your setup checklist. Please refresh, or email{' '}
            <a href="mailto:support@binperks.com" className="underline text-[#4A4B98]">
              support@binperks.com
            </a>.
          </p>
        </div>
      </div>
    )
  }

  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0
  const allDone = total > 0 && completedCount >= total
  const binPerksItems = items.filter(i => i.binPerks)
  const merchantItems = items.filter(i => !i.binPerks)

  return (
    <div className="flex flex-col gap-4 p-4 pb-16">

      {/* Header + progress */}
      <div className="bg-[#1A1A2E] rounded-2xl px-5 py-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-['Coiny'] text-2xl text-white">Getting Started</h2>
          <span className="font-['Coiny'] text-2xl text-[#FFB217]">{completedCount}/{total}</span>
        </div>
        <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: pct + '%', backgroundColor: pct === 100 ? '#4ade80' : '#FFB217' }}
          />
        </div>
        {allDone && (
          <p className="text-[13px] font-bold text-green-400">
            🎉 You&apos;re all set! Your BinPerks loyalty program is live.
          </p>
        )}
      </div>

      {/* BinPerks sets up */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-[#EBEBF2] bg-[#F5F5F8]">
          <p className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#8E8EA8]">
            BinPerks sets this up for you
          </p>
        </div>
        <div className="divide-y divide-[#EBEBF2]">
          {binPerksItems.map(item => (
            <div key={item.id} className="px-5 py-3.5 flex items-center gap-3">
              <span className="text-[18px] flex-shrink-0">{item.completed ? '✅' : '⬜'}</span>
              <p className={`text-[13px] font-semibold flex-1 ${item.completed ? 'text-[#8E8EA8] line-through' : 'text-[#1A1A2E]'}`}>
                {item.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Merchant responsibility */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-[#EBEBF2] bg-[#F5F5F8]">
          <p className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#8E8EA8]">
            Your responsibility
          </p>
        </div>
        <div className="divide-y divide-[#EBEBF2]">
          {merchantItems.map(item => (
            <div key={item.id} className="px-5 py-3.5 flex items-center gap-3">
              <span className="text-[18px] flex-shrink-0">{item.completed ? '✅' : '⬜'}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-[13px] font-semibold ${item.completed ? 'text-[#8E8EA8] line-through' : 'text-[#1A1A2E]'}`}>
                  {item.label}
                </p>
                {item.description && !item.completed && (
                  <p className="text-[11px] text-[#8E8EA8] font-medium mt-0.5 leading-relaxed">
                    {item.description}
                  </p>
                )}
              </div>
              {item.href && !item.completed && (
                <a
                  href={item.href}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-[#4A4B98] text-white text-[11px] font-bold"
                >
                  Add
                </a>
              )}
              {item.id === 'cashier_training' && !item.completed && (
                <button
                  onClick={handleConfirmTraining}
                  disabled={confirming || confirmed}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-[#4A4B98] text-white text-[11px] font-bold disabled:opacity-50"
                >
                  {confirming ? '…' : 'Mark done'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
