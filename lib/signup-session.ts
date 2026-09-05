/**
 * Member signup funnel state.
 * Uses sessionStorage so state survives page-to-page navigation within the funnel
 * but clears when the tab closes.
 *
 * Keys:
 *   bp_signup_store    — store branding resolved from [storeKey]
 *   bp_signup_ref      — referral code from URL (?ref=xxx)
 *   bp_signup_form     — form data from Page 2 (preserved if user navigates back)
 *   bp_signup_member   — created member record (set after Page 2 submit)
 */

/**
 * What the join funnel carries between its steps.
 *
 * FUNCTIONAL FIELDS ONLY, deliberately. This used to carry storeName,
 * brandName, brandColor and logoUrl, and every page that could reach for them
 * eventually did — the signup header, the VIP card, the thank-you page. The
 * join flow is a BinPerks experience: the store key sets Origin Store
 * attribution and feeds the VIP checkout, and that is the whole of its job.
 *
 * Removing the fields rather than the usages is the point. A page cannot paint
 * itself in a store's colour if the colour is not in the type.
 *
 *   id          origin_store_id on the new member record
 *   storeKey    canonical_key, for building funnel URLs
 *   merchantId  passed to /api/join/vip for the Stripe checkout
 */
export interface SignupStore {
  id: string
  storeKey: string       // e.g. 'FL-Lakeland-BinChasers' (canonical_key)
  merchantId: string
}

export interface SignupRef {
  code: string                   // referral_code value
  referrerMemberId: string
  referrerFirstName: string      // shown on landing banner
}

export interface SignupFormData {
  firstName: string
  lastName: string
  phone: string          // digits only
  email: string
  /** 5 digits. Optional on the type so a draft saved before this field
   *  existed still restores instead of failing to parse. */
  zip?: string
  smsOptIn: boolean
}

export interface SignupMember {
  id: string
  referralCode: string
  referralUrl: string
  subscriptionStatus: 'free' | 'vip'
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

// ── Exports ────────────────────────────────────────────────────────────────

export const signupStore = {
  get: () => get<SignupStore>('bp_signup_store'),
  set: (v: SignupStore) => set('bp_signup_store', v),
}

export const signupRef = {
  get: () => get<SignupRef>('bp_signup_ref'),
  set: (v: SignupRef) => set('bp_signup_ref', v),
  clear: () => { if (isBrowser()) sessionStorage.removeItem('bp_signup_ref') },
}

export const signupForm = {
  get: () => get<SignupFormData>('bp_signup_form'),
  set: (v: SignupFormData) => set('bp_signup_form', v),
}

export const signupMember = {
  get: () => get<SignupMember>('bp_signup_member'),
  set: (v: SignupMember) => set('bp_signup_member', v),
}
