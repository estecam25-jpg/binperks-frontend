'use client'

/**
 * Alerts drawer.
 *
 * Reads /api/member/alerts. Opening the drawer does NOT mark everything read —
 * a member who glances at the sheet and closes it has not necessarily taken
 * anything in. An alert is marked read when they tap it, or all at once when
 * they ask for that explicitly.
 *
 * The unread count is lifted to the caller via onUnreadChange so the bell's dot
 * updates from the same response that changed it, rather than refetching.
 */

import { useCallback, useEffect, useState } from 'react'
import { alertGlyph } from '@/lib/member-alerts'

const BINPERKS_BLUE = '#4A4B98'

interface Alert {
  id: string
  type: string
  title: string
  body: string
  read: boolean
  createdAt: string
}

/** "2h ago", "3d ago" — an exact timestamp is noise on a notification. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const mins = Math.floor((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(then).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function AlertsDrawer({
  onClose,
  onUnreadChange,
}: {
  onClose: () => void
  /** Called whenever the server tells us the new unread count. */
  onUnreadChange?: (count: number) => void
}) {
  const [alerts, setAlerts] = useState<Alert[]>([])
  // Derived, so nothing calls setState in the effect body.
  const [loaded, setLoaded] = useState(false)

  // Escape to close, and don't let the page behind scroll under the sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    fetch('/api/member/alerts')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled) return
        setAlerts(d?.alerts ?? [])
        if (typeof d?.unreadCount === 'number') onUnreadChange?.(d.unreadCount)
        setLoaded(true)
      })
      .catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
    // onUnreadChange is a stable callback from the header; re-running on it
    // would refetch the list on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const markRead = useCallback(async (body: { alert_id?: string; all?: boolean }) => {
    // Optimistic — tapping an alert should dim it immediately.
    setAlerts(prev => prev.map(a =>
      body.all || a.id === body.alert_id ? { ...a, read: true } : a,
    ))
    try {
      const res = await fetch('/api/member/alerts/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const d = await res.json()
        if (typeof d?.unreadCount === 'number') onUnreadChange?.(d.unreadCount)
      }
    } catch {
      // The alert stays visibly read for this session. Re-opening reloads the
      // true state; nothing is lost either way.
    }
  }, [onUnreadChange])

  const unread = alerts.filter(a => !a.read).length

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        aria-label="Close alerts"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />

      <div
        role="dialog"
        aria-label="Alerts"
        className="relative bg-white rounded-t-3xl px-5 pt-5 pb-8 max-w-md w-full mx-auto shadow-2xl max-h-[80dvh] flex flex-col"
      >
        <div className="w-10 h-1 rounded-full bg-[#EBEBF2] mx-auto mb-4 flex-shrink-0" />

        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">Alerts</h2>
          <div className="flex items-center gap-3">
            {unread > 0 && (
              <button
                onClick={() => markRead({ all: true })}
                className="text-[12px] font-bold"
                style={{ color: BINPERKS_BLUE }}
              >
                Mark all as read
              </button>
            )}
            <button
              onClick={onClose}
              className="text-[13px] font-bold text-[#8E8EA8] px-2 py-1"
            >
              Close
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex flex-col gap-2">
          {!loaded ? (
            [0, 1, 2].map(i => <div key={i} className="h-16 rounded-2xl bg-[#F5F5F8] animate-pulse" />)
          ) : alerts.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-[14px] font-semibold text-[#8E8EA8]">
                No alerts yet. Check back soon.
              </p>
            </div>
          ) : (
            alerts.map(a => (
              <button
                key={a.id}
                onClick={() => { if (!a.read) markRead({ alert_id: a.id }) }}
                className="w-full text-left rounded-2xl px-4 py-3 flex items-start gap-3 transition-colors"
                style={{ backgroundColor: a.read ? '#FAFAFC' : `${BINPERKS_BLUE}0D` }}
              >
                <span className="text-[20px] leading-none mt-0.5 flex-shrink-0">
                  {alertGlyph(a.type)}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className={`text-[14px] ${a.read ? 'font-semibold text-[#8E8EA8]' : 'font-extrabold text-[#1A1A2E]'}`}>
                      {a.title}
                    </span>
                    {!a.read && (
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: '#DA1212' }}
                        aria-label="Unread"
                      />
                    )}
                  </span>
                  <span className={`block text-[12px] mt-0.5 leading-relaxed ${a.read ? 'text-[#B0B0C8]' : 'text-[#8E8EA8]'}`}>
                    {a.body}
                  </span>
                  <span className="block text-[10px] font-medium text-[#B0B0C8] mt-1">
                    {relativeTime(a.createdAt)}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
