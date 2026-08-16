/**
 * Short referral codes — the /join/X7K2MP links members share.
 *
 * Distinct from members.referral_code, which is the LEGACY 8-character value
 * still embedded in links already in the wild. Both resolve; only this one is
 * generated for new links.
 */

import { randomInt } from 'node:crypto'

/**
 * 0/O and 1/I are omitted. These codes get read aloud, typed off a phone
 * screen and printed on materials, and those pairs are the ones people
 * reliably get wrong.
 */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const CODE_LENGTH = 6

/** 32^6 ≈ 1.07 billion, so collisions stay a retry rather than a design. */
export function generateReferralCode(): string {
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[randomInt(0, ALPHABET.length)]
  }
  return out
}

/** Accepts the raw path segment; case-insensitive so a typed link still works. */
export function normalizeReferralCode(raw: string): string {
  return raw.trim().toUpperCase()
}

export function isValidReferralCode(raw: string): boolean {
  const c = normalizeReferralCode(raw)
  if (c.length !== CODE_LENGTH) return false
  return [...c].every(ch => ALPHABET.includes(ch))
}

/** The canonical short link. */
export function referralUrl(code: string, appUrl = 'https://app.binperks.com'): string {
  return `${appUrl}/join/${code}`
}
