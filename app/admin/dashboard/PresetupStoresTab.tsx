'use client'

/**
 * Admin — Pre-setup Stores.
 *
 * A handful of local stores Esteban builds at his desk, prints materials for,
 * and then walks into with the posters already made. The owner pays and signs
 * on his phone at the visit through their own finish-setup link.
 *
 * THESE ARE REAL MERCHANT AND STORE ROWS in billing_status 'presetup'. That
 * is what makes the printed QR codes the final ones. Everything else about
 * them is switched off — they cannot stamp, they are not in the member app,
 * they are not in network stats, they are not in the Merchants tab — see
 * lib/presetup for the full list of what the status excludes.
 *
 * DELETE IS HERE AND NOWHERE ELSE, and only while still pre-setup. Once an
 * owner has paid there is a Stripe subscription behind the row and once they
 * have signed there is an executed agreement; neither should be removable by
 * a button. The route enforces that in SQL, not just here.
 *
 * ONCE ACTIVATED A STORE LEAVES THIS TAB and appears under Merchants, because
 * the list is simply "every merchant still in 'presetup'". There is no second
 * flag to keep in step.
 */

import { useCallback, useEffect, useState } from 'react'
import { Spinner } from './ui'

const BLUE = '#4A4B98'

interface PresetupStore {
  merchantId: string
  companyName: string | null
  ownerName: string | null
  ownerEmail: string | null
  ownerPhone: string | null
  locationCount: number
  createdAt: string | null
  createdBy: string | null
  storeId: string | null
  storeName: string | null
  brandName: string | null
  storeKey: string | null
  address: string
  logoUrl: string | null
  finishSetupUrl: string | null
}

const EMPTY = {
  companyName: '', brandName: '', ownerName: '', ownerEmail: '', ownerPhone: '',
  storeName: '', address: '', city: '', state: '', zip: '', locationCount: '1',
}

