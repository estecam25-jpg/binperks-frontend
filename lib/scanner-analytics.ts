/**
 * Scanner analytics aggregation.
 *
 * Lives outside the route so it can be exercised directly against real rows —
 * a route handler can only be reached through the admin session, which makes
 * the grouping rules awkward to verify otherwise.
 */

/** Written by /api/member/scan/choice. 'no_choice' is a valid column value the
 *  choice route never sets — it is reserved for a future sweep that closes out
 *  abandoned scans, so it counts as "no choice" here rather than being ignored. */
export const CHOICE_CART = 'shopping_cart'
export const CHOICE_BINS = 'back_to_bins'

export const TOP_PRODUCT_LIMIT = 20

export interface ScanProductRow {
  identified_product: string | null
  identified_category: string | null
  member_choice: string | null
}

export interface TopProduct {
  product: string
  category: string | null
  scans: number
  cartPct: number
  binsPct: number
}

/** One decimal place, and 0 rather than NaN when there is nothing to divide. */
export function pct(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.round((part / whole) * 1000) / 10
}

/**
 * The most-scanned products, highest first.
 *
 * Grouped case-insensitively: the model returns the same product with varying
 * capitalisation, and splitting those into separate rows would understate the
 * real leaders. The displayed label is the first spelling encountered.
 *
 * cartPct and binsPct are of each product's own scan count, matching the
 * headline row in the UI. They will not sum to 100 when some of a product's
 * scans have no choice recorded — that gap is the abandoned share.
 */
export function topProducts(
  rows: ScanProductRow[],
  limit: number = TOP_PRODUCT_LIMIT,
): TopProduct[] {
  interface Group {
    label: string
    scans: number
    cart: number
    bins: number
    categoryCounts: Record<string, number>
  }

  const groups = new Map<string, Group>()

  for (const row of rows) {
    const raw = (row.identified_product ?? '').trim()
    if (!raw) continue
    const key = raw.toLowerCase()

    let g = groups.get(key)
    if (!g) {
      g = { label: raw, scans: 0, cart: 0, bins: 0, categoryCounts: {} }
      groups.set(key, g)
    }

    g.scans++
    if (row.member_choice === CHOICE_CART) g.cart++
    else if (row.member_choice === CHOICE_BINS) g.bins++

    const cat = (row.identified_category ?? '').trim()
    if (cat) g.categoryCounts[cat] = (g.categoryCounts[cat] ?? 0) + 1
  }

  return [...groups.values()]
    .sort((a, b) => b.scans - a.scans || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map(g => ({
      product: g.label,
      // The model is not consistent about category for the same product, so
      // report whichever it picked most often.
      category: Object.entries(g.categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      scans:   g.scans,
      cartPct: pct(g.cart, g.scans),
      binsPct: pct(g.bins, g.scans),
    }))
}

export interface TopCategory {
  category: string
  scans: number
}

/**
 * The most-scanned categories, highest first.
 *
 * Grouped case-insensitively for the same reason topProducts is: the model is
 * inconsistent about capitalisation and splitting "Tools" from "tools" would
 * understate both. Scans with no category are skipped rather than bucketed as
 * "Unknown" — an absent category is a gap in the model's answer, not a kind of
 * product, and showing it as a leading category would be misleading.
 */
export function topCategories(
  rows: { identified_category: string | null }[],
  limit = 10,
): TopCategory[] {
  const groups = new Map<string, { label: string; scans: number }>()

  for (const row of rows) {
    const raw = (row.identified_category ?? '').trim()
    if (!raw) continue
    const key = raw.toLowerCase()
    const g = groups.get(key) ?? { label: raw, scans: 0 }
    g.scans++
    groups.set(key, g)
  }

  return [...groups.values()]
    .sort((a, b) => b.scans - a.scans || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map(g => ({ category: g.label, scans: g.scans }))
}
