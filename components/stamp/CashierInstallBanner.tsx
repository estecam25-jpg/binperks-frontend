'use client'

/**
 * "Install the Cashier App" — the install prompt on the stamp tool store page.
 *
 * Deliberately separate from components/member/AddToHomeScreen. This one is
 * bigger (a cashier should notice it on the first shift, not the tenth), has
 * its own dismissal key, and has one job that banner never had to do: make
 * sure the app that gets installed is the CASHIER app.
 *
 * WHICH APP GETS INSTALLED DEPENDS ON THE ORIGIN, not on this page. On
 * app.binperks.com the manifest is the member app's, so "Add to Home Screen"
 * there puts a BinPerks member icon on the till tablet that opens the member
 * home page. Cashiers still reach this page on app.binperks.com (bookmarks,
 * printed materials), so on that host the banner sends them to
 * stamptool.binperks.com instead of giving install steps that would install
 * the wrong thing.
 *
 * HIDDEN: when already running installed, once dismissed on this device, and
 * on desktop, where Add to Home Screen is not a gesture that exists.
 */

import { useEffect, useState, useSyncExternalStore } from 'react'
import { detectPlatform, isStandalone, CASHIER_PWA_DISMISSED_KEY } from '@/lib/pwa'
import { STAMPTOOL_HOSTS, STAMPTOOL_ORIGIN } from '@/lib/pwa-manifest'

const BLUE = '#4A4B98'

/** Chromium's install event. Not in the DOM lib typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type View = 'hidden' | 'ios' | 'android' | 'go-to-cashier-host'

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(CASHIER_PWA_DISMISSED_KEY) === 'true'
  } catch {
    return false   // storage blocked — showing the banner beats throwing
  }
}

/**
 * What to show, as a primitive so useSyncExternalStore can compare snapshots
 * by value. Every input is browser-only; the server snapshot is 'hidden', so
 * the server HTML and the first client render always agree.
 */
function readView(): View {
  if (isStandalone() || readDismissed()) return 'hidden'

  const platform = detectPlatform()
  if (platform === 'other') return 'hidden'

  // Only the main production host is redirected. localhost and preview hosts
  // get the normal steps so the banner can still be exercised while testing.
  if (window.location.hostname === 'app.binperks.com') return 'go-to-cashier-host'

  return platform
}

function subscribe(onChange: () => void): () => void {
  // Installing flips display-mode to standalone; re-read when it does.
  const media = window.matchMedia?.('(display-mode: standalone)')
  media?.addEventListener?.('change', onChange)
  window.addEventListener('appinstalled', onChange)
  return () => {
    media?.removeEventListener?.('change', onChange)
    window.removeEventListener('appinstalled', onChange)
  }
}

export default function CashierInstallBanner({ storeKey }: { storeKey: string }) {
  const view = useSyncExternalStore(subscribe, readView, () => 'hidden' as View)

  // Set from the click handler, so the banner disappears immediately even
  // though localStorage writes do not notify the store above.
  const [dismissed, setDismissed] = useState(false)

  // Chrome's own install prompt, kept so an Install button can reopen it.
  // Deliberately NOT preventDefault()ed: that would suppress Chrome's automatic
  // prompt, and the Android copy promises Chrome will prompt by itself.
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const onPrompt = (e: Event) => setInstallEvent(e as BeforeInstallPromptEvent)
    const onInstalled = () => setInstallEvent(null)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (view === 'hidden' || dismissed) return null

  function dismiss() {
    try {
      window.localStorage.setItem(CASHIER_PWA_DISMISSED_KEY, 'true')
    } catch {
      /* storage unavailable — it will reappear next visit, which is harmless */
    }
    setDismissed(true)
  }

  async function install() {
    if (!installEvent) return
    await installEvent.prompt()
    setInstallEvent(null)   // an event can only be prompted once
  }

  const onCashierHost = typeof window !== 'undefined' && STAMPTOOL_HOSTS.has(window.location.hostname)

  return (
    <section
      aria-label="Install the Cashier App"
      className="w-full rounded-2xl p-5 shadow-md flex flex-col gap-3.5"
      style={{ backgroundColor: BLUE }}
    >
      <div className="flex items-start gap-3.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon-192.png"
          alt=""
          width={48}
          height={48}
          className="w-12 h-12 rounded-xl bg-white flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <h2 className="text-[17px] font-extrabold text-white leading-tight">
            Install the Cashier App
          </h2>
          <p className="text-[13px] font-medium text-white/85 mt-1 leading-snug">
            Add BinPerks Cashier to your home screen for quick access during your shift.
          </p>
        </div>

        {/* 36px hit area — the glyph alone is too small to tap reliably. */}
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="flex-shrink-0 -mr-2 -mt-2 w-9 h-9 flex items-center justify-center rounded-full text-white/70 active:bg-white/10 active:text-white transition-colors"
        >
          <span className="text-[16px] leading-none">✕</span>
        </button>
      </div>

      {view === 'go-to-cashier-host' && (
        <>
          <a
            href={`${STAMPTOOL_ORIGIN}/stamptool/${encodeURIComponent(storeKey)}`}
            className="w-full py-3 rounded-xl bg-white text-center text-[14px] font-bold active:opacity-90"
            style={{ color: BLUE }}
          >
            Open stamptool.binperks.com
          </a>
          <p className="text-[11px] font-medium text-white/70 leading-snug">
            Install it from there — adding this page to your home screen would install the
            member app instead.
          </p>
        </>
      )}

      {view === 'ios' && (
        <p className="rounded-xl bg-white/10 px-3.5 py-2.5 text-[13px] font-semibold text-white leading-snug">
          In Safari, tap <span className="font-extrabold">Share</span> (or{' '}
          <span className="font-extrabold">•••</span> → Share on newer iPhones), then{' '}
          <span className="font-extrabold">Add to Home Screen</span>.
        </p>
      )}

      {view === 'android' && (
        installEvent ? (
          <button
            onClick={install}
            className="w-full py-3 rounded-xl bg-white text-[14px] font-bold active:opacity-90"
            style={{ color: BLUE }}
          >
            Install
          </button>
        ) : (
          <p className="rounded-xl bg-white/10 px-3.5 py-2.5 text-[13px] font-semibold text-white leading-snug">
            Chrome will prompt you to install automatically. If it doesn&apos;t, tap{' '}
            <span className="font-extrabold">⋮</span> →{' '}
            <span className="font-extrabold">Add to Home screen</span>.
          </p>
        )
      )}

      {/* Visible only off the cashier origin while testing (localhost/preview),
          where the installed app would still be the member manifest. */}
      {!onCashierHost && view !== 'go-to-cashier-host' && (
        <p className="text-[10px] font-medium text-white/50">
          Install from stamptool.binperks.com to get the Cashier app.
        </p>
      )}
    </section>
  )
}
