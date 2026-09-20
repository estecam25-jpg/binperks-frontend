'use client'

/**
 * Admin — the merchant marketing materials, end to end.
 *
 * LIVE FOR EVERY MERCHANT. Materials are listed per request and files built
 * per download, so a change here reaches every merchant on their next page
 * load. There is no draft and nothing to publish, and the copy on screen says
 * so.
 *
 * TWO HALVES OF A MATERIAL, and only one of them is editable here:
 *
 *   EDITABLE   title, description, category, order, active, the lifestyle
 *              photo, and the base artwork behind each design.
 *   IN CODE    the recipe — sheet layout, print size, fold lines, which join
 *              URL the QR encodes. That is the rendering logic. A new material
 *              picks an existing recipe; it cannot invent one.
 *
 * THE RECTANGLES MOVED OUT. Each design's [STORE NAME] and [QR CODE] boxes are
 * still adjustable, but they belong to the DESIGN rather than the material —
 * five poster designs have five sets — so they live on the Design Artwork
 * section at the bottom rather than cluttering every material card.
 *
 * SOCIAL MEDIA POST IS NOT EDITED HERE. The Social Media tab already owns that
 * content; a second place to change it would be a second place for it to be
 * wrong. The section is shown, empty, saying where it lives.
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

interface Artwork {
  slug: string
  label: string
  hasArtwork: boolean
  previewUrl: string | null
}

interface Material {
  id: string
  slug: string
  category: string
  title: string
  description: string
  render_recipe: string | null
  template_slugs: string[]
  lifestyle_image_path: string | null
  lifestyleUrl: string | null
  download_format: string
  display_order: number
  active: boolean
  artwork: Artwork[]
  allowedFormats: string[]
  recipeMissing: boolean
}

interface Recipe {
  slug: string
  label: string
  output: string
  templateCount: number
  qrTarget: string
}

interface Category { id: string; title: string; subtitle: string; editable: boolean }

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

/**
 * One printable DESIGN — its artwork and its two placeholder rectangles.
 *
 * Unchanged in substance from the tab this replaces. It is a design, not a
 * material: Store Posters is one material built from five of these.
 */
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

/** A small square thumbnail with a caption — used for both image kinds. */
function Thumb({
  url, label, empty,
}: {
  url: string | null
  label: string
  empty: string
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-[#F5F5F8] border border-[#EBEBF2]">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label} className="w-full h-full object-cover" />
        ) : (
          <div className="h-full flex items-center justify-center px-2">
            <p className="text-[9px] font-semibold text-[#B0B0C8] text-center leading-tight">{empty}</p>
          </div>
        )}
      </div>
      <p className="text-[9px] font-bold text-[#B0B0C8] truncate">{label}</p>
    </div>
  )
}

/**
 * One material — what a merchant sees on a card, and everything admin can
 * change about it.
 *
 * COLLAPSED BY DEFAULT. Six materials with every field open is a wall; the
 * summary row carries what is worth scanning (title, format, whether it is on,
 * whether it has its images) and the form opens on demand.
 */
