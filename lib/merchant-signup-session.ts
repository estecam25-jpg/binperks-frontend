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

/**
 * The one-time setup fee charged on the first invoice, matching what checkout
 * actually bills (see lib/merchant-checkout) and Section 7.1 of the Merchant
 * Agreement: $200.00 once, plus the recurring monthly price from month one.
 *
 * MERCHANT_IMPLEMENTATION_PRICE below is the OLDER month-one model, where a
 * single $299.99 charge replaced the first month's platform fee. It is kept
 * because the signup landing and plan pages still display it; those pages are
 * not yet updated to the setup-fee model.
 */
export const MERCHANT_SETUP_FEE = 200.00

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
