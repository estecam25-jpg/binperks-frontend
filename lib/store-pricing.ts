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

/**
 * One day in the weekly schedule.
 *
 * A day can be in three states, and they are NOT interchangeable:
 *   { price: 7 }        open at $7
 *   null                CLOSED — the merchant said so
 *   key absent          no price published yet
 *
 * Closed used to be expressed as a $0 price, which was ambiguous: $0 is also a
 * legitimate free-bin day. They are separate states now.
 */
export interface DaySchedule {
  price: number
  restock: boolean
}

/**
 * LEGACY shape, still read: prices were bare numbers and restock days lived in
 * a separate stores.restock_days array. Rows were migrated to the nested form,
 * but the reader accepts both so a deploy and a migration never have to land
 * together.
 */
export type PricingSchedule =
  Partial<Record<DayName, DaySchedule | number | null>>

/** A dated one-off — "Fill-A-Bag Day". Replaces the old open-ended override,
 *  which applied to EVERY day until someone removed it. */
export interface SpecialEvent {
  name: string
  /** YYYY-MM-DD, compared against the date at the STORE. */
  date: string
  price: number
  active: boolean
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
  /** The price today. null when closed, or when nothing is published. */
  price: number | null
  /** The merchant marked today CLOSED. Distinct from "no price set" — one
   *  means the doors are shut, the other means they have not told us yet. */
  closed: boolean
  /** Special event name, when one is running today. */
  label: string | null
  isEvent: boolean
  /** Fresh inventory goes out today. */
  restock: boolean
}

/** Nothing published, and not explicitly closed. */
const NO_PRICE: TodayPrice = {
  price: null, closed: false, label: null, isEvent: false, restock: false,
}

/** Reads either schedule shape. Legacy rows store a bare number. */
function readDay(raw: unknown): { price: number | null; restock: boolean } | 'closed' | 'absent' {
  if (raw === null) return 'closed'
  if (raw === undefined) return 'absent'
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? { price: raw, restock: false } : 'absent'
  }
  if (typeof raw === 'object') {
    const d = raw as Partial<DaySchedule>
    const restock = d.restock === true
    if (typeof d.price !== 'number' || !Number.isFinite(d.price)) {
      // An object with no usable price but restock set still carries that fact.
      return restock ? { price: null, restock } : 'absent'
    }
    return { price: d.price, restock }
  }
  return 'absent'
}

/**
 * What a member would pay at this store today.
 *
 * Order: an active special event for today's date wins, then the weekly
 * schedule. Always returns an object — the three states are read off `closed`
 * and `price` rather than from a null return, so no caller can forget one.
 */
export function todayPrice(
  schedule: PricingSchedule | null | undefined,
  timezone: string | null | undefined,
  specialEvents?: unknown,
): TodayPrice {
  const { isoDate, day } = storeToday(timezone)

  // Restock is read from the schedule even when an event overrides the price:
  // a special event does not stop fresh inventory going out.
  const dayEntry = schedule && typeof schedule === 'object'
    ? readDay((schedule as Record<string, unknown>)[day])
    : 'absent'
  const restock = dayEntry !== 'closed' && dayEntry !== 'absent' ? dayEntry.restock : false

  // ── Special event for today ──
  if (Array.isArray(specialEvents)) {
    for (const raw of specialEvents) {
      if (!raw || typeof raw !== 'object') continue
      const e = raw as Partial<SpecialEvent>
      if (e.active === false) continue
      if (e.date !== isoDate) continue
      if (typeof e.price !== 'number' || !Number.isFinite(e.price)) continue
      return {
        price: e.price,
        closed: false,
        label: (e.name ?? '').trim() || 'Special event',
        isEvent: true,
        restock,
      }
    }
  }

  // ── Weekly schedule ──
  if (dayEntry === 'closed') {
    return { price: null, closed: true, label: null, isEvent: false, restock: false }
  }
  if (dayEntry === 'absent') return NO_PRICE

  return {
    price: dayEntry.price,
    closed: false,
    label: null,
    isEvent: false,
    restock: dayEntry.restock,
  }
}

/**
 * Whether fresh inventory goes out today.
 *
 * Reads the day's own `restock` flag first. The legacy stores.restock_days
 * array is still accepted as a fallback for any row not yet migrated.
 */
export function restocksToday(
  schedule: PricingSchedule | null | undefined,
  timezone: string | null | undefined,
  legacyRestockDays?: unknown,
): boolean {
  const { day } = storeToday(timezone)

  const entry = schedule && typeof schedule === 'object'
    ? readDay((schedule as Record<string, unknown>)[day])
    : 'absent'

  // A closed day never restocks, and it short-circuits BEFORE the legacy array
  // is consulted — a store that later marked the day closed would otherwise
  // still show a "restocks today" badge from a stale restock_days entry.
  if (entry === 'closed') return false

  if (entry !== 'absent' && entry.restock) return true

  if (Array.isArray(legacyRestockDays)) {
    return legacyRestockDays.some(d => typeof d === 'string' && d.toLowerCase() === day)
  }
  return false
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
