/**
 * Add-to-home-screen helpers.
 *
 * Shared by the dashboard banner and the "Get the App" section in settings, so
 * the two can never disagree about what platform a member is on or whether the
 * app is already installed.
 *
 * Every function here touches window/navigator, so callers MUST only run them
 * after mount. Calling during render would either throw on the server or
 * produce markup that disagrees with the client and trips hydration.
 */

/** localStorage key. Once set, the dashboard banner never returns. */
export const PWA_DISMISSED_KEY = 'binperks_pwa_dismissed'

/**
 * Which surface the banner is on.
 *
 * Each gets its own dismissal key, so a cashier dismissing it on the stamp
 * tool does not also silence it for a member on their dashboard — these are
 * different people on different devices wanting different apps installed.
 * 'member' keeps the original key so anyone who already dismissed it stays
 * dismissed.
 */
export type PwaSurface = 'member' | 'stamptool' | 'merchant' | 'admin'

function keyFor(surface: PwaSurface): string {
  return surface === 'member' ? PWA_DISMISSED_KEY : `${PWA_DISMISSED_KEY}_${surface}`
}

export type Platform = 'ios' | 'android' | 'other'

/**
 * Which set of install instructions applies.
 *
 * 'other' is desktop and anything unrecognised. Add to Home Screen is a mobile
 * gesture, so callers should treat it as "no instructions worth showing"
 * rather than guessing between Safari and Chrome.
 */
export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent

  // iPadOS 13+ reports itself as a Mac. The touch-point count is what
  // separates a real desktop Safari from an iPad pretending to be one.
  const isIpadOS =
    /Macintosh/.test(ua) &&
    typeof navigator.maxTouchPoints === 'number' &&
    navigator.maxTouchPoints > 1

  if (/iPad|iPhone|iPod/.test(ua) || isIpadOS) return 'ios'

  // Checked after iOS: some in-app browsers put both strings in the UA.
  if (/Android/.test(ua)) return 'android'

  return 'other'
}

/**
 * True when the page is already running as an installed app.
 *
 * Two checks because neither covers everything: display-mode is the standard
 * and works on Android and modern iOS, while navigator.standalone is a
 * non-standard iOS property that older iOS Safari relies on. Prompting someone
 * who already installed the app is the failure worth avoiding here.
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false

  if (window.matchMedia?.('(display-mode: standalone)').matches) return true

  // iOS-only legacy flag, absent from the Navigator type.
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone
  return iosStandalone === true
}

/** Whether the member has already dismissed the banner. Treats a blocked or
 *  unavailable localStorage (private mode, embedded webview) as "not
 *  dismissed" — showing the banner beats throwing on the dashboard. */
export function isPwaBannerDismissed(surface: PwaSurface = 'member'): boolean {
  try {
    return window.localStorage.getItem(keyFor(surface)) === 'true'
  } catch {
    return false
  }
}

/** Records the dismissal. Silently does nothing if storage is unavailable, in
 *  which case the banner reappears next visit — an annoyance, not a bug. */
export function dismissPwaBanner(surface: PwaSurface = 'member'): void {
  try {
    window.localStorage.setItem(keyFor(surface), 'true')
  } catch {
    /* storage unavailable — nothing to persist to */
  }
}

/** One-line hint for the dashboard banner. */
export const INSTALL_HINT: Record<Exclude<Platform, 'other'>, string> = {
  ios:     'Tap Share → Add to Home Screen in Safari',
  android: 'Tap the menu → Add to Home Screen in Chrome',
}

/** Numbered steps for the settings reference section. */
export const INSTALL_STEPS: Record<Exclude<Platform, 'other'>, {
  label: string
  icon: string
  steps: string[]
}> = {
  ios: {
    label: 'iPhone',
    icon: '',
    steps: [
      'Open app.binperks.com in Safari',
      'Tap the Share button',
      'Tap "Add to Home Screen"',
      'Tap Add',
    ],
  },
  android: {
    label: 'Android',
    icon: '🤖',
    steps: [
      'Open app.binperks.com in Chrome',
      'Tap the menu (⋮)',
      'Tap "Add to Home Screen"',
      'Tap Add',
    ],
  },
}
