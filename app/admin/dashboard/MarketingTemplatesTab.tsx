'use client'

/**
 * Admin — the merchant marketing materials, end to end.
 *
 * LIVE FOR EVERY MERCHANT. Materials are listed per request and files built
 * per download, so a change here reaches every merchant on their next page
 * load. There is no draft and nothing to publish, and the copy on screen says
 * so.
 *
 * LAID OUT AS THE MERCHANT SEES IT. One horizontal strip per category, cards
 * in the order they appear on the merchant's Marketing tab. That order is
 * display_order and is not edited here — the reorder controls were removed.
 * The PATCH route still accepts an `order` array, so it can come back without
 * a server change.
 *
 * DESIGNS SIT IN THE STRIP BESIDE THEIR MATERIAL, not in a section of their
 * own. A design is the printable artwork a material is built from, and the
 * five poster designs mean nothing on their own — following the material they
 * belong to is what makes them legible. They are a different KIND of card, in
 * grey, so the strip does not read as eleven materials.
 *
 * TWO HALVES OF A MATERIAL, and only one of them is editable here:
 *
 *   EDITABLE   title, description, category, order, active, the lifestyle
 *              photo, and the base artwork behind each design.
 *   IN CODE    the recipe — sheet layout, print size, fold lines, which join
 *              URL the QR encodes. That is the rendering logic. A new material
 *              picks an existing recipe; it cannot invent one.
 *
 * THE EDITORS OPEN BELOW THE STRIP, full width. A 260px card cannot hold a
 * description box, a format selector and four coordinate fields without
 * becoming unusable, and a design's placeholder rectangles have to be shown
 * over the artwork at a size where a wrong number is visible.
 *
 * SOCIAL MEDIA POST IS NOT EDITED HERE. The Social Media tab already owns that
 * content; a second place to change it would be a second place for it to be
 * wrong. The section is shown, empty, saying where it lives.
 */

import { Fragment, useEffect, useRef, useState } from 'react'

const BLUE = '#4A4B98'

/** Cards in a strip must be a fixed width, or flex sizes them to their content
 *  and the row stops looking like a strip. Matches the merchant tab's cards. */
const CARD_W = 'w-[260px] flex-shrink-0'

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

/** Which editor panel is open, if any. One at a time — two open forms below a
 *  strip would leave the merchant's order impossible to see. */
type Editing =
  | { kind: 'material'; id: string }
  // The material is carried too: artwork can be shared between materials, so
  // the slug alone would not say which strip the editor belongs under.
  | { kind: 'design'; slug: string; materialId: string }
  | { kind: 'add'; category: string }
  | null

// ── Small shared pieces ──────────────────────────────────────────────────────

function Badge({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <span
      className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full whitespace-nowrap"
      style={{ backgroundColor: bg, color: fg }}
    >
      {text}
    </span>
  )
}

/** A square thumbnail with a caption. Used for both image kinds so a photo and
 *  a design read as the same sort of thing at a glance. */
function Thumb({
  url, label, empty, size = 'w-full',
}: {
  url: string | null
  label: string
  empty: string
  size?: string
}) {
  return (
    <div className={`flex flex-col gap-1 min-w-0 ${size}`}>
      <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-[#F5F5F8] border border-[#EBEBF2]">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label} className="w-full h-full object-cover" />
        ) : (
          <div className="h-full flex items-center justify-center px-1.5">
            <p className="text-[9px] font-semibold text-[#B0B0C8] text-center leading-tight">{empty}</p>
          </div>
        )}
      </div>
      <p className="text-[9px] font-bold text-[#B0B0C8] truncate">{label}</p>
    </div>
  )
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

// ── Cards in the strip ───────────────────────────────────────────────────────

/**
 * One material, as it sits in the strip.
 *
 * Everything worth scanning without opening anything: what it is, what a
 * merchant downloads, whether it is switched on, and whether its images are
 * there. Editing happens in the panel below.
 */
