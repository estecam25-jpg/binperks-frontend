'use client'

/**
 * Generic admin CRUD screen for one content type.
 *
 * Driven entirely by the registry in lib/admin-content, so all five tabs —
 * Suggested Perks, Promos, Shop From Home, Sponsored Perks, Deals Near You —
 * are this one component with a different ContentType. Five copies of a list,
 * a form and three fetch calls would have drifted the first time any of them
 * was touched.
 *
 * Module scope, and the form is a separate module-scope component: a component
 * declared inside another gets a new identity every render, so React remounts
 * the subtree and every input loses focus after one keystroke. That bug was
 * fixed in the merchant Perks tab (8b422a3) and is not being reintroduced.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ContentType, ContentField } from '@/lib/admin-content'

const BLUE = '#4A4B98'

/** A row as returned by the API — shape varies by type, so it stays loose. */
type Item = Record<string, unknown> & { id: string }

const inputClass =
  'w-full rounded-xl border border-[#EBEBF2] bg-[#F5F5F8] px-3 py-2 text-[13px] text-[#1A1A2E] ' +
  'focus:outline-none focus:ring-2 focus:ring-[#4A4B98]/30 placeholder:text-[#B0B0C8]'

function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v)
}

// ── Form ────────────────────────────────────────────────────────────────────

/** Live "123 / 300" under a capped field, so the limit is visible before it
 *  bites rather than as a keystroke that silently does nothing. */
function CharCount({ length, max }: { length: number; max: number }) {
  return (
    <span
      className="text-[10px] font-bold self-end"
      style={{ color: length >= max ? '#DA1212' : '#B0B0C8' }}
    >
      {length} / {max}
    </span>
  )
}

/**
 * Optional 1:1 artwork for a card.
 *
 * UPLOADS IMMEDIATELY, before the row is saved. The file goes to storage on
 * pick and the form field holds the returned PATH; the preview uses the signed
 * URL that came back with it. Deferring the upload to Save would mean holding
 * the bytes in component state and a second failure mode on a button that
 * already has one.
 *
 * `value` is the path currently in the draft and `initialUrl` is the signed URL
 * for the image the row already had, so editing a card shows its picture
 * without re-fetching. Removing clears the path; the old object is deleted
 * server-side when the row is saved, not here — cancelling an edit must not
 * destroy the live image.
 */
