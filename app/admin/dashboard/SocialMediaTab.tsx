'use client'

/**
 * Admin — the social media post kit every merchant sees.
 *
 * NETWORK-WIDE AND LIVE. There is no draft and no publish step: an upload, a
 * delete, a reorder or a caption save appears on every merchant's Marketing
 * tab on their next load. The copy on screen says so, because "save" reading
 * as "save a draft" is the mistake worth preventing here.
 *
 * NOT a ContentTab. The generic content tabs are CRUD over independent rows
 * with titles and active toggles; this is one ordered set of images plus one
 * shared caption, so it gets its own screen.
 *
 * Inputs live in this component rather than a nested one, so React never
 * remounts them mid-typing (the focus bug fixed in 8b422a3).
 */

import { useEffect, useRef, useState } from 'react'
import { REFERRAL_LINK_TOKEN, MAX_CAPTION_LENGTH } from '@/lib/social-caption'

const BLUE = '#4A4B98'

interface SocialImage {
  id: string
  url: string | null
  displayOrder: number
}

export default function SocialMediaTab() {
  const [images, setImages]   = useState<SocialImage[]>([])
  const [caption, setCaption] = useState('')
  // Seeded from the shared constant and replaced by whatever the API reports,
  // so the string shown to admin is the one the substitution actually matches.
  const [token, setToken]     = useState(REFERRAL_LINK_TOKEN)
  const [maxImages, setMax]   = useState(10)

  const [loading, setLoading]     = useState(true)
  const [uploading, setUploading] = useState(false)
  const [savingCaption, setSaving] = useState(false)
  const [captionSaved, setSaved]  = useState(false)
  const [busyId, setBusyId]       = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)

  const fileInput = useRef<HTMLInputElement>(null)

  /**
   * Load the kit once, on mount.
   *
   * A .then() chain rather than an async helper called from the effect: every
   * state write then happens in a callback, not synchronously in the effect
   * body, which is what react-hooks/set-state-in-effect is there to enforce.
   * Same shape as AnnouncementsTab. `loading` starts true, so the first render
   * is already the loading one and nothing has to set it.
   */
  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/social-graphics')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled) return
        if (!d) { setError('Couldn’t load the social kit.'); return }
        setImages(d.images ?? [])
        setCaption(d.caption ?? '')
        if (d.token) setToken(d.token)
        if (d.maxImages) setMax(d.maxImages)
      })
      .catch(() => { if (!cancelled) setError('Couldn’t load the social kit.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Cleared immediately so picking the same file twice in a row still fires
    // a change event.
    e.target.value = ''
    if (!file) return

    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/admin/social-graphics', { method: 'POST', body: form })
      const d = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(
          d.error === 'limit_reached'   ? `That is the limit of ${maxImages} images. Delete one first.` :
          d.error === 'file_too_large'  ? 'That file is too large.' :
          d.error === 'unreadable_image' ? 'That file could not be read as an image.' :
          'Upload failed. Please try again.',
        )
        return
      }
      if (d.image) setImages(prev => [...prev, d.image as SocialImage])
    } catch {
      setError('Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this graphic? It disappears from every merchant immediately.')) return
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/social-graphics/${id}`, { method: 'DELETE' })
      if (!res.ok) { setError('Delete failed. Please try again.'); return }
      setImages(prev => prev.filter(i => i.id !== id))
    } catch {
      setError('Delete failed. Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  /**
   * Move one image one place left or right.
   *
   * Arrows rather than drag-and-drop: this runs on a phone as often as a
   * desktop, and a dragged thumbnail inside a scrolling list is the one
   * interaction that reliably fights the scroll.
   *
   * Optimistic, with the new order posted as a full list of ids — the server
   * rewrites every position from it, so the sequence cannot drift.
   */
  async function move(id: string, delta: -1 | 1) {
    const from = images.findIndex(i => i.id === id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= images.length) return

    const next = [...images]
    ;[next[from], next[to]] = [next[to], next[from]]

    const previous = images
    setImages(next)
    setBusyId(id)
    try {
      const res = await fetch('/api/admin/social-graphics', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: next.map(i => i.id) }),
      })
      if (!res.ok) { setImages(previous); setError('Reorder failed.') }
    } catch {
      setImages(previous)
      setError('Reorder failed.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleSaveCaption() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/social-graphics', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption }),
      })
      if (!res.ok) { setError('Caption save failed.'); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError('Caption save failed.')
    } finally {
      setSaving(false)
    }
  }

  function insertToken() {
    setCaption(c => (c ? `${c}\n\n${token}` : token))
  }

  const hasToken = caption.toLowerCase().includes(token.toLowerCase())

  return (
    <div className="flex flex-col gap-5">

      <div>
        <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">Social Media Marketing</h2>
        <p className="text-[12px] text-[#8E8EA8] font-medium mt-1 leading-relaxed">
          The graphics and caption every merchant sees on their Marketing tab.
          Changes are live for all merchants as soon as they are saved — there is
          no draft.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-[12px] font-semibold text-[#DA1212]">{error}</p>
        </div>
      )}

      {/* ── Graphics ── */}
      <section className="bg-white rounded-2xl px-5 py-5 shadow-sm flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[15px] font-extrabold text-[#1A1A2E]">Graphics</h3>
          <span className="text-[11px] font-bold text-[#8E8EA8]">
            {images.length} / {maxImages}
          </span>
        </div>

        {loading ? (
          <div className="h-32 rounded-xl bg-[#F5F5F8] animate-pulse" />
        ) : images.length === 0 ? (
          <p className="text-[13px] text-[#8E8EA8] font-medium">
            No graphics yet. Merchants see “Social media graphics coming soon”
            until the first one is uploaded.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {images.map((img, i) => (
              <div key={img.id} className="flex flex-col gap-1.5">
                <div className="relative aspect-square rounded-xl overflow-hidden bg-[#F5F5F8] border border-[#EBEBF2]">
                  {img.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img.url}
                      alt={`Social graphic ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-[11px] font-bold text-[#B0B0C8]">Unavailable</span>
                    </div>
                  )}
                  <span
                    className="absolute top-1.5 left-1.5 text-[10px] font-extrabold text-white px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: BLUE }}
                  >
                    {i + 1}
                  </span>
                </div>

                <div className="flex gap-1">
                  <button
                    onClick={() => move(img.id, -1)}
                    disabled={i === 0 || busyId !== null}
                    aria-label={`Move graphic ${i + 1} earlier`}
                    className="flex-1 py-1.5 rounded-lg text-[12px] font-bold border border-[#EBEBF2] text-[#1A1A2E] disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ←
                  </button>
                  <button
                    onClick={() => move(img.id, 1)}
                    disabled={i === images.length - 1 || busyId !== null}
                    aria-label={`Move graphic ${i + 1} later`}
                    className="flex-1 py-1.5 rounded-lg text-[12px] font-bold border border-[#EBEBF2] text-[#1A1A2E] disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    →
                  </button>
                  <button
                    onClick={() => handleDelete(img.id)}
                    disabled={busyId !== null}
                    aria-label={`Delete graphic ${i + 1}`}
                    className="flex-1 py-1.5 rounded-lg text-[12px] font-bold border border-red-200 text-[#DA1212] disabled:opacity-30"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          onChange={handleUpload}
          className="hidden"
        />
        <button
          onClick={() => fileInput.current?.click()}
          disabled={uploading || images.length >= maxImages}
          className="w-full py-3 rounded-xl font-bold text-[13px] text-white disabled:opacity-40 active:opacity-80 transition-opacity"
          style={{ backgroundColor: BLUE }}
        >
          {uploading ? 'Uploading…'
            : images.length >= maxImages ? `Limit of ${maxImages} reached`
            : '+ Upload graphic'}
        </button>
        <p className="text-[11px] text-[#B0B0C8] font-medium">
          Squares work best — uploads are cropped to 1:1 and re-encoded at 1080px.
        </p>
      </section>

      {/* ── Caption ── */}
      <section className="bg-white rounded-2xl px-5 py-5 shadow-sm flex flex-col gap-3">
        <h3 className="text-[15px] font-extrabold text-[#1A1A2E]">Caption</h3>
        <p className="text-[12px] text-[#8E8EA8] font-medium leading-relaxed">
          Write the post copy merchants will use. Put{' '}
          <code className="text-[11px] font-bold text-[#1A1A2E] bg-[#F5F5F8] px-1.5 py-0.5 rounded">
            {token}
          </code>{' '}
          where each merchant’s own join link should appear — it is swapped for
          their real link when they copy the caption.
        </p>

        <textarea
          value={caption}
          onChange={e => setCaption(e.target.value.slice(0, MAX_CAPTION_LENGTH))}
          rows={10}
          placeholder={`🎉 We're officially a BinPerks participating merchant!\n\n👉 Join BinPerks here: ${token}`}
          className="w-full rounded-xl border border-[#EBEBF2] bg-[#F5F5F8] px-4 py-3 text-[13px] text-[#1A1A2E] leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#4A4B98]/30 placeholder:text-[#B0B0C8] resize-y"
        />

        <div className="flex items-center justify-between gap-3">
          <button
            onClick={insertToken}
            className="text-[12px] font-bold underline"
            style={{ color: BLUE }}
          >
            Insert link placeholder
          </button>
          <span className={`text-[11px] font-bold ${caption.length >= MAX_CAPTION_LENGTH - 100 ? 'text-[#DA1212]' : 'text-[#B0B0C8]'}`}>
            {caption.length}/{MAX_CAPTION_LENGTH}
          </span>
        </div>

        {/* A caption with no placeholder is legal — it just carries no link.
            Worth saying out loud, because it is almost always a mistake. */}
        {caption.trim() && !hasToken && (
          <p className="text-[12px] font-semibold text-[#8A6A00] bg-[#FFB21720] rounded-xl px-3.5 py-2.5 leading-relaxed">
            This caption has no {token} in it, so merchants will copy it without
            their join link.
          </p>
        )}

        <button
          onClick={handleSaveCaption}
          disabled={savingCaption}
          className="w-full py-3 rounded-xl font-bold text-[13px] text-white disabled:opacity-60 active:opacity-80 transition-all"
          style={{ backgroundColor: captionSaved ? '#2A7D34' : BLUE }}
        >
          {savingCaption ? 'Saving…' : captionSaved ? '✓ Saved — live for all merchants' : 'Save Caption'}
        </button>
      </section>
    </div>
  )
}
