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

export function getTier(totalStamps: number): Tier {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (totalStamps >= TIERS[i].minStamps) return TIERS[i]
  }
  return TIERS[0]
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
