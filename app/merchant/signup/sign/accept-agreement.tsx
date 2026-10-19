'use client'

/**
 * The acceptance screen.
 *
 * ── WHAT IT SHOWS IS WHAT GETS HASHED ──────────────────────────────────────
 * The blocks come from the API already filled in, and the server hashes the
 * same rendered text when it records the acceptance. Nothing is composed here,
 * so the page cannot display one document and have another one recorded.
 *
 * ── THE BUTTON IS DELIBERATELY STUBBORN ────────────────────────────────────
 * Disabled until the box is ticked and both fields have content, and disabled
 * again the instant it is pressed. A double-click or a refresh mid-request is
 * safe anyway — the database has a unique index on (merchant, version) and the
 * route reads a conflict as "already accepted" — but the cheapest place to
 * stop a second submission is before it leaves the browser.
 *
 * ── IT FINISHES A STALLED ACTIVATION BY ITSELF ─────────────────────────────
 * Acceptance and activation are two steps. If the second fails, the record
 * still stands, and this page retries activation on load for anyone accepted
 * but not yet live. That is what replaces DocuSeal's second route in — a
 * merchant never has to know anything went wrong.
 */

import { useCallback, useEffect, useState } from 'react'

type Block =
  | { k: 'h'; t: string }
  | { k: 'p'; t: string }
  | { k: 'tbl'; rows: string[][] }
  | { k: 'accept' }

interface Doc {
  version: string
  blocks: Block[]
  merchantLegalName: string
  statement: string
  billingStatus: string
  accepted: { acceptedAt: string; signerName: string; signerTitle: string; hasPdf: boolean } | null
}

const BLUE = '#4A4B98'

