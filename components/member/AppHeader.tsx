'use client'

/**
 * BinPerks logo + alerts bell, shown at the top of member tab screens.
 *
 * The bell and its unread dot are placeholders — there is no alerts backend.
 * The dot is driven by a prop rather than hardcoded so Phase 2 only has to
 * pass a real count in.
 */

import { useState } from 'react'
import AlertsDrawer from './AlertsDrawer'

const BINPERKS_BLUE = '#4A4B98'

export default function AppHeader({
  unreadCount = 0,
}: {
  /** MOCK DATA — connect to real API in Phase 2. Any value > 0 shows the dot. */
  unreadCount?: number
}) {
  const [alertsOpen, setAlertsOpen] = useState(false)

  return (
    <>
      <header
        className="px-5 py-3 flex items-center justify-between sticky top-0 z-30"
        style={{ backgroundColor: BINPERKS_BLUE }}
      >
        <span className="font-['Coiny'] text-2xl text-white leading-none tracking-wide">
          BinPerks
        </span>

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
      </header>

      {alertsOpen && <AlertsDrawer onClose={() => setAlertsOpen(false)} />}
    </>
  )
}
