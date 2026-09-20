/**
 * Cashier phone numbers — internal to the merchant, and nowhere else.
 *
 * WHAT THIS IS FOR. A stamp records which cashier awarded it, so when a stamp
 * needs explaining the merchant needs a way to reach the person who gave it.
 * That is the whole purpose: it is a contact detail for the shop owner.
 *
 * WHERE IT MUST NOT GO. Never to GHL, never to any CRM, never onto a member
 * screen. Cashiers do not have BinPerks accounts (Merchant Agreement §6.6) and
 * are not members, so this number is not a marketing address and no consent
 * was given for it to be treated as one. The cashier routes fire no webhooks
 * for exactly this reason — check before adding one.
 *
 * SHARED BY THE FORM AND THE API, the same arrangement lib/pin-strength uses,
 * so the two layers cannot disagree about what is acceptable. The form is
 * convenience; the API is the enforcement, since a direct POST skips the form.
 *
 * OPTIONAL, and deliberately lenient. A blank is valid and stores null. Beyond
 * that this checks only that what was typed could plausibly be a phone number —
 * a merchant noting a number for their own use should not be argued with about
 * its shape.
 */

/** Digits only. What gets stored, so two merchants typing the same number in
 *  different styles store the same thing. */
export function normalizeStaffPhone(raw: string): string {
  return raw.replace(/\D/g, '')
}

/**
 * The reason this number is not acceptable, or null when it is.
 *
 * Blank is acceptable — the field is optional, and an empty string means "no
 * number", not "bad number".
 */
export function validateStaffPhone(raw: string): string | null {
  const digits = normalizeStaffPhone(raw)
  if (digits.length === 0) return null
  // 10 for a US number, 11 with the leading country code. Anything shorter is
  // a typo and anything longer is not a number this business will dial.
  if (digits.length < 10 || digits.length > 11) {
    return 'Enter a 10-digit phone number, or leave it blank.'
  }
  return null
}

/** (813) 555-0134 — for display only; storage stays digits. Returned
 *  unchanged when it is not a shape this knows how to format. */
export function formatStaffPhone(digits: string): string {
  const d = normalizeStaffPhone(digits)
  const local = d.length === 11 && d.startsWith('1') ? d.slice(1) : d
  if (local.length !== 10) return digits
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`
}