export default function AcceptAgreement({ checkoutSession }: { checkoutSession: string | null }) {
  const [doc, setDoc] = useState<Doc | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [name, setName]   = useState('')
  const [title, setTitle] = useState('')
  const [agreed, setAgreed] = useState(false)

  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone]   = useState(false)
  const [pending, setPending] = useState(false)

  const qs = checkoutSession ? `?session=${encodeURIComponent(checkoutSession)}` : ''

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/merchant/agreement${qs}`)
      if (!res.ok) {
        setLoadError(res.status === 401
          ? 'This link is no longer valid. Sign in with the email you used and we will take you to your agreement.'
          : 'We could not load your agreement. Please refresh, or email support@binperks.com.')
        return
      }
      const d: Doc = await res.json()
      setDoc(d)

      // Accepted already but not live: finish the job quietly.
      if (d.accepted && d.billingStatus !== 'active') {
        setDone(true)
        const r = await fetch(`/api/merchant/agreement/activate${qs}`, { method: 'POST' })
        const j = await r.json().catch(() => null)
        if (j?.live) window.location.href = '/merchant/dashboard'
        else setPending(true)
      } else if (d.accepted) {
        setDone(true)
        window.location.href = '/merchant/dashboard'
      }
    } catch {
      setLoadError('We could not load your agreement. Please refresh, or email support@binperks.com.')
    }
  }, [qs])

  useEffect(() => { void load() }, [load])

  const ready = agreed && name.trim().length > 1 && title.trim().length > 1

  async function accept() {
    if (!ready || busy) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/merchant/agreement${qs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signerName: name.trim(), signerTitle: title.trim(), agreed: true }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok) {
        setError(d?.message ?? 'We could not record your acceptance. Please try again.')
        return
      }
      setDone(true)
      if (d?.activationPending) { setPending(true); return }
      window.location.href = '/merchant/dashboard'
    } catch {
      setError('We could not record your acceptance. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (loadError) {
    return (
      <Shell>
        <h1 className="font-['Coiny'] text-2xl text-[#1A1A2E]">Agreement</h1>
        <p className="text-[14px] text-[#5A5A72] leading-relaxed mt-2">{loadError}</p>
        <a href="/merchant/login" className="inline-block mt-4 text-[13px] font-bold" style={{ color: BLUE }}>
          Go to sign in →
        </a>
      </Shell>
    )
  }

  if (!doc) {
    return (
      <Shell>
        <div className="h-7 w-48 bg-[#EBEBF2] rounded animate-pulse" />
        <div className="h-[55vh] bg-[#EBEBF2] rounded-2xl animate-pulse mt-4" />
      </Shell>
    )
  }

  if (done && pending) {
    return (
      <Shell>
        <h1 className="font-['Coiny'] text-2xl text-[#1A1A2E]">Agreement accepted</h1>
        <p className="text-[14px] text-[#5A5A72] leading-relaxed mt-2">
          Your agreement is saved. We&rsquo;re finishing setup — refresh in a minute.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-5 py-3 rounded-2xl font-bold text-[14px] text-white"
          style={{ background: BLUE }}
        >
          Refresh
        </button>
      </Shell>
    )
  }

  return (
    <Shell wide>
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-bold tracking-[0.12em] uppercase" style={{ color: BLUE }}>
          Step 2 of 2
        </p>
        <h1 className="font-['Coiny'] text-[26px] text-[#1A1A2E] leading-tight">
          Your Merchant Agreement
        </h1>
        <p className="text-[13px] text-[#8E8EA8] font-medium">
          Read it through, then accept at the bottom. We&rsquo;ll email you a copy.
        </p>
      </div>

      {/* The document. Scrolls in place so the acceptance controls stay put. */}
      <div className="bg-white rounded-2xl shadow-sm border border-[#EBEBF2] overflow-hidden mt-4">
        <div className="max-h-[58vh] overflow-y-auto px-5 py-5 flex flex-col gap-2">
          {doc.blocks.map((b, i) => <BlockView key={i} block={b} name={name} title={title} doc={doc} />)}
        </div>
      </div>

      {/* Acceptance */}
      <div className="bg-white rounded-2xl shadow-sm border border-[#EBEBF2] px-5 py-5 mt-4 flex flex-col gap-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[11px] font-bold tracking-wide uppercase text-[#8E8EA8] mb-1">
              Full name <span className="text-[#DA1212]">*</span>
            </span>
            <input
              value={name} onChange={e => setName(e.target.value)} maxLength={120}
              autoComplete="name" placeholder="Jane Doe"
              className="w-full px-3 py-2.5 rounded-xl bg-[#F5F5F8] border-2 border-transparent
                         focus:border-[#4A4B98] outline-none text-[14px] font-bold text-[#1A1A2E]
                         placeholder:font-normal placeholder:text-[#D1D1DC]"
            />
          </label>
          <label className="block">
            <span className="block text-[11px] font-bold tracking-wide uppercase text-[#8E8EA8] mb-1">
              Title <span className="text-[#DA1212]">*</span>
            </span>
            <input
              value={title} onChange={e => setTitle(e.target.value)} maxLength={120}
              autoComplete="organization-title" placeholder="Owner"
              className="w-full px-3 py-2.5 rounded-xl bg-[#F5F5F8] border-2 border-transparent
                         focus:border-[#4A4B98] outline-none text-[14px] font-bold text-[#1A1A2E]
                         placeholder:font-normal placeholder:text-[#D1D1DC]"
            />
          </label>
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
            className="mt-0.5 w-5 h-5 shrink-0 accent-[#4A4B98]"
          />
          <span className="text-[13px] font-medium text-[#1A1A2E] leading-relaxed">
            {doc.statement}
          </span>
        </label>

        {error && (
          <p role="alert" className="text-[12px] font-semibold text-red-700">{error}</p>
        )}

        <button
          onClick={accept}
          disabled={!ready || busy}
          className="w-full py-4 rounded-2xl font-bold text-[16px] text-white font-['Montserrat']
                     disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
          style={{ background: BLUE }}
        >
          {busy ? 'Accepting…' : 'Accept and activate'}
        </button>

        <p className="text-[11px] text-[#8E8EA8] text-center font-medium">
          Accepting activates your store. BinPerks LLC has accepted this agreement on the platform.
        </p>
      </div>
    </Shell>
  )
}

function BlockView({ block, name, title, doc }: {
  block: Block; name: string; title: string; doc: Doc
}) {
  if (block.k === 'h') {
    return (
      <h2 className="font-bold text-[13px] text-[#1A1A2E] tracking-wide uppercase mt-4 pb-1
                     border-b border-[#EBEBF2]">
        {block.t}
      </h2>
    )
  }

  if (block.k === 'tbl') {
    return (
      <table className="w-full text-[12px] border-collapse my-2">
        <tbody>
          {block.rows.map((row, i) => (
            <tr key={i} className="border-b border-[#EBEBF2] align-top">
              {row.length === 1 ? (
                <td colSpan={2} className="py-1.5 font-bold text-[#1A1A2E]">{row[0]}</td>
              ) : (
                <>
                  <td className="py-1.5 pr-3 font-bold text-[#1A1A2E] w-[38%]">{row[0]}</td>
                  <td className="py-1.5 text-[#5A5A72] whitespace-pre-line">{row[1]}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  if (block.k === 'accept') {
    // A preview of what will be recorded, so the merchant can see their own
    // details land where two signatures used to be.
    return (
      <div className="my-3 rounded-xl bg-[#F5F5F8] px-4 py-3 text-[12px] leading-relaxed">
        <p className="font-bold text-[#1A1A2E]">BinPerks LLC — accepted by platform</p>
        <p className="mt-2 font-bold text-[#1A1A2E]">
          {doc.merchantLegalName} — accepted electronically
        </p>
        <p className="text-[#8E8EA8]">
          By: {name.trim() || '[your name]'}, {title.trim() || '[your title]'}
        </p>
        <p className="text-[#8E8EA8]">Date: on acceptance</p>
      </div>
    )
  }

  if (!block.t.trim()) return <div className="h-1" />
  return (
    <p className="text-[12.5px] text-[#3A3A4C] leading-relaxed whitespace-pre-line">{block.t}</p>
  )
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-dvh bg-[#F5F5F8] px-4 py-8">
      <div className={`mx-auto w-full ${wide ? 'max-w-2xl' : 'max-w-md'}`}>{children}</div>
    </div>
  )
}
