/**
 * Tiers, coupon cycles, and the three counters a member carries.
 *
 * THE ONE PLACE THE THRESHOLDS LIVE. Silver 200, Gold 750, Diamond 2,000 used
 * to be written out in five files — this one, the stamp route (twice: the
 * multiplier and the level-up check), the admin member badge, and the stamp
 * tool's congratulations copy. Five copies of a number that decides what a
 * member is owed is five chances to disagree. Everything reads TIERS now.
 *
 * ── THE THREE COUNTERS ─────────────────────────────────────────────────────
 *
 *   members.total_stamps            LIFETIME. Never resets. What a member has
 *                                   ever earned, free or VIP. Display only.
 *   members.cycle_stamps            0-19, toward the next coupon. Hits 20 and
 *                                   a coupon is issued and 20 is taken off.
 *   members.vip_progression_stamps  Earned WHILE VIP. Drives the tier. Never
 *                                   resets — not on cancel, not on anything.
 *
 * Why three and not one: a member upgrading mid-cycle keeps their place in the
 * cycle (14/20 stays 14/20, now worth $7 instead of $5) while their tier
 * progression starts at zero. One counter cannot do both. And a member who
 * cancels and comes back later resumes the tier they climbed to, which a
 * counter that reset would lose.
 *
 * FREE MEMBERS EARN FOREVER. There is no cap and no "Starter expired". A free
 * member earns a $5 coupon every 20 stamps for as long as they keep shopping;
 * VIP earns more per visit and bigger coupons.
 */

export type TierName = 'Free' | 'Bronze' | 'Silver' | 'Gold' | 'Diamond'

export interface Tier {
  name: TierName
  /** VIP PROGRESSION stamps needed to reach this tier — not lifetime stamps. */
  minStamps: number
  maxStamps: number | null
  multiplier: number
  couponValue: number
  visitsPerReward: number
  badgeClass: string
}

/** Stamps in one coupon cycle. */
export const COUPON_CYCLE = 20

// VIP tiers only — a free member is Starter whatever their stamp count.
export const TIERS: Tier[] = [
  { name: 'Bronze',  minStamps: 0,    maxStamps: 199,  multiplier: 2, couponValue: 7,  visitsPerReward: 20, badgeClass: 'bg-orange-50 text-orange-800' },
  { name: 'Silver',  minStamps: 200,  maxStamps: 749,  multiplier: 3, couponValue: 10, visitsPerReward: 7,  badgeClass: 'bg-slate-100 text-slate-600' },
  { name: 'Gold',    minStamps: 750,  maxStamps: 1999, multiplier: 4, couponValue: 12, visitsPerReward: 5,  badgeClass: 'bg-yellow-50 text-yellow-800' },
  { name: 'Diamond', minStamps: 2000, maxStamps: null, multiplier: 5, couponValue: 15, visitsPerReward: 4,  badgeClass: 'bg-indigo-50 text-indigo-700' },
]

/**
 * Starter, the free tier. Deliberately NOT in TIERS: that array is a
 * progression ladder and Starter is not a rung on it — it is where you are
 * until you subscribe. maxStamps is null because a free member with 5,000
 * stamps is still Starter.
 *
 * 1x multiplier, $5 coupon, every 20 stamps, for as long as they keep coming.
 */
export const STARTER_TIER: Tier = {
  name: 'Free', minStamps: 0, maxStamps: null, multiplier: 1,
  couponValue: 5, visitsPerReward: 20, badgeClass: 'bg-gray-100 text-gray-500',
}

/** What a member is, from the counter that decides it. */
export interface TierInput {
  /** members.vip_progression_stamps — NOT total_stamps. A member's tier comes
   *  from what they earned while paying, never from their lifetime count. */
  vipProgressionStamps: number
  subscriptionStatus: string | null | undefined
}

/**
 * The tier a member is actually in.
 *
 * Takes an object, not two loose numbers, on purpose: the old signature was
 * `resolveTier(totalStamps, status)` and every call site passed the lifetime
 * count. Those two numbers are no longer the same thing, and a positional
 * argument would have let every one of them keep compiling while quietly
 * promoting free-earned stamps into VIP tiers.
 */
export function tierFor({ vipProgressionStamps, subscriptionStatus }: TierInput): Tier {
  if (subscriptionStatus !== 'vip') return STARTER_TIER
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (vipProgressionStamps >= TIERS[i].minStamps) return TIERS[i]
  }
  return TIERS[0]
}

export function tierNameFor(input: TierInput): TierName {
  return tierFor(input).name
}

/** The next rung up, and how far away it is. Null once they are Diamond. */
export function nextTier(vipProgressionStamps: number): { tier: Tier; remaining: number } | null {
  const next = TIERS.find(t => vipProgressionStamps < t.minStamps)
  return next ? { tier: next, remaining: next.minStamps - vipProgressionStamps } : null
}

// ── The coupon cycle ─────────────────────────────────────────────────────────

/** Stamps still needed for the next coupon. */
export function cycleRemaining(cycleStamps: number): number {
  const pos = cycleStamps % COUPON_CYCLE
  return COUPON_CYCLE - pos
}

/**
 * Add a visit's stamps to the cycle.
 *
 * Returns how many coupons that completed and where the cycle now stands. More
 * than one is possible and must be paid: a Diamond member earns 5 a visit, and
 * a cycle sitting at 18 with a 25-stamp referral top-up owes two coupons, not
 * one. The old code did `total % 20` and could only ever notice one.
 *
 * Pure, so it can be tested without a database.
 */
export function applyCycle(
  cycleStamps: number,
  earned: number,
): { couponsEarned: number; cycleStamps: number } {
  const total = Math.max(0, cycleStamps) + Math.max(0, earned)
  return {
    couponsEarned: Math.floor(total / COUPON_CYCLE),
    cycleStamps: total % COUPON_CYCLE,
  }
}

// ── Display ─────────────────────────────────────────────────────────────────

// Emoji and label are kept apart so network copy can compose them differently
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