function MaterialCard({
  m, busy, onToggle, onEdit, editing,
}: {
  m: Material
  busy: boolean
  onToggle: () => void
  onEdit: () => void
  editing: boolean
}) {
  const missingArtwork = m.artwork.filter(a => !a.hasArtwork).length

  return (
    <article
      className={`${CARD_W} bg-white rounded-2xl px-4 py-4 shadow-sm flex flex-col gap-2.5`}
      style={editing ? { outline: `2px solid ${BLUE}` } : undefined}
    >
      <h3 className="text-[14px] font-extrabold text-[#1A1A2E] leading-tight">{m.title}</h3>

      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge text={m.download_format} bg="#EBEBF2" fg="#8E8EA8" />
        {!m.active && <Badge text="Hidden" bg="#DA121215" fg="#DA1212" />}
        {m.recipeMissing && <Badge text="No recipe" bg="#FFB21725" fg="#8A6A00" />}
      </div>

      {/* The photo large, the designs small beside it — the photo is this
          card's own, the designs are shown in full further along the strip. */}
      <div className="flex gap-2">
        <div className="w-[96px] flex-shrink-0">
          <Thumb url={m.lifestyleUrl} label="Photo" empty="No photo" />
        </div>
        <div className="flex-1 min-w-0 grid grid-cols-3 gap-1.5 content-start">
          {m.artwork.slice(0, 6).map(a => (
            <Thumb key={a.slug} url={a.previewUrl} label="" empty="—" />
          ))}
        </div>
      </div>

      <p className="text-[11px] text-[#8E8EA8] font-medium leading-snug line-clamp-2">
        {m.description || 'No description yet.'}
      </p>

      {missingArtwork > 0 && (
        <p className="text-[10px] font-bold text-[#8A6A00] leading-snug">
          {missingArtwork} of {m.artwork.length} designs have no artwork — merchants see “Coming soon”.
        </p>
      )}

      <div className="flex items-center gap-2 mt-auto pt-1">
        {/* Immediate, no save step — it is the one thing admin reaches for in
            a hurry. */}
        <button
          onClick={onToggle}
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
        <button
          onClick={onEdit}
          className="ml-auto px-3 py-1.5 rounded-lg text-[12px] font-bold bg-[#F5F5F8]"
          style={{ color: BLUE }}
        >
          {editing ? 'Close' : 'Edit'}
        </button>
      </div>
    </article>
  )
}

/**
 * One printable DESIGN, in the strip beside the material it belongs to.
 *
 * GREY, AND LABELLED AS ARTWORK, because it is not a material: a merchant
 * never sees it as a card and cannot download it on its own. Without the
 * different treatment a five-poster material would look like six materials.
 */
function DesignCard({
  t, ownerTitle, onEdit, editing,
}: {
  t: Artwork
  ownerTitle: string
  onEdit: () => void
  editing: boolean
}) {
  return (
    <article
      className={`${CARD_W} bg-[#F5F5F8] border border-[#EBEBF2] rounded-2xl px-4 py-4 flex flex-col gap-2.5`}
      style={editing ? { outline: `2px solid ${BLUE}` } : undefined}
    >
      <div className="flex items-center gap-1.5">
        <Badge text="Artwork" bg="#E4E4EE" fg="#6E6E8A" />
        {!t.hasArtwork && <Badge text="Missing" bg="#FFB21725" fg="#8A6A00" />}
      </div>

      <h3 className="text-[13px] font-extrabold text-[#6E6E8A] leading-tight">{t.label}</h3>
      <p className="text-[10px] font-medium text-[#B0B0C8] -mt-1.5">Prints in {ownerTitle}</p>

      <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-white border border-[#EBEBF2]">
        {t.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.previewUrl} alt={`${t.label} artwork`} className="w-full h-full object-contain" />
        ) : (
          <div className="h-full flex items-center justify-center px-3">
            <p className="text-[11px] font-semibold text-[#B0B0C8] text-center">Upload artwork to begin</p>
          </div>
        )}
      </div>

      <button
        onClick={onEdit}
        className="mt-auto px-3 py-1.5 rounded-lg text-[12px] font-bold bg-white border border-[#EBEBF2]"
        style={{ color: BLUE }}
      >
        {editing ? 'Close' : 'Artwork & position'}
      </button>
    </article>
  )
}

// ── Editors, below the strip ─────────────────────────────────────────────────

/** Everything admin can change about a material. Unchanged in substance from
 *  the form this layout replaces — only where it opens moved. */
