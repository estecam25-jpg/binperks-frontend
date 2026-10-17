/**
 * Perk slots and which of them a store must fill.
 *
 * From Merchant Agreement V3.6 §6.2: each location maintains at least 1 and no
 * more than 3 active perks for Starter (free) members, and at least 3 and no
 * more than 5 for VIP members. The maximums are the slot counts; the minimums
 * are the required ones.
 *
 * ITS OWN MODULE because a Next.js route file may only export its handlers —
 * putting these in app/api/merchant/perks/route.ts fails the build — and
 * because the form and the API have to agree about them. They disagreed
 * before: the form allowed two Starter slots, the agreement said three.
 *
 * CLIENT-SAFE. Numbers and one pure function, no imports.
 */

/** Starter (free) members: 3 slots, the first one required. */
export const FREE_SLOTS = 3
export const FREE_REQUIRED = 1

/** VIP members: 5 slots, the first three required. */
export const VIP_SLOTS = 5
export const VIP_REQUIRED = 3

export interface PerkInput {
  slot: number
  title?: string
  description?: string
  isActive?: boolean
}

/** Is this slot one the store must fill? */
export function isRequiredSlot(slot: number, required: number): boolean {
  return slot <= required
}

/**
 * Which required slots are still empty, by slot number. Empty array means it
 * can be saved.
 *
 * A perk counts as filled when it has a TITLE. The description stays optional
 * everywhere — "10% off Tuesdays" needs no second sentence — and the active
 * toggle is not consulted, because the old rule counted active perks and a
 * merchant could satisfy it by switching on an empty one.
 */
export function missingRequiredPerks(perks: PerkInput[], required: number): number[] {
  const out: number[] = []
  for (let slot = 1; slot <= required; slot++) {
    const p = perks.find(x => Number(x.slot) === slot)
    if (!String(p?.title ?? '').trim()) out.push(slot)
  }
  return out
}

/** The message shown when required perks are missing. One wording, used by the
 *  form and returned by the API, so they cannot describe the rule differently. */
export function missingPerksMessage(missingFree: number[], missingVip: number[]): string {
  const parts = [
    missingFree.length ? `Starter perk${missingFree.length > 1 ? 's' : ''} ${missingFree.join(', ')}` : '',
    missingVip.length  ? `VIP perk${missingVip.length > 1 ? 's' : ''} ${missingVip.join(', ')}` : '',
  ].filter(Boolean)
  return `Fill in the required perks before saving: ${parts.join(' and ')}.`
}
