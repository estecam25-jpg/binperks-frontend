/**
 * Cashier PIN strength.
 *
 * A cashier PIN authorises stamps, and a stamp is worth money to the member and
 * to the merchant's settlement. The four digits are typed in the open at a
 * counter, so the guessable ones are genuinely guessable.
 *
 * Shared by the form and the API deliberately: the form gives immediate
 * feedback, the API is what actually enforces it, and one list means the two
 * cannot disagree about which PINs are refused.
 */

export const BLOCKED_PINS: readonly string[] = [
  // Sequential
  '0123', '1234', '2345', '3456', '4567', '5678', '6789', '7890',
  // Reverse sequential
  '9876', '8765', '7654', '6543', '5432', '4321', '3210',
  // Repeated
  '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
  // Common patterns
  '1212', '1122', '1010', '2580', '1357', '2468', '1313',
]

/** The single message both layers show, so the wording never drifts. */
export const WEAK_PIN_MESSAGE =
  'This PIN is too easy to guess. Please choose a more unique 4-digit PIN.'

export function isFourDigits(pin: string): boolean {
  return /^\d{4}$/.test(pin)
}

/** True when the PIN is on the blocklist. Assumes 4 digits — check that first. */
export function isWeakPin(pin: string): boolean {
  return BLOCKED_PINS.includes(pin)
}

/**
 * Full check. Returns null when the PIN is acceptable, or the message to show.
 * Format and strength are separate messages: "must be 4 digits" and "too easy
 * to guess" are different problems and telling someone the wrong one is worse
 * than saying nothing.
 */
export function validatePin(pin: string): string | null {
  if (!isFourDigits(pin)) return 'PIN must be exactly 4 digits'
  if (isWeakPin(pin)) return WEAK_PIN_MESSAGE
  return null
}