export default function PresetupStoresTab() {
  const [stores,  setStores]  = useState<PresetupStore[]>([])
  const [loading, setLoading] = useState(true)
  const [adding,  setAdding]  = useState(false)
  const [form,    setForm]    = useState({ ...EMPTY })
  const [logo,    setLogo]    = useState<File | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [copied,  setCopied]  = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/presetup-stores')
      const data = await res.json()
      setStores(res.ok ? (data.stores ?? []) : [])
      if (!res.ok) setError(data.error ?? 'Could not load pre-setup stores.')
    } catch {
      setError('Could not load pre-setup stores.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true); setError(null)

    const body = new FormData()
    for (const [k, v] of Object.entries(form)) body.append(k, v)
    if (logo) body.append('logo', logo)

    try {
      const res  = await fetch('/api/admin/presetup-stores', { method: 'POST', body })
      const data = await res.json()
      if (!res.ok) {
        setError(data.message ?? data.error ?? 'Could not create the store.')
        return
      }
      setForm({ ...EMPTY }); setLogo(null); setAdding(false)
      await load()
    } catch {
      setError('Could not create the store.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(s: PresetupStore) {
    const name = s.storeName ?? 'this store'
    if (!confirm(
      `Delete ${name}?\n\nThis permanently removes the merchant and the store, `
      + `including its join link and QR codes. Anything already printed will stop working. `
      + `This cannot be undone.`
    )) return

    setError(null)
    try {
      const res = await fetch('/api/admin/presetup-stores', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantId: s.merchantId }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.message ?? data.error ?? 'Could not delete.'); return }
      await load()
    } catch {
      setError('Could not delete.')
    }
  }

  async function copyLink(s: PresetupStore) {
    if (!s.finishSetupUrl) return
    try {
      await navigator.clipboard.writeText(s.finishSetupUrl)
      setCopied(s.merchantId)
      setTimeout(() => setCopied(c => (c === s.merchantId ? null : c)), 2000)
    } catch {
      // Clipboard is blocked in some contexts; show it so it can be copied by hand.
      prompt('Copy this finish-setup link:', s.finishSetupUrl)
    }
  }

  return (
    <div className="flex flex-col gap-4">

      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-['Coiny'] text-2xl text-[#1A1A2E]">Pre-setup Stores</h2>
          <p className="text-[12px] text-[#8E8EA8] font-medium mt-1 max-w-xl leading-relaxed">
            Stores built before the visit. The join links and QR codes are final, so materials
            can be printed now. The store stays hidden and cannot award stamps until the owner
            pays and signs through their finish-setup link.
          </p>
        </div>
        <button
          onClick={() => { setAdding(a => !a); setError(null) }}
          className="shrink-0 text-white text-[12px] font-bold rounded-xl px-4 py-2.5"
          style={{ background: BLUE }}
        >
          {adding ? 'Cancel' : 'Add pre-setup store'}
        </button>
      </div>

      {error && (
        <p className="text-[12px] font-bold text-[#DA1212] bg-red-50 rounded-xl px-4 py-3">{error}</p>
      )}

      {adding && (
        <form onSubmit={create} className="bg-white rounded-2xl p-5 flex flex-col gap-4 shadow-sm">
          <Group title="Business">
            <Field label="Business legal name" required
                   value={form.companyName} onChange={v => setForm(f => ({ ...f, companyName: v }))}
                   placeholder="XYZ Liquidation LLC" />
            <Field label="DBA / store brand"
                   value={form.brandName} onChange={v => setForm(f => ({ ...f, brandName: v }))}
                   placeholder="Acme Bins" />
          </Group>

          <Group title="Owner">
            <Field label="Owner name" required
                   value={form.ownerName} onChange={v => setForm(f => ({ ...f, ownerName: v }))}
                   placeholder="Jane Doe" />
            <Field label="Owner email" required type="email"
                   value={form.ownerEmail} onChange={v => setForm(f => ({ ...f, ownerEmail: v }))}
                   placeholder="owner@example.com" />
            <Field label="Owner phone"
                   value={form.ownerPhone} onChange={v => setForm(f => ({ ...f, ownerPhone: v }))}
                   placeholder="8135551234" />
          </Group>

          <Group title="Store">
            <Field label="Store name" required
                   value={form.storeName} onChange={v => setForm(f => ({ ...f, storeName: v }))}
                   placeholder="Acme Bins Downtown" />
            <Field label="Street address"
                   value={form.address} onChange={v => setForm(f => ({ ...f, address: v }))}
                   placeholder="123 Main St" />
            <Field label="City" required
                   value={form.city} onChange={v => setForm(f => ({ ...f, city: v }))}
                   placeholder="Tampa" />
            <Field label="State" required maxLength={2}
                   value={form.state} onChange={v => setForm(f => ({ ...f, state: v.toUpperCase() }))}
                   placeholder="FL" />
            <Field label="ZIP"
                   value={form.zip} onChange={v => setForm(f => ({ ...f, zip: v }))}
                   placeholder="33601" />
            <Field label="Locations" type="number"
                   value={form.locationCount} onChange={v => setForm(f => ({ ...f, locationCount: v }))}
                   hint="Sets the additional-location charge at checkout" />
          </Group>

          {/* The join link is derived from state, city and store name, exactly as
              an organic signup derives it — shown live so a typo is caught before
              anything is printed. */}
          {form.state && form.city && form.storeName && (
            <p className="text-[11px] text-[#8E8EA8]">
              Join link will be{' '}
              <span className="font-mono text-[#1A1A2E]">
                /join/{form.state.toUpperCase()}-{form.city.replace(/\s+/g, '')}-{form.storeName.replace(/\s+/g, '')}
              </span>
            </p>
          )}

          <div>
            <label className="block text-[11px] font-bold tracking-wide uppercase text-[#8E8EA8] mb-1">
              Store logo
            </label>
            <input type="file" accept="image/png,image/jpeg,image/webp"
                   onChange={e => setLogo(e.target.files?.[0] ?? null)}
                   className="text-[12px] text-[#5A5A72]" />
            <p className="text-[10px] text-[#8E8EA8] mt-1">PNG, JPEG or WebP · up to 5 MB · optional</p>
          </div>

          <button type="submit" disabled={saving}
                  className="text-white text-[13px] font-bold rounded-xl py-3 disabled:opacity-60"
                  style={{ background: BLUE }}>
            {saving ? 'Creating…' : 'Create pre-setup store'}
          </button>
        </form>
      )}

      {loading ? <Spinner /> : stores.length === 0 ? (
        <p className="text-[13px] text-[#8E8EA8] bg-white rounded-2xl px-5 py-6 text-center">
          No pre-setup stores. Add one before a visit to print its materials in advance.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {stores.map(s => (
            <div key={s.merchantId} className="bg-white rounded-2xl px-5 py-4 shadow-sm
                                               flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0 flex items-center gap-3">
                {s.logoUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={s.logoUrl} alt="" className="w-11 h-11 rounded-xl object-cover shrink-0" />
                  : <div className="w-11 h-11 rounded-xl bg-[#F5F5F8] shrink-0" />}
                <div className="min-w-0">
                  <p className="font-bold text-[14px] text-[#1A1A2E] truncate">
                    {s.storeName ?? '(no store)'}
                  </p>
                  <p className="text-[11px] text-[#8E8EA8] font-medium truncate">
                    {s.ownerName ?? '—'}{s.ownerEmail ? ` · ${s.ownerEmail}` : ''}
                  </p>
                  {s.storeKey && (
                    <p className="text-[10px] text-[#8E8EA8] font-mono truncate mt-0.5">
                      /join/{s.storeKey}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a href={`/admin/presetup/${s.merchantId}/print`}
                   target="_blank" rel="noopener noreferrer"
                   className="text-[12px] font-bold rounded-xl px-3.5 py-2.5 text-white"
                   style={{ background: BLUE }}>
                  Print materials
                </a>
                <button onClick={() => copyLink(s)} disabled={!s.finishSetupUrl}
                        className="text-[12px] font-bold rounded-xl px-3.5 py-2.5
                                   bg-[#EBEBF2] text-[#1A1A2E] disabled:opacity-50">
                  {copied === s.merchantId ? 'Copied' : 'Copy finish-setup link'}
                </button>
                <button onClick={() => remove(s)}
                        className="text-[12px] font-bold rounded-xl px-3.5 py-2.5
                                   bg-red-50 text-[#DA1212] hover:bg-red-100">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#8E8EA8] mb-2">{title}</p>
      <div className="grid sm:grid-cols-2 gap-3">{children}</div>
    </div>
  )
}

function Field({
  label, value, onChange, placeholder, required, type = 'text', maxLength, hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
  type?: string
  maxLength?: number
  hint?: string
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold tracking-wide uppercase text-[#8E8EA8] mb-1">
        {label}{required && <span className="text-[#DA1212]"> *</span>}
      </span>
      <input
        type={type}
        value={value}
        required={required}
        maxLength={maxLength}
        min={type === 'number' ? 1 : undefined}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-[#EBEBF2] rounded-xl px-3 py-2.5 text-[13px]
                   text-[#1A1A2E] focus:outline-none focus:border-[#4A4B98]"
      />
      {hint && <span className="block text-[10px] text-[#8E8EA8] mt-1">{hint}</span>}
    </label>
  )
}
