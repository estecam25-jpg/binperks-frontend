'use client'

/**
 * Alerts drawer — placeholder.
 *
 * MOCK DATA — connect to real API in Phase 2. There is no alerts table yet, so
 * this always renders the empty state. The sheet, backdrop and dismissal are
 * real, so Phase 2 only has to map a list into the body.
 */

import { useEffect } from 'react'

export default function AlertsDrawer({ onClose }: { onClose: () => void }) {
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
        className="relative bg-white rounded-t-3xl px-5 pt-5 pb-8 max-w-md w-full mx-auto shadow-2xl"
      >
        <div className="w-10 h-1 rounded-full bg-[#EBEBF2] mx-auto mb-4" />

        <div className="flex items-center justify-between mb-5">
          <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">Alerts</h2>
          <button
            onClick={onClose}
            className="text-[13px] font-bold text-[#8E8EA8] px-2 py-1"
          >
            Close
          </button>
        </div>

        <div className="py-10 flex flex-col items-center text-center gap-2">
          <span className="text-3xl">🔔</span>
          <p className="text-[14px] font-semibold text-[#8E8EA8]">
            No alerts yet. Check back soon.
          </p>
        </div>
      </div>
    </div>
  )
}
