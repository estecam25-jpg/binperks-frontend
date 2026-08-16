'use client'

/**
 * BinPerks logo + alerts bell, shown at the top of member tab screens.
 *
 * The bell's dot is driven by the REAL unread count from /api/member/alerts,
 * fetched once on mount. It used to be handed a literal 1, which gave every
 * member a permanent badge for alerts that did not exist.
 *
 * The count is held here rather than inside the drawer so the dot survives the
 * drawer closing, and the drawer reports changes back up as they are made.
 *
 * The gear sits to the LEFT of the bell and is how Account is reached now that
 * it is no longer a bottom-nav tab.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import AlertsDrawer from './AlertsDrawer'

const BINPERKS_BLUE = '#4A4B98'

export default function AppHeader() {
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch('/api/member/alerts')
      .then(r => {
        if (!r.ok) return null
        // The header carries the count too, so the dot can update without
        // reading the whole list.
        const header = r.headers.get('X-Unread-Count')
        if (header !== null) return { unreadCount: Number(header) }
        return r.json()
      })
      .then(d => {
        if (!cancelled && typeof d?.unreadCount === 'number') setUnreadCount(d.unreadCount)
      })
      .catch(() => { /* no dot; the bell still opens */ })
    return () => { cancelled = true }
  }, [])

  // Stable, so the drawer's effect does not re-run on every header render.
  const handleUnreadChange = useCallback((n: number) => setUnreadCount(n), [])

  return (
    <>
      <header
        className="px-5 py-3 flex items-center justify-between sticky top-0 z-30"
        style={{ backgroundColor: BINPERKS_BLUE }}
      >
        {/* The asset is expected to be TIGHTLY CROPPED to the wordmark. The
            original export was a 1280x720 canvas with the logo filling only 41%
            of the height, which renders a ~13px-tall wordmark at this size; the
            file in public/ has had its transparent margins trimmed. If it is
            ever replaced, trim the new export too or the logo will look tiny.

            Width is left to the intrinsic aspect ratio — never set both, or the
            wordmark stretches. eslint-disable because next/image needs a width
            and this is a fixed-height mark in a sticky header. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/BinPerks_Landscape_Logo.png"
          alt="BinPerks"
          className="h-8 w-auto"
        />

        <div className="flex items-center gap-1">
        <Link
          href="/member/account"
          aria-label="Account and settings"
          className="w-9 h-9 flex items-center justify-center rounded-full active:bg-white/10 transition-colors"
        >
          <span className="text-[18px] leading-none">⚙️</span>
        </Link>

        <button
          onClick={() => setAlertsOpen(true)}
          aria-label={unreadCount > 0 ? `Alerts, ${unreadCount} unread` : 'Alerts'}
          className="relative w-9 h-9 flex items-center justify-center rounded-full active:bg-white/10 transition-colors"
        >
          <span className="text-[19px] leading-none">🔔</span>
          {unreadCount > 0 && (
            <span
              className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full border-2"
              style={{ backgroundColor: '#DA1212', borderColor: BINPERKS_BLUE }}
            />
          )}
        </button>
        </div>
      </header>

      {alertsOpen && (
        <AlertsDrawer
          onClose={() => setAlertsOpen(false)}
          onUnreadChange={handleUnreadChange}
        />
      )}
    </>
  )
}
