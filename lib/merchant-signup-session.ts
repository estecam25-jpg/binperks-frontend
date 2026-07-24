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

// ── Pricing helpers (locked per brief) ────────────────────────────────────

export const MERCHANT_BASE_PRICE = 299.99
export const MERCHANT_EXTRA_LOCATION_PRICE = 79.99

export function calculateMonthlyTotal(locationCount: number): number {
  if (locationCount <= 1) return MERCHANT_BASE_PRICE
  return MERCHANT_BASE_PRICE + (locationCount - 1) * MERCHANT_EXTRA_LOCATION_PRICE
}

export function formatPrice(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}