function MaterialEditor({
  m, onChanged, onClose,
}: {
  m: Material
  onChanged: () => void
  onClose: () => void
}) {
  const [title, setTitle]   = useState(m.title)
  const [desc, setDesc]     = useState(m.description)
  const [format, setFormat] = useState(m.download_format)
  const [busy, setBusy]     = useState(false)
  const [saved, setSaved]   = useState(false)
  const [err, setErr]       = useState('')
  const photoInput = useRef<HTMLInputElement>(null)

  const dirty = title !== m.title || desc !== m.description || format !== m.download_format

  async function save() {
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/admin/marketing-materials', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: m.id, title, description: desc, downloadFormat: format }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(
          d.error === 'bad_format'
            ? `This material can only be a ${(d.allowed ?? []).join(' or ') || 'different format'}.`
            : d.error === 'title_required' ? 'A title is required.'
            : 'Could not save that.',
        )
        return
      }
      setSaved(true); setTimeout(() => setSaved(false), 2000)
      onChanged()
    } catch { setErr('Could not save that.') } finally { setBusy(false) }
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
      onClose()
      onChanged()
    } catch { setErr('Could not delete that material.') } finally { setBusy(false) }
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-extrabold text-[#1A1A2E]">Editing {m.title}</p>
        <button onClick={onClose} className="text-[12px] font-bold text-[#8E8EA8]">Close</button>
      </div>

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
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E8EA8]">Download format</span>
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
        {/* Said plainly rather than left for a failed save to explain: a tiled
            sheet is drawn by pdf-lib and a 4x6 print by sharp, and neither can
            emit the other's file type. */}
        <span className="text-[10px] text-[#B0B0C8] font-medium leading-snug">
          Set by the layout this material prints with — a multi-up sheet is always a PDF,
          a 4×6 print is always a JPG.
        </span>
      </label>

      {err && <p className="text-[11px] font-semibold text-[#DA1212]">{err}</p>}

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
          onClick={save}
          disabled={busy || !dirty}
          className="flex-1 py-2 rounded-xl text-[12px] font-bold text-white disabled:opacity-40"
          style={{ backgroundColor: saved ? '#2A7D34' : BLUE }}
        >
          {saved ? '✓ Saved' : 'Save changes'}
        </button>
      </div>

      <p className="text-[10px] text-[#B0B0C8] font-medium leading-snug">
        Printable artwork is on the grey {m.artwork.length === 1 ? 'card' : 'cards'} beside this one in the strip.
      </p>

      <button
        onClick={remove}
        disabled={busy}
        className="self-start text-[11px] font-bold text-[#DA1212] disabled:opacity-50"
      >
        Delete material
      </button>
    </div>
  )
}

/** One design's artwork and its two placeholder rectangles. */
function DesignEditor({
  t, onSaved, onClose,
}: {
  t: Template
  onSaved: () => void
  onClose: () => void
}) {
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
        <p className="text-[13px] font-extrabold text-[#1A1A2E]">Artwork — {t.label}</p>
        <button onClick={onClose} className="text-[12px] font-bold text-[#8E8EA8]">Close</button>
      </div>

      <p className="text-[11px] text-[#8E8EA8] font-medium leading-relaxed">
        One unit of artwork — a decal, a tent panel, a 4×6 print. The sheets are
        tiled from it, so upload one, not a full page. The red box is where
        <strong> [STORE NAME]</strong> sits and the blue box its
        <strong> [QR CODE]</strong>, as fractions of the artwork; replacing a
        design with its boxes elsewhere means moving these too.
      </p>

      <div className="relative w-full max-w-md rounded-xl overflow-hidden bg-[#F5F5F8] border border-[#EBEBF2]">
        {t.previewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.previewUrl} alt={`${t.label} artwork`} className="w-full block" />
            {/* Over the artwork, so a wrong number is visible rather than
                something to discover in a download. */}
            <div className="absolute pointer-events-none" style={box(nameRect, '#DA1212')} />
            <div className="absolute pointer-events-none" style={box(qrRect, BLUE)} />
          </>
        ) : (
          <div className="h-32 flex items-center justify-center">
            <p className="text-[12px] font-semibold text-[#B0B0C8]">Upload artwork to begin</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <RectFields title="■ Store name box" rect={nameRect} colour="#DA1212" onChange={setNameRect} />
        <RectFields title="■ QR code box" rect={qrRect} colour={BLUE} onChange={setQrRect} />
      </div>

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
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E8EA8]">Print layout</span>
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
          on the chosen layout&apos;s existing artwork; upload its own from the grey card.
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

// ── The tab ──────────────────────────────────────────────────────────────────

