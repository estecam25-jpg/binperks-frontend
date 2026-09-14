/**
 * Store-specific stamp tool URLs, and the cashier's remembered store.
 *
 * DIRECT STORE URLS. On stamptool.binperks.com a store's own page lives at
 * /<canonical_key> — e.g. stamptool.binperks.com/FL-LakeWales-BinChasersLakeWales
 * — so a merchant can print it as a QR code and a cashier can bookmark it.
 * middleware.ts rewrites that to /stamptool/<canonical_key>.
 *
 * WHY A SHAPE CHECK rather than "any single-segment path": the subdomain still
 * serves the rest of the app (/manifest.webmanifest, /terms, /api, …) and those
 * must not turn into "Store not found". canonical_key is STATE-City-StoreName
 * with the state code in capitals (lib: /api/merchant/apply), while every
 * top-level route in app/ is lowercase — so the two cannot collide.
 *
 * REMEMBERED STORE. localStorage, per device: the till tablet is the thing
 * that belongs to a store, not the cashier. Per-origin too, so the installed
 * Cashier app remembers its own last store (on iOS a home-screen app does not
 * share Safari's storage at all).
 */

/** localStorage key holding the canonical_key of the last store opened. */
export const CASHIER_LAST_STORE_KEY = 'cashier-last-store'

const STORE_KEY_SHAPE = /^[A-Z]{2,}-[^/]+$/

/** Whether a value has the shape of a canonical_key (not whether that store exists). */
export function isStoreKeyShape(value: string): boolean {
  return STORE_KEY_SHAPE.test(value)
}

/** The store key in a single-segment path like "/FL-Tampa-EstaBins", or null. */
export function storeKeyFromPath(pathname: string): string | null {
  const segment = pathname.startsWith('/') ? pathname.slice(1) : pathname
  return segment && isStoreKeyShape(segment) ? segment : null
}

// All three touch localStorage, so call them only in the browser (effects,
// handlers). Blocked storage (private mode, embedded webviews) degrades to
// "nothing remembered" rather than throwing on the stamp tool.

export function readLastStore(): string | null {
  try {
    return window.localStorage.getItem(CASHIER_LAST_STORE_KEY)
  } catch {
    return null
  }
}

export function saveLastStore(storeKey: string): void {
  try {
    window.localStorage.setItem(CASHIER_LAST_STORE_KEY, storeKey)
  } catch {
    /* storage unavailable — the store just isn't remembered on this device */
  }
}

export function clearLastStore(): void {
  try {
    window.localStorage.removeItem(CASHIER_LAST_STORE_KEY)
  } catch {
    /* nothing stored to clear */
  }
}
