/**
 * Store bin pricing — schedule resolution and savings maths.
 *
 * Shared by the member stores API, the merchant Settings tab and the scanner,
 * so "today's price" means the same thing in all three.
 *
 * TIMEZONE MATTERS HERE. Which day it is has to be decided in the STORE's
 * timezone, not the server's and not the member's. A Vercel function runs in
 * UTC, so at 9pm Tuesday in Tampa the server already thinks it is Wednesday
 * and would publish tomorrow's price to someone standing in the shop.
 */

export const DAY_NAMES = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
] as const

export type DayName = typeof DAY_NAMES[number]

/** Weekdays in the order a merchant expects to edit them. */
export const WEEK_ORDER: DayName[] = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
]

export interface SpecialOverride {
  price: number
  label: string
  /** Inclusive YYYY-MM-DD. The override applies through the end of this day. */
  expires: string | null
}

export type PricingSchedule = Partial<Record<DayName, number | null>> & {
  special_override?: SpecialOverride | null
}

/** Stores created before this feature have no timezone set. Tampa is the
 *  founding market, so Eastern is the least surprising fallback. */
const DEFAULT_TIMEZONE = 'America/New_York'

/**
 * Today's date and weekday AS OBSERVED AT THE STORE.
 *
 * en-CA gives YYYY-MM-DD, which is directly comparable to the `expires`
 * string without any parsing or Date-object timezone games.
 */
export function storeToday(timezone: string | null | undefined): {
  isoDate: string
  day: DayName
} {
  const tz = timezone || DEFAULT_TIMEZONE
  const now = new Date()

  let isoDate: string
  let weekday: string
  try {
    isoDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now)
    weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(now)
  } catch {
    // An invalid tz string in the row should not take the page down.
    isoDate = new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_TIMEZONE }).format(now)
    weekday = new Intl.DateTimeFormat('en-US', { timeZone: DEFAULT_TIMEZONE, weekday: 'long' }).format(now)
  }

  return { isoDate, day: weekday.toLowerCase() as DayName }
}

export interface TodayPrice {
  price: number
  /** Set only for a special override, e.g. "$5 Day". */
  label: string | null
  isOverride: boolean
}

/**
 * The bin price a member would pay at this store today, or null when the
 * merchant has not published one.
 *
 * null is meaningful and distinct from 0: "no price set" must never render as
 * "free". Callers show "—" for null.
 */
export function todayPrice(
  schedule: PricingSchedule | null | undefined,
  timezone: string | null | undefined,
): TodayPrice | null {
  if (!schedule || typeof schedule !== 'object') return null

  const { isoDate, day } = storeToday(timezone)

  // An unexpired override beats the weekday price. A null `expires` means it
  // runs until the merchant removes it.
  const o = schedule.special_override
  if (o && typeof o.price === 'number' && Number.isFinite(o.price)) {
    const live = !o.expires || o.expires >= isoDate
    if (live) {
      return { price: o.price, label: o.label?.trim() || null, isOverride: true }
    }
  }

  const raw = schedule[day]
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null

  return { price: raw, label: null, isOverride: false }
}

/** Whether the store restocks today, for a "restocked today" badge. */
export function restocksToday(
  restockDays: unknown,
  timezone: string | null | undefined,
): boolean {
  if (!Array.isArray(restockDays)) return false
  const { day } = storeToday(timezone)
  return restockDays.some(d => typeof d === 'string' && d.toLowerCase() === day)
}

// ── Retail estimate parsing ──────────────────────────────────────────────────

export interface RetailRange {
  low: number
  high: number
}

/**
 * Pull a dollar range out of the model's free-text retail estimate.
 *
 * The scanner does not return numbers — it returns whatever the model wrote.
 * Real examples from live scans:
 *   "Typically $5.00 – $7.50 at Walmart"
 *   "$10.99 – $14.99 at retail"
 *   "Approximately $24.99"
 *   "$149-$179"
 *
 * Returns null when no dollar figure is present at all, which is common enough
 * that callers must handle it rather than treat it as an error. A single
 * figure yields an equal low and high.
 */
export function parseRetailRange(text: string | null | undefined): RetailRange | null {
  if (!text) return null

  // Every $-prefixed number, commas allowed. Deliberately ignores bare numbers:
  // "$5 at Walmart 24" should not read 24 as a price.
  const matches = [...text.matchAll(/\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/g)]
    .map(m => Number(m[1].replace(/,/g, '')))
    .filter(n => Number.isFinite(n))

  if (matches.length === 0) return null

  // Min/max rather than first/second: "up to $80, usually $40" is not ordered,
  // and a third figure ("$5 off") should not become the ceiling by position.
  return { low: Math.min(...matches), high: Math.max(...matches) }
}

export interface Savings {
  low: number
  high: number
  /** True when the bin price is at or above the whole retail estimate. */
  exceedsRetail: boolean
}

/**
 * Estimated savings against a bin price.
 *
 * Clamped at zero: a negative "saving" is not a saving, and showing "-$3"
 * would read as a charge. When the bin price meets or beats the top of the
 * retail range, exceedsRetail tells the caller to say so in words instead.
 */
export function computeSavings(retail: RetailRange, binPrice: number): Savings {
  const low = retail.low - binPrice
  const high = retail.high - binPrice
  return {
    low: Math.max(0, low),
    high: Math.max(0, high),
    exceedsRetail: high <= 0,
  }
}

/** "$8" for whole dollars, "$8.50" otherwise — merchants set both. */
export function formatPrice(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`
}
