'use client'

/**
 * Admin — the perk menu, the review queue, and live perks.
 *
 * Three things that are really one job: deciding what a merchant may offer.
 * Keeping them on one tab means approving a submission and seeing it land in
 * the menu takes no navigation.
 *
 * ── RETIRE, NOT DELETE ─────────────────────────────────────────────────────
 * A menu option may be live at any number of stores. Retiring removes it from
 * every merchant's dropdown and leaves those stores untouched, which is the
 * only safe move once a perk has been promised to a member. The count of
 * stores using it is shown next to the button so the decision is informed.
 *
 * ── APPROVING IS EDITING ───────────────────────────────────────────────────
 * The approve form opens pre-filled with what the merchant wrote, because the
 * common outcome is "yes, reworded". Whatever is in the fields when Approve is
 * pressed is what joins the shared menu — for every store, with no trace of
 * who proposed it.
 *
 * ── A REASON IS MANDATORY to decline or hide ───────────────────────────────
 * Both are shown to the merchant verbatim and are the only explanation they
 * get. The buttons stay disabled until one is typed.
 */

import { useCallback, useEffect, useState } from 'react'
import { Spinner } from './ui'
import {
  groupMenu, APPROVAL_CHECKLIST, APPROVAL_CHECKLIST_HEADING, type MenuPerk,
} from '@/lib/perk-menu'

const BLUE = '#4A4B98'

interface MenuRow extends MenuPerk { inUseCount: number }

interface Submission {
  id: string
  storeName: string
  title: string
  description: string
  note: string | null
  status: 'pending' | 'approved' | 'declined'
  declineReason: string | null
  createdAt: string
  reviewedAt: string | null
  reviewedBy: string | null
}

interface LivePerk {
  id: string
  storeName: string
  slot: number
  memberType: string
  title: string
  description: string
  fromMenu: boolean
  hidden: boolean
  hiddenReason: string | null
}

