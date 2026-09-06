'use client'

/**
 * Merchant Settings — What's In The Bins.
 *
 * Up to five photos per location of what is actually in the bins right now.
 * Members see them at the top of the store's View Perks panel, so this is the
 * one place a merchant can say "come in this week" with something other than a
 * price.
 *
 * PHOTOS DO NOT EXPIRE. They stay until the merchant replaces or removes them,
 * which is why the card says so out loud — a merchant who thinks these rotate
 * automatically will leave last month's stock on display.
 *
 * Per location: the Settings tab is already scoped by the location selector in
 * MerchantNav, so this card just takes that storeId.
 *
 * Module scope, not nested inside SettingsTab: a component declared inside
 * another gets a fresh identity every render, React remounts the subtree, and
 * every caption input loses focus after one keystroke (the bug fixed in 8b422a3).
 */

import { useCallback, useEffect, useRef, useState } from 'react'

const BLUE = '#4A4B98'
const MAX_PHOTOS = 5
const MAX_CAPTION = 120

interface BinPhoto {
  id: string
  storeId: string
  url: string | null
  caption: string | null
  displayOrder: number
}

export default function BinPhotosCard({ storeId }: { storeId: string | null }) {
  const [photos, setPhotos] = useState<BinPhoto[]>([])
  const [error, setError]   = useState('')
  const [busy, setBusy]     = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  /** Captions are edited locally and saved on blur, so a keystroke is not a
   *  round trip. Keyed by photo id. */
  const [captionDraft, setCaptionDraft] = useState<Record<string, string>>({})

  // Loading is DERIVED, matching PricingScheduleCard: the card is loading while
  // what is on screen belongs to a different store than the one selected.
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const loading = !!storeId && loadedFor !== storeId

  const load = useCallback(async (id: string) => {
    const res = await fetch(`/api/merchant/bin-photos?storeId=${encodeURIComponent(id)}`)
    if (!res.ok) { setLoadedFor(id); return }
    const d = await res.json()
    const list = (d.photos ?? []) as BinPhoto[]
    setPhotos(list)
    setCaptionDraft(Object.fromEntries(list.map(p => [p.id, p.caption ?? ''])))
    setLoadedFor(id)
  }, [])

  useEffect(() => {
    if (!storeId) return
    let cancelled = false
    fetch(`/api/merchant/bin-photos?storeId=${encodeURIComponent(storeId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled) return
        const list = (d?.photos ?? []) as BinPhoto[]
        setPhotos(list)
        setCaptionDraft(Object.fromEntries(list.map(p => [p.id, p.caption ?? ''])))
        setLoadedFor(storeId)
      })
      .catch(() => { if (!cancelled) setLoadedFor(storeId) })
    return () => { cancelled = true }
  }, [storeId])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Allow re-picking the same file after a failure.
    if (fileInput.current) fileInput.current.value = ''
    if (!file || !storeId) return

    setError('')
    setUploading(true)

    const form = new FormData()
    form.append('storeId', storeId)
    form.append('file', file)

    const res = await fetch('/api/merchant/bin-photos', { method: 'POST', body: form })
    setUploading(false)

    if (!res.ok) {
      const d = await res.json().catch(() => null)
      setError(
        d?.error === 'limit_reached'   ? `You can show up to ${MAX_PHOTOS} photos per location. Remove one first.` :
        d?.error === 'file_too_large'  ? 'That photo is too large. Try one taken at a normal size.' :
        d?.error === 'unreadable_image'? "That file isn't an image we can read. Try a JPEG or PNG." :
        'Could not upload that photo. Try again.',
      )
      return
    }

    const d = await res.json()
    if (d.photo) {
      setPhotos(prev => [...prev, d.photo as BinPhoto])
      setCaptionDraft(prev => ({ ...prev, [d.photo.id]: '' }))
    }
  }

  async function saveCaption(id: string) {
    const value = captionDraft[id] ?? ''
    const current = photos.find(p => p.id === id)?.caption ?? ''
    if (value === current) return

    setBusy(id)
    const res = await fetch(`/api/merchant/bin-photos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caption: value }),
    })
    setBusy(null)
    if (res.ok) {
      setPhotos(prev => prev.map(p => p.id === id ? { ...p, caption: value || null } : p))
    } else {
      setError('Could not save that caption.')
    }
  }

  async function remove(id: string) {
    setBusy(id)
    setError('')
    const res = await fetch(`/api/merchant/bin-photos/${id}`, { method: 'DELETE' })
    setBusy(null)
    if (res.ok) setPhotos(prev => prev.filter(p => p.id !== id))
    else setError('Could not remove that photo.')
  }

  /**
   * Move one photo up or down.
   *
   * Up/down arrows rather than drag: this is a five-item list on a phone, and
   * a drag target that small is harder to hit than two buttons.
   *
   * Both affected rows are written, and the local order is updated first so the
   * list does not jump while the requests are in flight.
   */
  async function move(id: string, direction: -1 | 1) {
    const index = photos.findIndex(p => p.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= photos.length) return

    const reordered = [...photos]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved)

    // Renumber the whole list so display_order always matches position, rather
    // than swapping two values and letting gaps accumulate.
    const renumbered = reordered.map((p, i) => ({ ...p, displayOrder: i }))
    setPhotos(renumbered)
    setBusy(id)

    await Promise.all(renumbered.map(p =>
      fetch(`/api/merchant/bin-photos/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayOrder: p.displayOrder }),
      }).catch(() => {}),
    ))
    setBusy(null)
    if (storeId) load(storeId)
  }

  const atLimit = photos.length >= MAX_PHOTOS

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden" id="bin-photos">
      <div className="px-5 py-4 border-b border-[#EBEBF2]">
        <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">What&apos;s In The Bins</h2>
        <p className="text-[11px] text-[#8E8EA8] font-medium mt-0.5 leading-relaxed">
          Up to {MAX_PHOTOS} photos of what is in your bins right now. Members see these on
          your store page. They stay up until you change them — refresh them when your
          stock does.
        </p>
      </div>

      {!storeId ? (
        <p className="px-5 py-4 text-[13px] text-[#8E8EA8] font-medium">
          Pick a location above to manage its photos.
        </p>
      ) : loading ? (
        <div className="p-5 flex flex-col gap-3">
          {[...Array(2)].map((_, i) => <div key={i} className="h-20 bg-[#F5F5F8] rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="p-5 flex flex-col gap-4">

          {photos.length === 0 && (
            <p className="text-[13px] text-[#8E8EA8] font-medium">
              No photos yet. Members see this section only once you add one.
            </p>
          )}

          {photos.map((photo, i) => (
            <div key={photo.id} className="flex gap-3">
              {photo.url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={photo.url}
                  alt={photo.caption ?? 'Bin photo'}
                  // Not loading="lazy": an offscreen lazy image never requests,
                  // so onError never fires and an expired signed URL would leave
                  // a gap instead of the placeholder.
                  decoding="async"
                  className="w-20 h-20 rounded-xl object-cover bg-[#F5F5F8] border border-[#EBEBF2] flex-shrink-0"
                />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-[#F5F5F8] border border-[#EBEBF2] flex items-center justify-center flex-shrink-0">
                  <span className="text-xl">📷</span>
                </div>
              )}

              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <input
                  type="text"
                  maxLength={MAX_CAPTION}
                  placeholder="Caption (optional)"
                  value={captionDraft[photo.id] ?? ''}
                  onChange={e => setCaptionDraft(prev => ({ ...prev, [photo.id]: e.target.value }))}
                  onBlur={() => saveCaption(photo.id)}
                  aria-label={`Caption for photo ${i + 1}`}
                  className="rounded-xl border border-[#EBEBF2] bg-[#F5F5F8] px-3 py-2 text-[13px] text-[#1A1A2E] focus:outline-none focus:ring-2 focus:ring-[#4A4B98]/30 placeholder:text-[#D1D1DC]"
                />

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => move(photo.id, -1)}
                    disabled={i === 0 || busy === photo.id}
                    aria-label="Move photo up"
                    className="px-2.5 py-1.5 rounded-lg text-[12px] font-bold bg-[#F5F5F8] text-[#1A1A2E] disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(photo.id, 1)}
                    disabled={i === photos.length - 1 || busy === photo.id}
                    aria-label="Move photo down"
                    className="px-2.5 py-1.5 rounded-lg text-[12px] font-bold bg-[#F5F5F8] text-[#1A1A2E] disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <span className="text-[11px] font-semibold text-[#B0B0C8] ml-1">
                    {i + 1} of {photos.length}
                  </span>
                  <button
                    onClick={() => remove(photo.id)}
                    disabled={busy === photo.id}
                    className="ml-auto px-2.5 py-1.5 rounded-lg text-[12px] font-bold disabled:opacity-40"
                    style={{ color: '#DA1212' }}
                  >
                    {busy === photo.id ? '…' : 'Remove'}
                  </button>
                </div>
              </div>
            </div>
          ))}

          {error && (
            <p className="text-[12px] font-semibold" style={{ color: '#DA1212' }}>{error}</p>
          )}

          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleUpload}
          />

          <button
            onClick={() => fileInput.current?.click()}
            disabled={atLimit || uploading}
            className="w-full py-3.5 rounded-xl font-bold text-[14px] text-white transition-colors disabled:opacity-40"
            style={{ backgroundColor: BLUE }}
          >
            {uploading ? 'Uploading…' : atLimit ? `Maximum ${MAX_PHOTOS} photos` : '+ Add a photo'}
          </button>

          <p className="text-[10px] text-[#8E8EA8] font-medium leading-relaxed">
            Photos are resized automatically. Location data is stripped before storage —
            a photo of your shop floor never carries its coordinates to members.
          </p>
        </div>
      )}
    </div>
  )
}
