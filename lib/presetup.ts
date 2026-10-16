/**
 * Pre-setup stores — merchants an admin creates before visiting them.
 *
 * WHY THEY EXIST AS REAL ROWS. Esteban sets a handful of local stores up at
 * his desk, prints their materials, then walks in with the posters already
 * made. For the QR codes on those posters to be the real ones, the store row —
 * and therefore its canonical_key — has to exist before anyone has paid. So a
 * pre-setup merchant is a genuine merchant and store, parked in a status that
 * is inert everywhere it matters.
 *
 * ── WHAT 'presetup' SWITCHES OFF ───────────────────────────────────────────
 * The status is deliberately a value nothing else already looks for, so every
 * existing filter excludes it by simply not mentioning it:
 *
 *   stamping            lib/merchant-status CAN_STAMP omits it
 *   member Stores tab   stores.is_active / network_visible are false
 *   public store list   the same two flags
 *   origin transfer     follows canAwardStamps
 *   commission          commission_eligible false, never flipped until signing
 *   settlement          no ledger rows can exist without stamps
 *   network stats       /api/admin/stats counts billing_status = 'active'
 *   inactivity cron     only ever reads billing_status = 'grace_period'
 *   admin Merchants tab filtered out explicitly — see /api/admin/merchants
 *
 * The one thing it does NOT switch off is the join link. That is the point:
 * the QR on the poster resolves, and enrollment_enabled false is what stops a
 * member actually joining before the store is live.
 *
 * ── THE ORGANIC FLOW IS UNTOUCHED ──────────────────────────────────────────
 * Nothing here runs unless a merchant row is already in 'presetup'. The normal
 * signup still writes nothing before payment, still carries its form in Stripe
 * metadata, and still creates its own merchant. The only seam is
 * `PRESETUP_MERCHANT_ID_KEY` in checkout metadata, which the organic path never
 * sets — see createMerchantAfterPayment.
 */

import { randomBytes } from 'node:crypto'

/** billing_status for a merchant an admin has set up but nobody has paid for. */
export const PRESETUP = 'presetup'

/**
 * Checkout metadata key naming the pre-setup merchant to adopt.
 *
 * Its presence is the ONLY thing that makes a checkout a finish-setup rather
 * than an organic signup, so it is defined once and never spelled by hand.
 */
export const PRESETUP_MERCHANT_ID_KEY = 'presetupMerchantId'

/** 32 hex characters from the CSPRNG. The link is the only credential on the
 *  finish-setup page, so it has to be unguessable rather than merely unique. */
export function newPresetupToken(): string {
  return randomBytes(16).toString('hex')
}

/** Shape of a token that could possibly be real. Anything else is rejected
 *  before it reaches the database. */
export function isPresetupToken(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{32}$/.test(value)
}

/** The link Esteban opens on his phone at the visit. */
export function finishSetupPath(token: string): string {
  return `/merchant/finish-setup/${token}`
}

export function finishSetupUrl(token: string, origin?: string): string {
  const base = (origin || process.env.NEXT_PUBLIC_APP_URL || 'https://app.binperks.com').replace(/\/$/, '')
  return `${base}${finishSetupPath(token)}`
}

/**
 * STATE-City-StoreName, no spaces — the /join/[storeKey] slug.
 *
 * Deliberately identical to canonicalKeyFor in lib/merchant-onboarding: a
 * pre-set-up store must end up with exactly the key it would have had if the
 * owner had signed up themselves, or the printed QR would stop working the
 * moment anything re-derived it.
 */
export function presetupCanonicalKey(
  input: { state: string; city: string; storeName: string },
): string {
  return [
    input.state.toUpperCase(),
    input.city.replace(/\s+/g, ''),
    input.storeName.replace(/\s+/g, ''),
  ].join('-')
}

/** The pre-setup form, as the admin tab sends it and the create route stores it. */
export interface PresetupInput {
  companyName: string
  brandName: string
  ownerName: string
  ownerEmail: string
  ownerPhone: string
  storeName: string
  address: string
  city: string
  state: string
  zip: string
  locationCount: number
}

/** Validation shared by the create route. Returns the first problem, or null. */
export function validatePresetup(input: Partial<PresetupInput>): string | null {
  const need: (keyof PresetupInput)[] = ['companyName', 'ownerName', 'ownerEmail', 'storeName', 'city', 'state']
  for (const k of need) {
    if (!String(input[k] ?? '').trim()) return `${k} is required`
  }
  const email = String(input.ownerEmail).trim()
  if (!email.includes('@') || /\s/.test(email)) return 'ownerEmail is not a valid email address'
  if (String(input.state).trim().length !== 2) return 'state must be the two-letter code'
  const count = Number(input.locationCount ?? 1)
  if (!Number.isFinite(count) || count < 1 || count > 50) return 'locationCount must be between 1 and 50'
  return null
}