function MaterialCard({
  m, position, count, onChanged, onMove,
}: {
  m: Material
  position: number
  count: number
  onChanged: () => void
  /** Asks the tab to move this material within its category. The card does
   *  not know its siblings, so it cannot compute the new order itself. */
  onMove: (delta: number) => Promise<void>
}) {
  const [open, setOpen]   = useState(false)
  const [title, setTitle] = useState(m.title)
  const [desc, setDesc]   = useState(m.description)
  const [format, setFormat] = useState(m.download_format)
  const [busy, setBusy]   = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr]     = useState('')
  const photoInput = useRef<HTMLInputElement>(null)

  const dirty = title !== m.title || desc !== m.description || format !== m.download_format

  async function patch(body: Record<string, unknown>, label: string) {
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/admin/marketing-materials', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: m.id, ...body }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(
          d.error === 'bad_format'
            ? `This material can only be a ${(d.allowed ?? []).join(' or ') || 'different format'}.`
            : d.error === 'title_required' ? 'A title is required.'
            : `Could not ${label}.`,
        )
        return false
      }
      setSaved(true); setTimeout(() => setSaved(false), 2000)
      onChanged()
      return true
    } catch { setErr(`Could not ${label}.`); return false } finally { setBusy(false) }
  }

  async function uploadPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true); setErr('')
    try {
      const form = new FormData()
      form.append('id', m.id)
      form.append('file', file)
      const res = await fetch('/api/admin/marketing-materials', { method: 'POST', body: form })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(
          d.error === 'file_too_large'   ? 'That file is too large.' :
          d.error === 'unreadable_image' ? 'That file could not be read as an image.' :
          'Upload failed. Try again.',
        )
        return
      }
      onChanged()
    } catch { setErr('Upload failed. Try again.') } finally { setBusy(false) }
  }

  async function remove() {
    if (!confirm(`Delete “${m.title}”? Merchants will stop seeing it immediately. The printable artwork is kept.`)) return
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/admin/marketing-materials?id=${encodeURIComponent(m.id)}`, { method: 'DELETE' })
      if (!res.ok) { setErr('Could not delete that material.'); return }
      onChanged()
    } catch { setErr('Could not delete that material.') } finally { setBusy(false) }
  }

  function move(delta: number) {
    setBusy(true)
    onMove(delta).finally(() => setBusy(false))
  }

  const missingArtwork = m.artwork.filter(a => !a.hasArtwork).length

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-3">
      {/* Summary row */}
      <div className="flex items-start gap-3">
        {/* Reorder. Disabled at the ends rather than hidden, so the pair of
            controls does not shift position from card to card. */}
        <div className="flex flex-col gap-1 pt-0.5">
          <button
            onClick={() => move(-1)}
            disabled={busy || position === 0}
            aria-label={`Move ${m.title} up`}
            className="w-6 h-6 rounded-md border border-[#EBEBF2] text-[10px] font-bold text-[#8E8EA8] disabled:opacity-30"
          >▲</button>
          <button
            onClick={() => move(1)}
            disabled={busy || position === count - 1}
            aria-label={`Move ${m.title} down`}
            className="w-6 h-6 rounded-md border border-[#EBEBF2] text-[10px] font-bold text-[#8E8EA8] disabled:opacity-30"
          >▼</button>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[14px] font-extrabold text-[#1A1A2E]">{m.title}</h3>
            <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-[#EBEBF2] text-[#8E8EA8]">
              {m.download_format}
            </span>
            {!m.active && (
              <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-[#DA121215] text-[#DA1212]">
                Hidden
              </span>
            )}
            {m.recipeMissing && (
              <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-[#FFB21725] text-[#8A6A00]">
                No recipe
              </span>
            )}
          </div>
          <p className="text-[11px] text-[#8E8EA8] font-medium mt-0.5 leading-snug line-clamp-2">
            {m.description || 'No description yet.'}
          </p>
          {missingArtwork > 0 && (
            <p className="text-[10px] font-bold text-[#8A6A00] mt-1">
              {missingArtwork} of {m.artwork.length} designs have no artwork — merchants see “Coming soon”.
            </p>
          )}
        </div>

        {/* Active toggle. Its own control, immediate, no save step — it is the
            one thing admin will reach for in a hurry. */}
        <button
          onClick={() => patch({ active: !m.active }, 'change that')}
          disabled={busy}
          role="switch"
          aria-checked={m.active}
          aria-label={`${m.active ? 'Hide' : 'Show'} ${m.title}`}
          className="flex-shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-50"
          style={{ backgroundColor: m.active ? '#2A7D34' : '#D1D1DC' }}
        >
          <span
            className="block w-5 h-5 rounded-full bg-white shadow transition-transform"
            style={{ transform: m.active ? 'translateX(22px)' : 'translateX(2px)' }}
          />
        </button>
      </div>

      {/* Images at a glance: the reveal photo, then one thumbnail per design. */}
      <div className="grid grid-cols-4 gap-2">
        <Thumb url={m.lifestyleUrl} label="Photo" empty="No photo" />
        {m.artwork.map(a => (
          <Thumb key={a.slug} url={a.previewUrl} label={a.label} empty="No artwork" />
        ))}
      </div>

      {err && <p className="text-[11px] font-semibold text-[#DA1212]">{err}</p>}

      <button
        onClick={() => setOpen(o => !o)}
        className="self-start text-[12px] font-bold"
        style={{ color: BLUE }}
      >
        {open ? 'Close' : 'Edit'}
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-[#EBEBF2] pt-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E8EA8]">Title</span>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full rounded-xl border-2 border-[#EBEBF2] px-3 py-2 text-[13px] font-semibold text-[#1A1A2E] focus:outline-none focus:border-[#4A4B98]"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E8EA8]">
              Description — merchants read this under the photo
            </span>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              rows={3}
              className="w-full rounded-xl border-2 border-[#EBEBF2] px-3 py-2 text-[13px] font-medium text-[#1A1A2E] resize-none focus:outline-none focus:border-[#4A4B98]"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E8EA8]">
              Download format
            </span>
            <select
              value={format}
              onChange={e => setFormat(e.target.value)}
              className="w-full rounded-xl border-2 border-[#EBEBF2] px-3 py-2 text-[13px] font-semibold text-[#1A1A2E] focus:outline-none focus:border-[#4A4B98]"
            >
              {['pdf', 'jpg', 'both'].map(f => (
                <option key={f} value={f} disabled={!m.allowedFormats.includes(f)}>
                  {f.toUpperCase()}{m.allowedFormats.includes(f) ? '' : ' — not possible for this layout'}
                </option>
              ))}
            </select>
            {/* Said plainly rather than left for a failed save to explain: a
                tiled sheet is drawn by pdf-lib and a 4x6 print by sharp, and
                neither can emit the other's file type. */}
            <span className="text-[10px] text-[#B0B0C8] font-medium leading-snug">
              Set by the layout this material prints with — a multi-up sheet is always a PDF,
              a 4×6 print is always a JPG.
            </span>
          </label>

          <div className="flex gap-2">
            <input ref={photoInput} type="file" accept="image/*" onChange={uploadPhoto} className="hidden" />
            <button
              onClick={() => photoInput.current?.click()}
              disabled={busy}
              className="flex-1 py-2 rounded-xl text-[12px] font-bold border-2 border-[#4A4B98] disabled:opacity-50"
              style={{ color: BLUE }}
            >
              {m.lifestyleUrl ? 'Replace photo' : 'Upload photo'}
            </button>
            <button
              onClick={() => patch({ title, description: desc, downloadFormat: format }, 'save that')}
              disabled={busy || !dirty}
              className="flex-1 py-2 rounded-xl text-[12px] font-bold text-white disabled:opacity-40"
              style={{ backgroundColor: saved ? '#2A7D34' : BLUE }}
            >
              {saved ? '✓ Saved' : 'Save changes'}
            </button>
          </div>

          <p className="text-[10px] text-[#B0B0C8] font-medium leading-snug">
            Printable artwork for {m.artwork.length === 1 ? 'this design' : `these ${m.artwork.length} designs`} is
            uploaded in <strong>Design Artwork</strong> below.
          </p>

          <button
            onClick={remove}
            disabled={busy}
            className="self-start text-[11px] font-bold text-[#DA1212] disabled:opacity-50"
          >
            Delete material
          </button>
        </div>
      )}
    </div>
  )
}

export default function MarketingTemplatesTab() {
  const [materials, setMaterials] = useState<Material[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const [addingTo, setAddingTo] = useState<string | null>(null)

  const reload = () => setNonce(n => n + 1)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/admin/marketing-materials').then(r => r.ok ? r.json() : null),
      fetch('/api/admin/marketing-templates').then(r => r.ok ? r.json() : null),
    ])
      .then(([mats, temps]) => {
        if (cancelled) return
        if (!mats) { setError('Couldn’t load the materials.'); return }
        setMaterials(mats.materials ?? [])
        setCategories(mats.categories ?? [])
        setRecipes(mats.recipes ?? [])
        setTemplates(temps?.templates ?? [])
      })
      .catch(() => { if (!cancelled) setError('Couldn’t load the materials.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [nonce])

  // Sends the whole category's new order, so two rows can never claim the same
  // position the way a pair of single-row swaps can.
  async function reorder(m: Material, delta: number) {
    const siblings = materials
      .filter(x => x.category === m.category)
      .sort((a, b) => a.display_order - b.display_order)
    const from = siblings.findIndex(x => x.id === m.id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= siblings.length) return

    const next = [...siblings]
    ;[next[from], next[to]] = [next[to], next[from]]

    await fetch('/api/admin/marketing-materials', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: next.map(x => x.id) }),
    }).catch(() => {})
    reload()
  }

  async function addMaterial(category: string, recipeSlug: string, title: string) {
    const res = await fetch('/api/admin/marketing-materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, renderRecipe: recipeSlug, title, description: '' }),
    }).catch(() => null)
    if (res?.ok) { setAddingTo(null); reload() }
    else setError('Could not add that material.')
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">Marketing Materials</h2>
        <p className="text-[12px] text-[#8E8EA8] font-medium mt-1 leading-relaxed">
          Everything merchants see in their Marketing tab. Materials are listed
          per request and built per download, so a change here is live for every
          merchant immediately — there is nothing to publish.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-[12px] font-semibold text-[#DA1212]">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-60 rounded-2xl bg-white animate-pulse" />)}
        </div>
      ) : (
        <>
          {categories.map(category => {
            const items = materials
              .filter(m => m.category === category.id)
              .sort((a, b) => a.display_order - b.display_order)

            return (
              <section key={category.id} className="flex flex-col gap-3">
                <div>
                  <h3 className="text-[13px] font-extrabold text-[#8E8EA8] uppercase tracking-wide">
                    {category.title}
                  </h3>
                  <p className="text-[11px] text-[#8E8EA8] font-medium mt-0.5">{category.subtitle}</p>
                </div>

                {!category.editable ? (
                  <div className="bg-white rounded-2xl px-4 py-5 shadow-sm">
                    <p className="text-[12px] font-semibold text-[#8E8EA8]">
                      Managed in the Social Media tab.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {items.map((m, i) => (
                        <MaterialCard
                          key={m.id + nonce}
                          m={m}
                          position={i}
                          count={items.length}
                          onChanged={reload}
                          onMove={delta => reorder(m, delta)}
                        />
                      ))}
                    </div>

                    {addingTo === category.id ? (
                      <AddMaterialForm
                        recipes={recipes}
                        onCancel={() => setAddingTo(null)}
                        onAdd={(recipeSlug, title) => addMaterial(category.id, recipeSlug, title)}
                      />
                    ) : (
                      <button
                        onClick={() => setAddingTo(category.id)}
                        className="self-start px-4 py-2 rounded-xl text-[12px] font-bold border-2 border-dashed border-[#4A4B98]"
                        style={{ color: BLUE }}
                      >
                        + Add material to {category.title}
                      </button>
                    )}
                  </>
                )}
              </section>
            )
          })}

          {/* The printable designs, last. Every material above draws from
              these, and a design can feed more than one material. */}
          <section className="flex flex-col gap-3">
            <h3 className="text-[13px] font-extrabold text-[#8E8EA8] uppercase tracking-wide">
              Design Artwork
            </h3>
            <p className="text-[11px] text-[#8E8EA8] font-medium -mt-1.5 leading-relaxed">
              One unit of artwork each — a decal, a tent panel, a 4×6 print. The
              sheets are tiled from it, so upload one, not a full page. The red
              box is where a design&apos;s <strong>[STORE NAME]</strong> sits and
              the blue box its <strong>[QR CODE]</strong>, as fractions of the
              artwork; replacing a design with its boxes elsewhere means moving
              these too.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {templates.map(t => (
                <TemplateCard key={t.slug + nonce} t={t} onSaved={reload} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

/**
 * Adding a material.
 *
 * THE LAYOUT IS THE FIRST QUESTION, not an afterthought, because it is the one
 * thing that cannot be changed later by typing: it decides the sheet, the
 * print size and the file type. Admin is really choosing "another one of
 * these, with its own artwork and words".
 */
function AddMaterialForm({
  recipes, onAdd, onCancel,
}: {
  recipes: Recipe[]
  onAdd: (recipeSlug: string, title: string) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [recipe, setRecipe] = useState(recipes[0]?.slug ?? '')

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-3">
      <p className="text-[13px] font-extrabold text-[#1A1A2E]">New material</p>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E8EA8]">Title</span>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Counter Sign"
          className="w-full rounded-xl border-2 border-[#EBEBF2] px-3 py-2 text-[13px] font-semibold text-[#1A1A2E] focus:outline-none focus:border-[#4A4B98]"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E8EA8]">
          Print layout
        </span>
        <select
          value={recipe}
          onChange={e => setRecipe(e.target.value)}
          className="w-full rounded-xl border-2 border-[#EBEBF2] px-3 py-2 text-[13px] font-semibold text-[#1A1A2E] focus:outline-none focus:border-[#4A4B98]"
        >
          {recipes.map(r => (
            <option key={r.slug} value={r.slug}>
              {r.label} — {r.output.toUpperCase()}, {r.templateCount} design{r.templateCount === 1 ? '' : 's'}
            </option>
          ))}
        </select>
        <span className="text-[10px] text-[#B0B0C8] font-medium leading-snug">
          Sheet size, how many per page and which sign-up link the QR uses. These are
          built into BinPerks — a new layout needs a developer. The new material starts
          on the chosen layout&apos;s existing artwork; upload its own in Design Artwork.
        </span>
      </label>

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2 rounded-xl text-[12px] font-bold border-2 border-[#EBEBF2] text-[#8E8EA8]"
        >
          Cancel
        </button>
        <button
          onClick={() => onAdd(recipe, title.trim())}
          disabled={!title.trim() || !recipe}
          className="flex-1 py-2 rounded-xl text-[12px] font-bold text-white disabled:opacity-40"
          style={{ backgroundColor: BLUE }}
        >
          Add material
        </button>
      </div>
    </div>
  )
}
