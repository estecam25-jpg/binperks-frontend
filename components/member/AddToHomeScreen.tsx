'use client'

/**
 * Dismissable "Add to Home Screen" banner for the member dashboard.
 *
 * Shows once per device until dismissed, then never again — the dismissal is
 * a localStorage flag, so it is per-browser rather than per-account. A member
 * who dismisses it on their phone will see it again on a different device,
 * which is the right behaviour: the prompt is about installing on THIS device.
 *
 * Hidden when the app is already installed, and on desktop, where "Add to
 * Home Screen" is not a gesture that exists — see lib/pwa.
 */

import { useEffect, useState } from 'react'
import {
  detectPlatform,
  isStandalone,
  isPwaBannerDismissed,
  dismissPwaBanner,
  INSTALL_HINT,
  type Platform,
} from '@/lib/pwa'

const BINPERKS_BLUE = '#4A4B98'

export default function AddToHomeScreen() {
  // Starts hidden and is only ever turned on from inside an effect. Every
  // input to the decision — user agent, display-mode, localStorage — is
  // browser-only, so deciding during render would mismatch the server HTML
  // and trip hydration.
  //
  // 'other' is excluded from the type rather than filtered at render: the
  // banner has no copy for desktop, so a non-null value here always means
  // there is a hint to show.
  const [platform, setPlatform] = useState<Exclude<Platform, 'other'> | null>(null)

  useEffect(() => {
    if (isStandalone()) return          // already installed
    if (isPwaBannerDismissed()) return  // member said no once already

    const p = detectPlatform()
    if (p === 'other') return           // no honest instructions to give

    setPlatform(p)
  }, [])

  if (!platform) return null

  function handleDismiss() {
    dismissPwaBanner()
    setPlatform(null)
  }

  return (
    <div
      className="w-full rounded-2xl px-4 py-3.5 flex items-start gap-3 shadow-sm"
      style={{ backgroundColor: BINPERKS_BLUE }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-white leading-snug">
          📱 Add BinPerks to your home screen for faster access
        </p>
        <p className="text-[11px] font-medium text-white/70 mt-1 leading-snug">
          {INSTALL_HINT[platform]}
        </p>
      </div>

      {/* 32px hit area — a 12px glyph alone is too small to tap reliably. */}
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="flex-shrink-0 -mr-1 -mt-0.5 w-8 h-8 flex items-center justify-center rounded-full text-white/60 active:bg-white/10 active:text-white transition-colors"
      >
        <span className="text-[15px] leading-none">✕</span>
      </button>
    </div>
  )
}