export default function MarketingTemplatesTab() {
  const [materials, setMaterials] = useState<Material[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const [editing, setEditing] = useState<Editing>(null)
  const [busy, setBusy] = useState(false)

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

  async function toggleActive(m: Material) {
    setBusy(true)
    await fetch('/api/admin/marketing-materials', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: m.id, active: !m.active }),
    }).catch(() => {})
    setBusy(false)
    reload()
  }

  async function addMaterial(category: string, recipeSlug: string, title: string) {
    const res = await fetch('/api/admin/marketing-materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, renderRecipe: recipeSlug, title, description: '' }),
    }).catch(() => null)
    if (res?.ok) { setEditing(null); reload() }
    else setError('Could not add that material.')
  }

  const openMaterial = editing?.kind === 'material'
    ? materials.find(m => m.id === editing.id) ?? null
    : null
  const openDesign = editing?.kind === 'design'
    ? templates.find(t => t.slug === editing.slug) ?? null
    : null
  const openDesignOwner = editing?.kind === 'design'
    ? materials.find(m => m.id === editing.materialId) ?? null
    : null

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">Marketing Materials</h2>
        <p className="text-[12px] text-[#8E8EA8] font-medium mt-1 leading-relaxed">
          Everything merchants see in their Marketing tab, laid out the way they
          see it. Materials are listed per request and built per download, so a
          change here is live for every merchant immediately — there is nothing
          to publish.
        </p>
        <p className="text-[11px] text-[#B0B0C8] font-medium mt-1.5 leading-relaxed">
          White cards are materials a merchant downloads. Grey cards are the
          printable artwork behind them — a material can print from several, and
          Store Posters prints from five.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-[12px] font-semibold text-[#DA1212]">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex gap-3">
          {[0, 1, 2].map(i => <div key={i} className={`${CARD_W} h-72 rounded-2xl bg-white animate-pulse`} />)}
        </div>
      ) : (
        categories.map(category => {
          const items = materials
            .filter(m => m.category === category.id)
            .sort((a, b) => a.display_order - b.display_order)

          const editingHere =
            (openMaterial && openMaterial.category === category.id) ||
            (openDesign && openDesignOwner?.category === category.id) ||
            (editing?.kind === 'add' && editing.category === category.id)

          return (
            <section key={category.id} className="flex flex-col gap-2.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[13px] font-extrabold text-[#8E8EA8] uppercase tracking-wide">
                    {category.title}
                  </h3>
                  <p className="text-[11px] text-[#8E8EA8] font-medium mt-0.5">{category.subtitle}</p>
                </div>
                {category.editable && editing?.kind !== 'add' && (
                  <button
                    onClick={() => setEditing({ kind: 'add', category: category.id })}
                    className="px-4 py-2 rounded-xl font-bold text-[13px] text-white flex-shrink-0"
                    style={{ backgroundColor: BLUE }}
                  >
                    + Add New
                  </button>
                )}
              </div>

              {!category.editable ? (
                <div className="bg-white rounded-2xl px-4 py-5 shadow-sm">
                  <p className="text-[12px] font-semibold text-[#8E8EA8]">
                    Managed in the Social Media tab.
                  </p>
                </div>
              ) : items.length === 0 ? (
                <p className="text-[13px] text-[#8E8EA8] font-medium py-6 text-center">
                  Nothing here yet. Add the first one.
                </p>
              ) : (
                /* Scrolls sideways inside its own box; the tab never scrolls
                   sideways. Each material is followed by the designs it prints
                   from, so a card and its artwork are always together. */
                <div className="overflow-x-auto -mx-4 px-4 pb-1">
                  <div className="flex gap-3 w-max items-stretch">
                    {items.map(m => (
                      <Fragment key={m.id}>
                        <MaterialCard
                          m={m}
                          busy={busy}
                          onToggle={() => toggleActive(m)}
                          onEdit={() => setEditing(
                            editing?.kind === 'material' && editing.id === m.id
                              ? null : { kind: 'material', id: m.id },
                          )}
                          editing={editing?.kind === 'material' && editing.id === m.id}
                        />
                        {m.artwork.map(a => (
                          <DesignCard
                            key={`${m.id}-${a.slug}`}
                            t={a}
                            ownerTitle={m.title}
                            onEdit={() => setEditing(
                              editing?.kind === 'design' &&
                              editing.slug === a.slug &&
                              editing.materialId === m.id
                                ? null : { kind: 'design', slug: a.slug, materialId: m.id },
                            )}
                            editing={
                              editing?.kind === 'design' &&
                              editing.slug === a.slug &&
                              editing.materialId === m.id
                            }
                          />
                        ))}
                      </Fragment>
                    ))}
                  </div>
                </div>
              )}

              {/* The open editor, under the strip it belongs to — full width,
                  because none of these forms fit in a 260px card. */}
              {editingHere && editing?.kind === 'add' && (
                <AddMaterialForm
                  recipes={recipes}
                  onCancel={() => setEditing(null)}
                  onAdd={(recipeSlug, title) => addMaterial(category.id, recipeSlug, title)}
                />
              )}
              {editingHere && openMaterial && (
                <MaterialEditor
                  key={openMaterial.id}
                  m={openMaterial}
                  onChanged={reload}
                  onClose={() => setEditing(null)}
                />
              )}
              {editingHere && openDesign && (
                <DesignEditor
                  key={openDesign.slug}
                  t={openDesign}
                  onSaved={reload}
                  onClose={() => setEditing(null)}
                />
              )}
            </section>
          )
        })
      )}
    </div>
  )
}
