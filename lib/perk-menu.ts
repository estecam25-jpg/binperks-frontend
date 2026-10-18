/**
 * The shared perk menu: types, rules and the copy that states them.
 *
 * CLIENT-SAFE — types, constants and pure functions only.
 *
 * ── WHY A MENU ─────────────────────────────────────────────────────────────
 * Perks used to be free text in a slot. Every store wrote its own wording,
 * nothing was reviewed, and a perk that broke the rules was live the moment it
 * was typed. Choosing from a shared list makes the offer consistent across the
 * network and puts review before publication instead of after a complaint.
 *
 * ── NO TIERS ON THE MENU ───────────────────────────────────────────────────
 * A menu option is just an offer. THE SLOT DECIDES WHO GETS IT: a Starter slot
 * goes to every member, a VIP slot to VIP members only. The same option can sit
 * in either, which is why nothing here carries a member type.
 *
 * ── WHAT NEVER LEAKS ───────────────────────────────────────────────────────
 * A menu entry created by approving a submission carries no trace of which
 * store proposed it. perk_submissions knows; perk_menu does not, and no route
 * joins the two for anyone but admin.
 */

/** A row of perk_menu, as every caller sees it. */
export interface MenuPerk {
  id: string
  groupName: string
  groupOrder: number
  title: string
  description: string
  displayOrder: number
  /** Set means it can no longer be newly selected, but stays live where used. */
  retiredAt: string | null
}

/** Menu options grouped for a dropdown's <optgroup>s. */
export interface MenuGroup {
  name: string
  perks: MenuPerk[]
}

/**
 * Above this many selectable options the dropdown gets a search box.
 *
 * Twenty is roughly where scanning a grouped list stops being faster than
 * typing two words, and it is also where the seeded menu starts — so the box
 * appears the moment the menu grows beyond what BinPerks shipped.
 */
export const MENU_SEARCH_THRESHOLD = 20

/** The groups the menu ships with. Admin may add others; this only decides the
 *  order of the ones we know, and is not a whitelist. */
export const SEEDED_GROUPS = ['Discounts', 'Bags', 'Access', 'Events'] as const

// ── The rules, written once ─────────────────────────────────────────────────

/** Shown above the submission form, and the standard a reviewer applies. */
export const NO_CHANCE_RULE =
  'Perks can’t involve chance: no raffles, drawings, sweepstakes, spin-to-win, '
  + 'scratch-offs or mystery prizes. Approved perks may be reworded before they’re '
  + 'added to the perk menu. We review new perks within 3 business days.'

/** Shown on the perks form, because the slot is the only thing that decides
 *  who receives a perk and that is not obvious from the slot label alone. */
export const VIP_INCLUDES_STARTER_NOTE =
  'VIP members also get all your Starter perks.'

export type SubmissionStatus = 'pending' | 'approved' | 'declined'

export interface PerkSubmission {
  id: string
  title: string
  description: string
  note: string | null
  status: SubmissionStatus
  declineReason: string | null
  createdAt: string
  reviewedAt: string | null
}

/** What the merchant is told about each status. One wording, one place. */
export function submissionStatusLabel(s: SubmissionStatus): string {
  switch (s) {
    case 'approved': return 'Approved — now in your perk menu'
    case 'declined': return 'Declined'
    default:         return 'Pending'
  }
}

/** Group a flat menu for display, preserving the admin-set order throughout. */
export function groupMenu(perks: MenuPerk[]): MenuGroup[] {
  const byName = new Map<string, MenuPerk[]>()
  const order  = new Map<string, number>()

  for (const p of perks) {
    if (!byName.has(p.groupName)) byName.set(p.groupName, [])
    byName.get(p.groupName)!.push(p)
    // First sighting wins; the query already returns them in group order.
    if (!order.has(p.groupName)) order.set(p.groupName, p.groupOrder)
  }

  return [...byName.entries()]
    .sort((a, b) => (order.get(a[0]) ?? 0) - (order.get(b[0]) ?? 0))
    .map(([name, group]) => ({
      name,
      perks: group.slice().sort((a, b) => a.displayOrder - b.displayOrder),
    }))
}

/**
 * Does this option match what the merchant typed?
 *
 * Title AND description, because the variants differ only in the sentence —
 * "Fill a bag for $20" and "Fill a bag for $25" share a title, so searching
 * the title alone could not tell them apart.
 */
export function menuPerkMatches(p: MenuPerk, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return `${p.title} ${p.description} ${p.groupName}`.toLowerCase().includes(q)
}

/** One line for a dropdown option. The sentence is what distinguishes the
 *  variants, so it is never truncated away. */
export function menuPerkLabel(p: MenuPerk): string {
  return `${p.title} — ${p.description}`
}

/** The database row shape, mapped once so every route agrees. */
export function toMenuPerk(row: Record<string, unknown>): MenuPerk {
  return {
    id:           row.id as string,
    groupName:    (row.group_name as string) ?? 'Other',
    groupOrder:   Number(row.group_order ?? 0),
    title:        (row.title as string) ?? '',
    description:  (row.description as string) ?? '',
    displayOrder: Number(row.display_order ?? 0),
    retiredAt:    (row.retired_at as string | null) ?? null,
  }
}

export const MENU_COLUMNS =
  'id, group_name, group_order, title, description, display_order, retired_at'
