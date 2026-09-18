/**
 * How a member arrived at the join funnel — the last segment of a join URL.
 *
 *   app.binperks.com/join/FL-Tampa-EstaBins
 *     the social / printed link. Nothing special happens; the member signs up
 *     and earns their first stamp on their next visit to the register.
 *
 *   app.binperks.com/join/FL-Tampa-EstaBins/in-store_at-the_register
 *     the QR code that lives AT the register. Someone scanning it is standing
 *     in the store right now, so completing signup awards the visit stamp for
 *     that day on the spot — see /api/join/create.
 *
 * WHY A REGISTRY RATHER THAN A STRING COMPARISON IN FIVE PLACES: the value is
 * printed on physical QR codes and cannot be changed once they are on a
 * counter, and the stamp it grants is real money. One constant, imported by the
 * route, the landing page, the signup step and the API, is what keeps a typo
 * from silently turning the stamp off.
 *
 * UNKNOWN SOURCES ARE NOT ERRORS. A mistyped or retired source resolves to null
 * and the member sees the ordinary join landing page — a dead 404 on a QR code
 * already stuck to a register would cost a real signup.
 */

/** The QR code at the register. Awards one stamp on first-time signup. */
export const JOIN_SOURCE_REGISTER = 'in-store_at-the_register'

export type JoinSource = typeof JOIN_SOURCE_REGISTER

const KNOWN_SOURCES: readonly string[] = [JOIN_SOURCE_REGISTER]

/** The source a URL segment names, or null if it names none. */
export function resolveJoinSource(raw: string | null | undefined): JoinSource | null {
  if (!raw) return null
  const value = decodeURIComponent(raw).toLowerCase()
  return KNOWN_SOURCES.includes(value) ? (value as JoinSource) : null
}

/**
 * Whether this source awards the signup stamp.
 *
 * Its own function rather than `=== JOIN_SOURCE_REGISTER` at each call site: if
 * a second in-store QR is ever added, the stamp rule changes here once instead
 * of in every place that had quietly hardcoded the register.
 */
export function awardsSignupStamp(source: JoinSource | null): boolean {
  return source === JOIN_SOURCE_REGISTER
}
