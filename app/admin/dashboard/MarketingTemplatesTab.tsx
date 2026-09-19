'use client'

/**
 * Admin — the base artwork behind every merchant marketing material.
 *
 * LIVE FOR EVERY MERCHANT. Materials are built per download, so replacing a
 * template here changes what merchants get on their next click. There is no
 * draft and nothing to publish, and the copy on screen says so.
 *
 * THE RECTANGLES ARE THE FIDDLY PART. Each one says where that design's
 * [STORE NAME] or [QR CODE] placeholder sits, as a fraction of the artwork's
 * own width and height. The renderer paints over the placeholder and puts the
 * real thing in its place, so a replacement design with its boxes somewhere
 * else needs these moved — otherwise the new artwork gets stamped in the old
 * positions. A live outline over the preview is what makes that adjustable
 * without guessing.
 */

import { useEffect, useRef, useState } from 'react'

const BLUE = '#4A4B98'

interface Rect { x: number; y: number; w: number; h: number }

interface Template {
  slug: string
  label: string
  bucket: string
  hasArtwork: boolean
  previewUrl: string | null
  nameRect: Rect
  qrRect: Rect
  updatedAt: string | null
}

const FIELDS: { key: keyof Rect; label: string }[] = [
  { key: 'x', label: 'X' }, { key: 'y', label: 'Y' },
  { key: 'w', label: 'W' }, { key: 'h', label: 'H' },
]

function RectFields({
  title, rect, colour, onChange,
}: {
  title: string
  rect: Rect
  colour: string
  onChange: (r: Rect) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[11px] font-bold" style={{ color: colour }}>{title}</p>
      <div className="grid grid-cols-4 gap-1.5">
        {FIELDS.map(f => (
          <label key={f.key} className="flex flex-col gap-0.5">
            <span className="text-[9px] font-bold text-[#B0B0C8]">{f.label}</span>
            <input
              type="number" step="0.001" min="0" max="1"
              value={rect[f.key]}
              onChange={e => onChange({ ...rect, [f.key]: Number(e.target.value) })}
              className="w-full rounded-lg border border-[#EBEBF2] bg-[#F5F5F8] px-1.5 py-1 text-[11px] text-[#1A1A2E] focus:outline-none focus:ring-2 focus:ring-[#4A4B98]/30"
            />
          </label>
        ))}
      </div>
    </div>
  )
}

