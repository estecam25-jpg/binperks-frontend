'use client'

/**
 * Admin — send a BinPerks announcement to members' alerts.
 *
 * NOT a ContentTab. The generic content tabs are CRUD over rows that can be
 * edited and deleted; an announcement is a SEND. Once the alerts are in
 * members' apps there is nothing to edit, so this is a form plus a permanent
 * log, and neither an edit nor a delete control exists.
 *
 * Module scope, and the form's inputs live in this component rather than a
 * nested one, so React never remounts them mid-typing (the focus bug fixed in
 * 8b422a3).
 */

import { useCallback, useEffect, useState } from 'react'
import { alertGlyph } from '@/lib/member-alerts'

const BLUE = '#4A4B98'

const MAX_TITLE = 100
const MAX_BODY = 500

type Target = 'all' | 'vip' | 'starter'

const TARGETS: { id: Target; label: string }[] = [
  { id: 'all',     label: 'All active members' },
  { id: 'vip',     label: 'VIP members only' },
  { id: 'starter', label: 'Starter members only' },
]

interface Announcement {
  id: string
  title: string
  body: string
  target: Target
  sent_by: string
  recipient_count: number
  created_at: string
}

const inputClass =
  'w-full rounded-xl border border-[#EBEBF2] bg-[#F5F5F8] px-4 py-2.5 text-[13px] text-[#1A1A2E] ' +
  'focus:outline-none focus:ring-2 focus:ring-[#4A4B98]/30 placeholder:text-[#B0B0C8]'

