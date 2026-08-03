/**
 * Merchant signup funnel state.
 * sessionStorage — survives page-to-page navigation, clears on tab close.
 *
 * Keys:
 *   bp_msignup_form     — form data from Page 2
 *   bp_msignup_result   — result after successful Stripe checkout
 */

export interface MerchantSignupForm {
  // Your Info
  firstName: string
  lastName: string
  email: string
  phone: string
  website: string

  // Your Business
  companyName: string      // LLC / umbrella name e.g. "BABG LLC"

  // First Store Location
  storeName: string        // e.g. "Bin Chasers Lakeland"
  address: string
  city: string
  state: string
  zip: string
  country: string

  // Branch trigger
  locationCount: number    // 1 → Page 3A, 2+ → Page 3B

  // First store details
  binCount: number         // number of bins at the first location
}

export interface MerchantSignupResult {
  merchantId: string
  companyName: string
  storeName: string
  planAmount: number       // monthly total in dollars
  locationCount: number
  nextBillingDate: string  // ISO date string
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isBrowser() { return typeof window !== 'undefined' }

function get<T>(key: string): T | null {
  if (!isBrowser()) return null
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch { return null }
}

function set<T>(key: string, value: T): void {
  if (!isBrowser()) return
  sessionStorage.setItem(key, JSON.stringify(value))
}

export const merchantSignupForm = {
  get: () => get<MerchantSignupForm>('bp_msignup_form'),
  set: (v: MerchantSignupForm) => set('bp_msignup_form', v),
}

export const merchantSignupResult = {
  get: () => get<MerchantSignupResult>('bp_msignup_result'),
  set: (v: MerchantSignupResult) => set('bp_msignup_result', v),
}

// ── Pricing helpers (V3 — locked per brief) ───────────────────────────────
//
// Month 1:  $299.99 Implementation & Launch (first location) + $49.99 x additional
// Month 2+: $99.00  Platform Subscription   (first location) + $49.99 x additional
//
// The month 1 → month 2 transition is executed by the Stripe Subscription
// Schedule created in /api/merchant/webhook. These helpers only drive display.

export const MERCHANT_IMPLEMENTATION_PRICE = 299.99
export const MERCHANT_PLATFORM_PRICE       = 99.00
export const MERCHANT_EXTRA_LOCATION_PRICE = 49.99

function extraLocations(locationCount: number): number {
  return Math.max(0, locationCount - 1)
}

/** Month 1 — Implementation & Launch plus any additional locations. */
export function calculateFirstMonthTotal(locationCount: number): number {
  return MERCHANT_IMPLEMENTATION_PRICE + extraLocations(locationCount) * MERCHANT_EXTRA_LOCATION_PRICE
}

/** Month 2 onward — Platform Subscription plus any additional locations. */
export function calculateRecurringMonthlyTotal(locationCount: number): number {
  return MERCHANT_PLATFORM_PRICE + extraLocations(locationCount) * MERCHANT_EXTRA_LOCATION_PRICE
}

export function formatPrice(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}