function TemplateCard({ t, onSaved }: { t: Template; onSaved: () => void }) {
  const [nameRect, setNameRect] = useState<Rect>(t.nameRect)
  const [qrRect, setQrRect]     = useState<Rect>(t.qrRect)
  const [busy, setBusy]         = useState(false)
  const [saved, setSaved]       = useState(false)
  const [err, setErr]           = useState('')
  const input = useRef<HTMLInputElement>(null)

  const dirty =
    JSON.stringify(nameRect) !== JSON.stringify(t.nameRect) ||
    JSON.stringify(qrRect) !== JSON.stringify(t.qrRect)

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true); setErr('')
    try {
      const form = new FormData()
      form.append('slug', t.slug)
      form.append('file', file)
      const res = await fetch('/api/admin/marketing-templates', { method: 'POST', body: form })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(
          d.error === 'file_too_large'   ? 'That file is too large.' :
          d.error === 'unreadable_image' ? 'That file could not be read as an image.' :
          'Upload failed. Try again.',
        )
        return
      }
      onSaved()
    } catch { setErr('Upload failed. Try again.') } finally { setBusy(false) }
  }

  async function saveRects() {
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/admin/marketing-templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: t.slug, nameRect, qrRect }),
      })
      if (!res.ok) { setErr('Could not save the positions.'); return }
      setSaved(true); setTimeout(() => setSaved(false), 2000)
      onSaved()
    } catch { setErr('Could not save the positions.') } finally { setBusy(false) }
  }

  const box = (r: Rect, colour: string) => ({
    left: `${r.x * 100}%`, top: `${r.y * 100}%`,
    width: `${r.w * 100}%`, height: `${r.h * 100}%`,
    outline: `2px solid ${colour}`,
    backgroundColor: `${colour}22`,
  })

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[14px] font-extrabold text-[#1A1A2E]">{t.label}</h3>
        {!t.hasArtwork && (
          <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-[#FFB21725] text-[#8A6A00]">
            No artwork
          </span>
        )}
      </div>

      <div className="relative w-full rounded-xl overflow-hidden bg-[#F5F5F8] border border-[#EBEBF2]">
        {t.previewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.previewUrl} alt={`${t.label} artwork`} className="w-full block" />
            {/* The rectangles, over the artwork, so a wrong number is visible
                rather than something to discover in a download. */}
            <div className="absolute pointer-events-none" style={box(nameRect, '#DA1212')} />
            <div className="absolute pointer-events-none" style={box(qrRect, BLUE)} />
          </>
        ) : (
          <div className="h-32 flex items-center justify-center">
            <p className="text-[12px] font-semibold text-[#B0B0C8]">Upload artwork to begin</p>
          </div>
        )}
      </div>

      <RectFields title="■ Store name box" rect={nameRect} colour="#DA1212" onChange={setNameRect} />
      <RectFields title="■ QR code box" rect={qrRect} colour={BLUE} onChange={setQrRect} />

      {err && <p className="text-[11px] font-semibold text-[#DA1212]">{err}</p>}

      <div className="flex gap-2">
        <input ref={input} type="file" accept="image/*" onChange={upload} className="hidden" />
        <button
          onClick={() => input.current?.click()}
          disabled={busy}
          className="flex-1 py-2 rounded-xl text-[12px] font-bold border-2 border-[#4A4B98] disabled:opacity-50"
          style={{ color: BLUE }}
        >
          {busy ? 'Working…' : t.hasArtwork ? 'Replace artwork' : 'Upload artwork'}
        </button>
        <button
          onClick={saveRects}
          disabled={busy || !dirty}
          className="flex-1 py-2 rounded-xl text-[12px] font-bold text-white disabled:opacity-40"
          style={{ backgroundColor: saved ? '#2A7D34' : BLUE }}
        >
          {saved ? '✓ Saved' : 'Save positions'}
        </button>
      </div>
    </div>
  )
}

export default function MarketingTemplatesTab() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/marketing-templates')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled) return
        if (!d) { setError('Couldn’t load the templates.'); return }
        setTemplates(d.templates ?? [])
      })
      .catch(() => { if (!cancelled) setError('Couldn’t load the templates.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [nonce])

  const posters = templates.filter(t => t.bucket === 'poster-templates')
  const others  = templates.filter(t => t.bucket !== 'poster-templates')

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">Marketing Templates</h2>
        <p className="text-[12px] text-[#8E8EA8] font-medium mt-1 leading-relaxed">
          The base artwork behind every merchant marketing material. Materials
          are built when a merchant downloads them, so a replacement here is live
          for everyone immediately.
        </p>
        <p className="text-[11px] text-[#B0B0C8] font-medium mt-1.5 leading-relaxed">
          The red box is where each design&apos;s <strong>[STORE NAME]</strong> sits and the
          blue box its <strong>[QR CODE]</strong>, as fractions of the artwork. Replacing a
          design with its boxes elsewhere means moving these too.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-[12px] font-semibold text-[#DA1212]">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-72 rounded-2xl bg-white animate-pulse" />)}
        </div>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h3 className="text-[13px] font-extrabold text-[#8E8EA8] uppercase tracking-wide">
              Store Posters
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {posters.map(t => (
                <TemplateCard key={t.slug + nonce} t={t} onSaved={() => setNonce(n => n + 1)} />
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-[13px] font-extrabold text-[#8E8EA8] uppercase tracking-wide">
              Other Materials
            </h3>
            <p className="text-[11px] text-[#8E8EA8] font-medium -mt-1.5">
              One unit of artwork each — a decal, a tent panel, a 4×6 print. The
              sheets are tiled from it, so upload one, not a full page.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {others.map(t => (
                <TemplateCard key={t.slug + nonce} t={t} onSaved={() => setNonce(n => n + 1)} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