export default function PerksAdminTab() {
  const [menu, setMenu] = useState<MenuRow[]>([])
  const [subs, setSubs] = useState<Submission[]>([])
  const [live, setLive] = useState<LivePerk[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [m, s, l] = await Promise.all([
        fetch('/api/admin/perk-menu').then(r => r.json()),
        fetch('/api/admin/perk-submissions').then(r => r.json()),
        fetch('/api/admin/perks').then(r => r.json()),
      ])
      setMenu(m.perks ?? [])
      setSubs(s.submissions ?? [])
      setLive(l.perks ?? [])
    } catch {
      setError('Could not load the perk menu.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function send(url: string, body: unknown, key: string) {
    setBusy(key); setError(null)
    try {
      const res = await fetch(url, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok) { setError(d?.message ?? d?.error ?? 'That did not work.'); return false }
      await load()
      return true
    } finally { setBusy(null) }
  }

  async function post(url: string, body: unknown, key: string) {
    setBusy(key); setError(null)
    try {
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok) { setError(d?.message ?? d?.error ?? 'That did not work.'); return false }
      await load()
      return true
    } finally { setBusy(null) }
  }

  if (loading) return <Spinner />

  const pending  = subs.filter(s => s.status === 'pending')
  const reviewed = subs.filter(s => s.status !== 'pending')
  const groups   = groupMenu(menu)
  const groupNames = [...new Set(menu.map(m => m.groupName))]

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="text-[12px] font-bold text-[#DA1212] bg-red-50 rounded-xl px-4 py-3">{error}</p>
      )}

      {/* ── Review queue ── */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-['Coiny'] text-2xl text-[#1A1A2E]">
            Perk Submissions{pending.length > 0 ? ` · ${pending.length} waiting` : ''}
          </h2>
          <p className="text-[12px] text-[#8E8EA8] font-medium mt-0.5 max-w-xl leading-relaxed">
            Approving adds the perk to the shared menu for every store. The merchant who
            submitted it is never shown on the menu entry.
          </p>
        </div>

        {pending.length === 0 ? (
          <p className="text-[13px] text-[#8E8EA8] bg-white rounded-2xl px-5 py-4">
            Nothing waiting for review.
          </p>
        ) : pending.map(s => (
          <SubmissionCard
            key={s.id}
            submission={s}
            groupNames={groupNames}
            busy={busy === s.id}
            onApprove={(title, description, groupName) =>
              post('/api/admin/perk-submissions', { id: s.id, action: 'approve', title, description, groupName }, s.id)}
            onDecline={reason =>
              post('/api/admin/perk-submissions', { id: s.id, action: 'decline', reason }, s.id)}
          />
        ))}

        {reviewed.length > 0 && (
          <details className="bg-white rounded-2xl px-4 py-3 shadow-sm">
            <summary className="cursor-pointer text-[12px] font-bold text-[#8E8EA8]">
              Already reviewed · {reviewed.length}
            </summary>
            <div className="flex flex-col gap-2 mt-3">
              {reviewed.map(s => (
                <div key={s.id} className="text-[12px] border-t border-[#EBEBF2] pt-2">
                  <span className={`font-bold ${s.status === 'approved' ? 'text-green-700' : 'text-[#DA1212]'}`}>
                    {s.status}
                  </span>
                  {' · '}<span className="font-bold text-[#1A1A2E]">{s.title}</span>
                  {' · '}<span className="text-[#8E8EA8]">{s.storeName}</span>
                  {s.declineReason && (
                    <p className="text-[11px] text-[#8E8EA8] mt-0.5">{s.declineReason}</p>
                  )}
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      {/* ── The menu ── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-['Coiny'] text-2xl text-[#1A1A2E]">Perk Menu</h2>
            <p className="text-[12px] text-[#8E8EA8] font-medium mt-0.5 max-w-xl leading-relaxed">
              What every merchant chooses from. Any option can go in a Starter or a VIP slot —
              the slot decides who gets it. Editing an option changes future choices only;
              perks already live keep the wording they were chosen with.
            </p>
          </div>
        </div>

        <AddMenuPerk groupNames={groupNames} busy={busy === 'add'}
          onAdd={(groupName, title, description) =>
            post('/api/admin/perk-menu', { groupName, title, description }, 'add')} />

        {groups.map(g => (
          <div key={g.name} className="flex flex-col gap-2">
            <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#8E8EA8] px-1">
              {g.name}
            </p>
            {g.perks.map(p => {
              const row = menu.find(m => m.id === p.id)!
              return (
                <div key={p.id}
                     className={`bg-white rounded-2xl px-4 py-3 shadow-sm flex items-center
                                 justify-between gap-3 ${row.retiredAt ? 'opacity-55' : ''}`}>
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-[#1A1A2E]">
                      {p.title}
                      {row.retiredAt && (
                        <span className="ml-2 text-[10px] font-bold text-[#8E8EA8] bg-[#F5F5F8] rounded-full px-2 py-0.5">
                          Retired
                        </span>
                      )}
                    </p>
                    <p className="text-[12px] text-[#8E8EA8] font-medium leading-snug">{p.description}</p>
                    <p className="text-[10px] text-[#8E8EA8] mt-0.5">
                      {row.inUseCount === 0 ? 'Not in use' : `In use at ${row.inUseCount} slot${row.inUseCount === 1 ? '' : 's'}`}
                    </p>
                  </div>
                  <button
                    onClick={() => send('/api/admin/perk-menu', { id: p.id, retired: !row.retiredAt }, p.id)}
                    disabled={busy === p.id}
                    className="shrink-0 text-[11px] font-bold rounded-xl px-3 py-2
                               bg-[#EBEBF2] text-[#1A1A2E] disabled:opacity-50"
                  >
                    {busy === p.id ? '…' : row.retiredAt ? 'Un-retire' : 'Retire'}
                  </button>
                </div>
              )
            })}
          </div>
        ))}
      </section>

      {/* ── Live perks, with the hide switch ── */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-['Coiny'] text-2xl text-[#1A1A2E]">Live perks</h2>
          <p className="text-[12px] text-[#8E8EA8] font-medium mt-0.5 max-w-xl leading-relaxed">
            What members can see right now. Hiding one takes it off member screens
            immediately; the merchant keeps the slot and is shown your reason.
          </p>
        </div>

        {live.length === 0 ? (
          <p className="text-[13px] text-[#8E8EA8] bg-white rounded-2xl px-5 py-4">No live perks.</p>
        ) : live.map(p => (
          <LivePerkRow
            key={p.id}
            perk={p}
            busy={busy === p.id}
            onHide={reason => send('/api/admin/perks', { perkId: p.id, hidden: true, reason }, p.id)}
            onShow={() => send('/api/admin/perks', { perkId: p.id, hidden: false }, p.id)}
          />
        ))}
      </section>
    </div>
  )
}

function SubmissionCard({
  submission: s, groupNames, busy, onApprove, onDecline,
}: {
  submission: Submission
  groupNames: string[]
  busy: boolean
  onApprove: (title: string, description: string, groupName: string) => void
  onDecline: (reason: string) => void
}) {
  // Pre-filled with what the merchant wrote: "approved, reworded" is the
  // normal outcome and they were told so before submitting.
  const [title, setTitle] = useState(s.title)
  const [description, setDescription] = useState(s.description)
  const [groupName, setGroupName] = useState(groupNames[0] ?? 'Discounts')
  const [reason, setReason] = useState('')
  const [declining, setDeclining] = useState(false)

  return (
    <div className="bg-white rounded-2xl px-5 py-4 shadow-sm flex flex-col gap-3">
      <div>
        <p className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#8E8EA8]">
          {s.storeName} · {s.createdAt.slice(0, 10)}
        </p>
        {s.note && (
          <p className="text-[12px] text-[#5A5A72] font-medium mt-1 leading-relaxed">
            Note: {s.note}
          </p>
        )}
      </div>

      <div className="grid sm:grid-cols-[1fr_1.6fr_auto] gap-2">
        <input value={title} onChange={e => setTitle(e.target.value)} maxLength={60}
               aria-label="Perk title"
               className="border border-[#EBEBF2] rounded-xl px-3 py-2 text-[13px] font-bold text-[#1A1A2E]" />
        <input value={description} onChange={e => setDescription(e.target.value)} maxLength={280}
               aria-label="Perk description"
               className="border border-[#EBEBF2] rounded-xl px-3 py-2 text-[13px] text-[#1A1A2E]" />
        <select value={groupName} onChange={e => setGroupName(e.target.value)}
                aria-label="Group"
                className="border border-[#EBEBF2] rounded-xl px-3 py-2 text-[13px] text-[#1A1A2E]">
          {groupNames.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      {/* The standard, in front of the person applying it. Read-only on
          purpose: a tickable list invites clicking through it. */}
      <div className="bg-[#F5F5F8] rounded-xl px-4 py-3">
        <p className="text-[11px] font-bold text-[#1A1A2E]">{APPROVAL_CHECKLIST_HEADING}</p>
        <ul className="mt-1.5 flex flex-col gap-1">
          {APPROVAL_CHECKLIST.map(line => (
            <li key={line} className="text-[11px] text-[#5A5A72] font-medium leading-snug flex gap-2">
              <span aria-hidden="true" className="text-[#8E8EA8]">&middot;</span>{line}
            </li>
          ))}
        </ul>
      </div>

      {declining && (
        <input
          value={reason} onChange={e => setReason(e.target.value)} maxLength={300}
          placeholder="Reason — the merchant is shown this word for word"
          aria-label="Decline reason"
          className="border border-red-200 bg-red-50 rounded-xl px-3 py-2 text-[13px] text-[#1A1A2E]"
        />
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() => onApprove(title.trim(), description.trim(), groupName)}
          disabled={busy || !title.trim() || !description.trim()}
          className="text-[12px] font-bold rounded-xl px-4 py-2.5 text-white disabled:opacity-50"
          style={{ background: BLUE }}
        >
          {busy ? '…' : 'Approve & add to menu'}
        </button>

        {declining ? (
          <>
            <button
              onClick={() => onDecline(reason.trim())}
              disabled={busy || !reason.trim()}
              className="text-[12px] font-bold rounded-xl px-4 py-2.5 bg-red-50 text-[#DA1212] disabled:opacity-50"
            >
              Confirm decline
            </button>
            <button onClick={() => setDeclining(false)}
                    className="text-[12px] font-bold text-[#8E8EA8] px-2">Cancel</button>
          </>
        ) : (
          <button onClick={() => setDeclining(true)} disabled={busy}
                  className="text-[12px] font-bold rounded-xl px-4 py-2.5 bg-[#EBEBF2] text-[#1A1A2E]">
            Decline
          </button>
        )}
      </div>
    </div>
  )
}

function AddMenuPerk({
  groupNames, busy, onAdd,
}: {
  groupNames: string[]
  busy: boolean
  onAdd: (groupName: string, title: string, description: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [groupName, setGroupName] = useState(groupNames[0] ?? 'Discounts')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
              className="self-start text-[12px] font-bold rounded-xl px-4 py-2.5 text-white"
              style={{ background: BLUE }}>
        Add a menu perk
      </button>
    )
  }

  return (
    <div className="bg-white rounded-2xl px-4 py-4 shadow-sm flex flex-col gap-2">
      <div className="grid sm:grid-cols-[auto_1fr_1.6fr] gap-2">
        <select value={groupName} onChange={e => setGroupName(e.target.value)} aria-label="Group"
                className="border border-[#EBEBF2] rounded-xl px-3 py-2 text-[13px]">
          {groupNames.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" maxLength={60}
               aria-label="Title"
               className="border border-[#EBEBF2] rounded-xl px-3 py-2 text-[13px]" />
        <input value={description} onChange={e => setDescription(e.target.value)}
               placeholder="The sentence a member reads" maxLength={280} aria-label="Description"
               className="border border-[#EBEBF2] rounded-xl px-3 py-2 text-[13px]" />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => { onAdd(groupName, title.trim(), description.trim()); setTitle(''); setDescription(''); setOpen(false) }}
          disabled={busy || !title.trim() || !description.trim()}
          className="text-[12px] font-bold rounded-xl px-4 py-2.5 text-white disabled:opacity-50"
          style={{ background: BLUE }}
        >
          {busy ? '…' : 'Add'}
        </button>
        <button onClick={() => setOpen(false)} className="text-[12px] font-bold text-[#8E8EA8] px-2">
          Cancel
        </button>
      </div>
    </div>
  )
}

function LivePerkRow({
  perk: p, busy, onHide, onShow,
}: {
  perk: LivePerk
  busy: boolean
  onHide: (reason: string) => void
  onShow: () => void
}) {
  const [hiding, setHiding] = useState(false)
  const [reason, setReason] = useState('')

  return (
    <div className={`bg-white rounded-2xl px-4 py-3 shadow-sm flex flex-col gap-2 ${p.hidden ? 'bg-red-50' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-[#1A1A2E]">
            {p.title}
            <span className="ml-2 text-[10px] font-bold text-[#8E8EA8]">
              {p.storeName} · {p.memberType === 'vip' ? 'VIP' : 'Starter'} slot {p.slot}
            </span>
            {!p.fromMenu && (
              <span className="ml-2 text-[10px] font-bold text-[#8E8EA8] bg-[#F5F5F8] rounded-full px-2 py-0.5">
                Pre-menu
              </span>
            )}
          </p>
          <p className="text-[12px] text-[#8E8EA8] font-medium leading-snug">{p.description}</p>
          {p.hidden && p.hiddenReason && (
            <p className="text-[11px] font-semibold text-[#DA1212] mt-1">Hidden: {p.hiddenReason}</p>
          )}
        </div>

        {p.hidden ? (
          <button onClick={onShow} disabled={busy}
                  className="shrink-0 text-[11px] font-bold rounded-xl px-3 py-2 bg-[#EBEBF2] text-[#1A1A2E] disabled:opacity-50">
            {busy ? '…' : 'Un-hide'}
          </button>
        ) : (
          <button onClick={() => setHiding(h => !h)} disabled={busy}
                  className="shrink-0 text-[11px] font-bold rounded-xl px-3 py-2 bg-red-50 text-[#DA1212] disabled:opacity-50">
            Hide
          </button>
        )}
      </div>

      {hiding && !p.hidden && (
        <div className="flex gap-2">
          <input
            value={reason} onChange={e => setReason(e.target.value)} maxLength={300}
            placeholder="Reason — shown to the merchant"
            aria-label="Hide reason"
            className="flex-1 border border-red-200 rounded-xl px-3 py-2 text-[13px]"
          />
          <button onClick={() => { onHide(reason.trim()); setHiding(false) }}
                  disabled={busy || !reason.trim()}
                  className="text-[11px] font-bold rounded-xl px-3 py-2 bg-red-50 text-[#DA1212] disabled:opacity-50">
            Confirm
          </button>
        </div>
      )}
    </div>
  )
}