function ImageField({
  slug, field, value, initialUrl, onChange,
}: {
  slug: string
  field: ContentField
  value: string
  initialUrl?: string | null
  onChange: (v: string) => void
}) {
  const [preview, setPreview] = useState<string | null>(initialUrl ?? null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const input = useRef<HTMLInputElement>(null)

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Cleared at once so picking the same file twice still fires a change.
    e.target.value = ''
    if (!file) return

    setBusy(true)
    setErr('')
    try {
      const form = new FormData()
      form.append('file', file)
      // The path being replaced, so the server can bin the old object once the
      // new one is safely up.
      if (value) form.append('replaces', value)

      const res = await fetch(`/api/admin/content/${slug}/image`, { method: 'POST', body: form })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(
          d.error === 'file_too_large'   ? 'That file is too large.' :
          d.error === 'unreadable_image' ? 'That file could not be read as an image.' :
          'Upload failed. Try again.',
        )
        return
      }
      onChange(d.path ?? '')
      setPreview(d.url ?? null)
    } catch {
      setErr('Upload failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-xl overflow-hidden bg-[#F5F5F8] border border-[#EBEBF2] flex items-center justify-center flex-shrink-0">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[10px] font-bold text-[#B0B0C8]">None</span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <input ref={input} type="file" accept="image/*" onChange={pick} className="hidden" />
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg text-[12px] font-bold text-white disabled:opacity-50"
            style={{ backgroundColor: BLUE }}
          >
            {busy ? 'Uploading…' : preview ? 'Replace' : 'Upload image'}
          </button>
          {preview && !busy && (
            <button
              type="button"
              onClick={() => { onChange(''); setPreview(null) }}
              className="text-[11px] font-bold text-[#8E8EA8] self-start"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <p className="text-[10px] text-[#B0B0C8] font-medium">
        Optional. Squares work best — uploads are cropped to 1:1. Members see it
        covering the description until they hover or hold.
      </p>
      {err && <p className="text-[11px] font-semibold" style={{ color: '#DA1212' }}>{err}</p>}
      <span className="sr-only">{field.label}</span>
    </div>
  )
}

function FieldInput({
  field, value, onChange,
}: {
  field: ContentField
  value: string
  onChange: (v: string) => void
}) {
  if (field.kind === 'textarea') {
    return (
      <div className="flex flex-col gap-1">
        <textarea
          rows={3}
          value={value}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          onChange={e => onChange(e.target.value)}
          className={inputClass}
          aria-label={field.label}
        />
        {field.maxLength !== undefined && <CharCount length={value.length} max={field.maxLength} />}
      </div>
    )
  }

  if (field.kind === 'color') {
    return (
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#4A4B98'}
          onChange={e => onChange(e.target.value)}
          className="w-10 h-9 rounded-lg border border-[#EBEBF2] cursor-pointer p-0.5 bg-white"
          aria-label={field.label}
        />
        <input
          type="text"
          value={value}
          placeholder="#4A4B98"
          onChange={e => onChange(e.target.value)}
          className={`${inputClass} font-mono`}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        type={field.kind === 'date' ? 'date' : field.kind === 'number' ? 'number' : 'text'}
        inputMode={field.kind === 'number' ? 'numeric' : undefined}
        value={value}
        maxLength={field.maxLength}
        placeholder={field.placeholder}
        onChange={e => onChange(e.target.value)}
        className={inputClass}
        aria-label={field.label}
      />
      {field.maxLength !== undefined && <CharCount length={value.length} max={field.maxLength} />}
    </div>
  )
}

function ItemForm({
  type, draft, setDraft, onSave, onCancel, saving, error, imageUrl,
}: {
  type: ContentType
  draft: Record<string, string>
  setDraft: (d: Record<string, string>) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  error: string
  /** Signed URL of the image the row being edited already has, if any. */
  imageUrl?: string | null
}) {
  const set = (k: string, v: string) => setDraft({ ...draft, [k]: v })

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-3 border-2" style={{ borderColor: BLUE }}>
      {type.fields.map(f => (
        <div key={f.name} className="flex flex-col gap-1">
          <label className="text-[12px] font-bold text-[#1A1A2E]">
            {f.label}
            {f.required && <span style={{ color: '#DA1212' }}> *</span>}
          </label>
          {f.kind === 'image' ? (
            <ImageField
              slug={type.slug}
              field={f}
              value={draft[f.name] ?? ''}
              initialUrl={imageUrl}
              onChange={v => set(f.name, v)}
            />
          ) : (
            <FieldInput field={f} value={draft[f.name] ?? ''} onChange={v => set(f.name, v)} />
          )}
        </div>
      ))}

      <div className="flex items-center gap-4 flex-wrap pt-1">
        <div className="flex items-center gap-1.5">
          <label className="text-[12px] font-bold text-[#1A1A2E]">Order</label>
          <input
            type="number"
            value={draft.display_order ?? '0'}
            onChange={e => set('display_order', e.target.value)}
            className={`${inputClass} w-20`}
            aria-label="Display order"
          />
        </div>

        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={draft.active !== 'false'}
            onChange={e => set('active', e.target.checked ? 'true' : 'false')}
            className="w-4 h-4 rounded accent-[#4A4B98] cursor-pointer"
          />
          <span className="text-[12px] font-bold text-[#1A1A2E]">Active</span>
        </label>

        {type.pinned && (
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.pinned === 'true'}
              onChange={e => set('pinned', e.target.checked ? 'true' : 'false')}
              className="w-4 h-4 rounded accent-[#4A4B98] cursor-pointer"
            />
            <span className="text-[12px] font-bold text-[#1A1A2E]">Pinned</span>
          </label>
        )}
      </div>

      {error && <p className="text-[12px] font-semibold" style={{ color: '#DA1212' }}>{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          onClick={onSave}
          disabled={saving}
          className="flex-1 py-2.5 rounded-xl font-bold text-[13px] text-white disabled:opacity-60"
          style={{ backgroundColor: BLUE }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl font-bold text-[13px] text-[#1A1A2E] bg-white border-2 border-[#EBEBF2]"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Tab ─────────────────────────────────────────────────────────────────────

export default function ContentTab({ type }: { type: ContentType }) {
  const [items, setItems]     = useState<Item[]>([])
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding]   = useState(false)
  const [draft, setDraft]     = useState<Record<string, string>>({})
  /** Signed URL for the row being edited, so its image previews immediately. */
  const [draftImageUrl, setDraftImageUrl] = useState<string | null>(null)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // Derived rather than stored: the tab is loading exactly while the rows on
  // screen belong to a different type than the one selected. A setState in the
  // effect body would cascade an extra render.
  const loading = loadedFor !== type.slug

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/content/${type.slug}`)
    if (res.ok) {
      const d = await res.json()
      setItems(d.items ?? [])
    }
    setLoadedFor(type.slug)
  }, [type.slug])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/admin/content/${type.slug}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled) return
        setItems(d?.items ?? [])
        setLoadedFor(type.slug)
      })
      .catch(() => { if (!cancelled) setLoadedFor(type.slug) })
    return () => { cancelled = true }
  }, [type.slug])

  function startAdd() {
    setError('')
    setEditingId(null)
    setAdding(true)
    setDraftImageUrl(null)
    setDraft({ active: 'true', display_order: String(items.length), pinned: 'false' })
  }

  function startEdit(item: Item) {
    setError('')
    setAdding(false)
    setEditingId(item.id)
    const d: Record<string, string> = {
      active: item.active === false ? 'false' : 'true',
      display_order: str(item.display_order ?? 0),
      pinned: item.pinned === true ? 'true' : 'false',
    }
    for (const f of type.fields) d[f.name] = str(item[f.name])
    setDraft(d)
    setDraftImageUrl(str(item.image_url) || null)
  }

  function cancel() {
    setAdding(false); setEditingId(null); setDraft({}); setError(''); setDraftImageUrl(null)
  }

  /** Strings from the form back into the column types Postgres expects. */
  function payload(): Record<string, unknown> {
    const out: Record<string, unknown> = {
      active: draft.active !== 'false',
      display_order: Number(draft.display_order) || 0,
    }
    if (type.pinned) out.pinned = draft.pinned === 'true'
    for (const f of type.fields) {
      const v = (draft[f.name] ?? '').trim()
      // Empty optional fields go as null, not '' — a date column rejects the
      // empty string outright.
      out[f.name] = v === '' ? (f.required ? '' : null) : v
    }
    return out
  }

  async function save() {
    setError('')
    for (const f of type.fields) {
      if (f.required && !(draft[f.name] ?? '').trim()) {
        setError(`${f.label} is required.`)
        return
      }
    }

    setSaving(true)
    const res = editingId
      ? await fetch(`/api/admin/content/${type.slug}/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload()),
        })
      : await fetch(`/api/admin/content/${type.slug}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload()),
        })
    setSaving(false)

    if (!res.ok) {
      const d = await res.json().catch(() => null)
      setError(d?.error ?? 'Could not save. Try again.')
      return
    }
    cancel()
    await load()
  }

  async function remove(id: string) {
    const res = await fetch(`/api/admin/content/${type.slug}/${id}`, { method: 'DELETE' })
    setConfirmDelete(null)
    if (res.ok) await load()
  }

  /** Toggles PATCH the single field, so they cannot disturb the rest of a row. */
  async function toggle(item: Item, field: 'active' | 'pinned') {
    const res = await fetch(`/api/admin/content/${type.slug}/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: !item[field] }),
    })
    if (res.ok) await load()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">{type.label}</h2>
          <p className="text-[11px] text-[#8E8EA8] font-medium mt-0.5">
            {type.slug === 'suggested-perks'
              ? 'Ideas shown to merchants in the perk editor.'
              : 'Shown in the member Home feed. Pinned items come first.'}
          </p>
        </div>
        {!adding && !editingId && (
          <button
            onClick={startAdd}
            className="px-4 py-2 rounded-xl font-bold text-[13px] text-white flex-shrink-0"
            style={{ backgroundColor: BLUE }}
          >
            + Add New
          </button>
        )}
      </div>

      {(adding || editingId) && (
        <ItemForm
          type={type}
          draft={draft}
          setDraft={setDraft}
          onSave={save}
          onCancel={cancel}
          saving={saving}
          error={error}
          imageUrl={draftImageUrl}
        />
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map(i => <div key={i} className="h-16 rounded-2xl bg-white animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="text-[13px] text-[#8E8EA8] font-medium py-6 text-center">
          Nothing here yet. Add the first one.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map(item => (
            <div key={item.id} className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-start gap-3">
              {/* Only when the row actually has artwork — an empty square on
                  every text-only card would be a column of nothing. */}
              {str(item.image_url) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={str(item.image_url)}
                  alt=""
                  className="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-[#EBEBF2]"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-[14px] font-bold text-[#1A1A2E]">{str(item[type.titleField])}</p>
                  {item.active === false && (
                    <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-[#EBEBF2] text-[#8E8EA8]">
                      Inactive
                    </span>
                  )}
                  {type.pinned && item.pinned === true && (
                    <span
                      className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: '#FFB21725', color: '#8A6A00' }}
                    >
                      Pinned
                    </span>
                  )}
                </div>
                {type.subtitleField && (
                  <p className="text-[12px] text-[#8E8EA8] font-medium mt-0.5 line-clamp-2">
                    {str(item[type.subtitleField])}
                  </p>
                )}
                <p className="text-[10px] text-[#B0B0C8] font-medium mt-1">
                  Order {str(item.display_order ?? 0)}
                </p>
              </div>

              <div className="flex flex-col gap-1 flex-shrink-0 items-end">
                <div className="flex gap-1.5">
                  <button
                    onClick={() => startEdit(item)}
                    className="text-[12px] font-bold px-2 py-1 rounded-lg bg-[#F5F5F8]"
                    style={{ color: BLUE }}
                  >
                    Edit
                  </button>
                  {confirmDelete === item.id ? (
                    <>
                      <button
                        onClick={() => remove(item.id)}
                        className="text-[12px] font-bold px-2 py-1 rounded-lg text-white"
                        style={{ backgroundColor: '#DA1212' }}
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="text-[12px] font-bold px-2 py-1 rounded-lg bg-[#F5F5F8] text-[#8E8EA8]"
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(item.id)}
                      className="text-[12px] font-bold px-2 py-1 rounded-lg bg-[#F5F5F8]"
                      style={{ color: '#DA1212' }}
                    >
                      Delete
                    </button>
                  )}
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => toggle(item, 'active')}
                    className="text-[11px] font-bold text-[#8E8EA8]"
                  >
                    {item.active === false ? 'Activate' : 'Deactivate'}
                  </button>
                  {type.pinned && (
                    <button
                      onClick={() => toggle(item, 'pinned')}
                      className="text-[11px] font-bold text-[#8E8EA8]"
                    >
                      {item.pinned === true ? 'Unpin' : 'Pin'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