function formatSent(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export default function AnnouncementsTab() {
  const [title, setTitle]   = useState('')
  const [body, setBody]     = useState('')
  const [target, setTarget] = useState<Target>('all')

  const [sent, setSent]       = useState<Announcement[]>([])
  const [counts, setCounts]   = useState<Record<Target, number>>({ all: 0, vip: 0, starter: 0 })
  const [loaded, setLoaded]   = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError]     = useState('')
  const [result, setResult]   = useState<string | null>(null)

  /** Set while the confirmation dialog is up. */
  const [confirming, setConfirming] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/announcements')
    if (res.ok) {
      const d = await res.json()
      setSent(d.announcements ?? [])
      if (d.counts) setCounts(d.counts)
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/announcements')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled) return
        setSent(d?.announcements ?? [])
        if (d?.counts) setCounts(d.counts)
        setLoaded(true)
      })
      .catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [])

  const recipientCount = counts[target]
  const canSend = title.trim().length > 0 && body.trim().length > 0 && !sending

  function askToSend() {
    setError('')
    setResult(null)
    if (!title.trim()) { setError('Title is required.'); return }
    if (!body.trim())  { setError('Body is required.'); return }
    setConfirming(true)
  }

  async function send() {
    setConfirming(false)
    setSending(true)
    setError('')

    const res = await fetch('/api/admin/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), body: body.trim(), target }),
    })
    setSending(false)

    if (!res.ok) {
      const d = await res.json().catch(() => null)
      setError(d?.error ?? 'Could not send. Try again.')
      return
    }

    const d = await res.json()
    setResult(
      `Sent to ${d.recipientCount} member${d.recipientCount === 1 ? '' : 's'}` +
      (d.smsAttempted ? ` · ${d.smsAttempted} SMS queued` : ''),
    )
    // Cleared so the form cannot be submitted twice by reflex — an announcement
    // cannot be unsent.
    setTitle('')
    setBody('')
    await load()
  }

  return (
    <div className="flex flex-col gap-5">

      {/* ── Compose ── */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EBEBF2]">
          <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">Send Announcement</h2>
          <p className="text-[11px] text-[#8E8EA8] font-medium mt-0.5">
            Appears in the alerts bell for every member you target. Announcements
            cannot be edited or unsent.
          </p>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <label className="text-[12px] font-bold text-[#1A1A2E]">Title</label>
              <span className="text-[11px] font-medium" style={{ color: title.length > MAX_TITLE ? '#DA1212' : '#B0B0C8' }}>
                {title.length}/{MAX_TITLE}
              </span>
            </div>
            <input
              type="text"
              maxLength={MAX_TITLE}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="New stores just joined"
              aria-label="Announcement title"
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <label className="text-[12px] font-bold text-[#1A1A2E]">Body</label>
              <span className="text-[11px] font-medium" style={{ color: body.length > MAX_BODY ? '#DA1212' : '#B0B0C8' }}>
                {body.length}/{MAX_BODY}
              </span>
            </div>
            <textarea
              rows={3}
              maxLength={MAX_BODY}
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Three more bin stores just joined the BinPerks network near you."
              aria-label="Announcement body"
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="ann-target" className="text-[12px] font-bold text-[#1A1A2E]">Target</label>
            <select
              id="ann-target"
              value={target}
              onChange={e => setTarget(e.target.value as Target)}
              className={inputClass}
            >
              {TARGETS.map(t => (
                <option key={t.id} value={t.id}>
                  {t.label} ({counts[t.id]})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-[#8E8EA8] font-medium">
              Blacklisted members are never included.
            </p>
          </div>

          {/* ── Preview ──
              Rendered with the same glyph and layout the member drawer uses, so
              what an admin approves is what a member receives. */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-bold text-[#1A1A2E]">Preview</label>
            <div className="rounded-xl px-4 py-3 flex items-start gap-3" style={{ backgroundColor: `${BLUE}0D` }}>
              <span className="text-[20px] leading-none mt-0.5 flex-shrink-0">
                {alertGlyph('binperks_announcement')}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[14px] font-extrabold text-[#1A1A2E]">
                    {title.trim() || 'Announcement title'}
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#DA1212' }} />
                </div>
                <p className="text-[12px] text-[#8E8EA8] mt-0.5 leading-relaxed whitespace-pre-wrap">
                  {body.trim() || 'Your message will appear here.'}
                </p>
                <p className="text-[10px] font-medium text-[#B0B0C8] mt-1">just now</p>
              </div>
            </div>
          </div>

          {error && <p className="text-[12px] font-semibold" style={{ color: '#DA1212' }}>{error}</p>}
          {result && <p className="text-[12px] font-semibold" style={{ color: '#2A7D34' }}>✓ {result}</p>}

          <button
            onClick={askToSend}
            disabled={!canSend}
            className="w-full py-3.5 rounded-xl font-bold text-[14px] text-white transition-colors disabled:opacity-40"
            style={{ backgroundColor: BLUE }}
          >
            {sending ? 'Sending…' : 'Send Announcement'}
          </button>
        </div>
      </div>

      {/* ── Sent log ── */}
      <div className="flex flex-col gap-2">
        <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">Sent</h2>

        {!loaded ? (
          <div className="flex flex-col gap-2">
            {[0, 1].map(i => <div key={i} className="h-16 rounded-2xl bg-white animate-pulse" />)}
          </div>
        ) : sent.length === 0 ? (
          <p className="text-[13px] text-[#8E8EA8] font-medium py-4 text-center">
            No announcements sent yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {sent.map(a => (
              <div key={a.id} className="bg-white rounded-2xl px-4 py-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[14px] font-bold text-[#1A1A2E]">{a.title}</p>
                  <span
                    className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: `${BLUE}14`, color: BLUE }}
                  >
                    {TARGETS.find(t => t.id === a.target)?.label ?? a.target}
                  </span>
                </div>
                <p className="text-[12px] text-[#8E8EA8] font-medium mt-1 line-clamp-2">{a.body}</p>
                <p className="text-[10px] text-[#B0B0C8] font-medium mt-1.5">
                  {formatSent(a.created_at)} · {a.recipient_count} recipient
                  {a.recipient_count === 1 ? '' : 's'} · {a.sent_by}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Confirmation ──
          An announcement cannot be unsent, so the count is stated before it
          goes rather than after. */}
      {confirming && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center px-4 z-50">
          <div className="bg-white rounded-3xl px-6 py-6 w-full max-w-sm flex flex-col gap-4 shadow-2xl">
            <h3 className="font-['Coiny'] text-xl text-[#1A1A2E]">Send this announcement?</h3>
            <p className="text-[13px] text-[#8E8EA8] font-medium leading-relaxed">
              This will send an alert to {recipientCount} member
              {recipientCount === 1 ? '' : 's'}. Continue?
            </p>
            <p className="text-[12px] text-[#B0B0C8] font-medium leading-relaxed">
              Announcements cannot be edited or unsent.
            </p>
            <div className="flex gap-2">
              <button
                onClick={send}
                className="flex-1 py-3 rounded-xl font-bold text-[13px] text-white"
                style={{ backgroundColor: BLUE }}
              >
                Send
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="flex-1 py-3 rounded-xl font-bold text-[13px] text-[#1A1A2E] bg-white border-2 border-[#EBEBF2]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
