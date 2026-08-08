export type TierName = 'Free' | 'Bronze' | 'Silver' | 'Gold' | 'Diamond'

export interface Tier {
  name: TierName
  minStamps: number
  maxStamps: number | null
  multiplier: number
  couponValue: number
  visitsPerReward: number
  badgeClass: string
}

// VIP tiers only — free members always display as 'Free' (Starter) via explicit tierName prop.
export const TIERS: Tier[] = [
  { name: 'Bronze',  minStamps: 0,    maxStamps: 199,  multiplier: 2, couponValue: 7,  visitsPerReward: 20, badgeClass: 'bg-orange-50 text-orange-800' },
  { name: 'Silver',  minStamps: 200,  maxStamps: 749,  multiplier: 3, couponValue: 10, visitsPerReward: 7,  badgeClass: 'bg-slate-100 text-slate-600' },
  { name: 'Gold',    minStamps: 750,  maxStamps: 1999, multiplier: 4, couponValue: 12, visitsPerReward: 5,  badgeClass: 'bg-yellow-50 text-yellow-800' },
  { name: 'Diamond', minStamps: 2000, maxStamps: null, multiplier: 5, couponValue: 15, visitsPerReward: 4,  badgeClass: 'bg-indigo-50 text-indigo-700' },
]

/**
 * Stamp-count tier ONLY. TIERS contains no Starter entry, so this returns
 * Bronze for anyone with 0–199 stamps — including free members, who should be
 * Starter. Never call this on its own to decide what tier to show; use
 * resolveTierName, or pass subscriptionStatus to <TierBadge>.
 */
export function getTier(totalStamps: number): Tier {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (totalStamps >= TIERS[i].minStamps) return TIERS[i]
  }
  return TIERS[0]
}

/**
 * Starter, the free tier. Deliberately NOT in TIERS: that array is a
 * stamp-threshold ladder and Starter isn't reachable by stamp count — it is
 * where you are until you subscribe. minStamps/maxStamps are inert here, and
 * maxStamps is null rather than 199 because a free member with 5,000 stamps is
 * still Starter.
 *
 * Values from CLAUDE.md "TIER SYSTEM (LOCKED)": 1x multiplier, $5 coupon.
 */
export const STARTER_TIER: Tier = {
  name: 'Free', minStamps: 0, maxStamps: null, multiplier: 1,
  couponValue: 5, visitsPerReward: 20, badgeClass: 'bg-gray-100 text-gray-500',
}

/**
 * The tier a member is actually in, as a full Tier.
 *
 * CORE RULE: Starter → Bronze requires a VIP subscription regardless of stamp
 * count. getTier alone gets this wrong every time — it reports Bronze for any
 * free member under 200 stamps, which is how the stamp tool and the member
 * dashboard came to promise Starter members a $7 coupon when the real value is
 * $5. Reach for this whenever you need couponValue or multiplier, not getTier.
 */
export function resolveTier(
  totalStamps: number,
  subscriptionStatus: string | null | undefined,
): Tier {
  return subscriptionStatus === 'free' ? STARTER_TIER : getTier(totalStamps)
}

/** Convenience wrapper on resolveTier for the common display-only case. */
export function resolveTierName(
  totalStamps: number,
  subscriptionStatus: string | null | undefined,
): TierName {
  return resolveTier(totalStamps, subscriptionStatus).name
}

export function cyclePosition(totalStamps: number): number {
  return totalStamps % 20
}

export function stampsToNextCoupon(totalStamps: number): number {
  const pos = cyclePosition(totalStamps)
  return pos === 0 ? 20 : 20 - pos
}

// Display-only. 'Free' is Starter for free members; passed explicitly, never from getTier().
// Emoji and label are kept separate so V3 network copy can compose them differently
// ("🥇 BinPerks Gold Member") without duplicating the tier vocabulary.
export const TIER_EMOJI: Record<TierName, string> = {
  Free:    '🪨',
  Bronze:  '🥉',
  Silver:  '🥈',
  Gold:    '🥇',
  Diamond: '💎',
}

export const TIER_LABELS: Record<TierName, string> = {
  Free:    'Starter',
  Bronze:  'Bronze',
  Silver:  'Silver',
  Gold:    'Gold',
  Diamond: 'Diamond',
}

export const TIER_DISPLAY_NAMES: Record<TierName, string> = {
  Free:    `${TIER_EMOJI.Free} ${TIER_LABELS.Free}`,
  Bronze:  `${TIER_EMOJI.Bronze} ${TIER_LABELS.Bronze}`,
  Silver:  `${TIER_EMOJI.Silver} ${TIER_LABELS.Silver}`,
  Gold:    `${TIER_EMOJI.Gold} ${TIER_LABELS.Gold}`,
  Diamond: `${TIER_EMOJI.Diamond} ${TIER_LABELS.Diamond}`,
}
