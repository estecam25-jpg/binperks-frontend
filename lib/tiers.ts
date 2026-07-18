export type TierName = 'Free' | 'Silver' | 'Gold' | 'Diamond'

export interface Tier {
  name: TierName
  minStamps: number
  maxStamps: number | null
  multiplier: number
  couponValue: number
  visitsPerReward: number
  badgeClass: string
}

export const TIERS: Tier[] = [
  { name: 'Free',    minStamps: 0,    maxStamps: 199,  multiplier: 1, couponValue: 5,  visitsPerReward: 20, badgeClass: 'bg-gray-100 text-gray-500' },
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

// Display-only names — 'Free' is the internal TierName key, 'Starter' is what members see.
export const TIER_DISPLAY_NAMES: Record<TierName, string> = {
  Free:    '🪨 Starter',
  Silver:  '🥈 Silver',
  Gold:    '🥇 Gold',
  Diamond: '💎 Diamond',
}
