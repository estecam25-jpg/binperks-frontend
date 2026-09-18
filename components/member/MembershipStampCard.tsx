'use client'

/**
 * Membership stamp card — the member's real progress. Shown on Home and on
 * Rewards, from one component so the two can never disagree.
 *
 * All values come from lib/tiers, which is the single source of truth for the
 * locked tier table. Nothing here hardcodes a coupon value or a threshold.
 *
 * Deliberately NOT a stamp ladder: it never lists "20 = $5, 40 = $7". A member
 * sees where they are and what the next reward is worth, not the whole table.
 * The table lives on Rewards as a reference section.
 *
 * TIER PROGRESS (the block at the foot) is shown to every member: which level
 * they are on, their lifetime stamps, and how far the next level is. Both pages
 * get it from here, so Home's summary and the Rewards detail always agree.
 */

import Link from 'next/link'
import StampProgress from '@/components/stamp/StampProgress'
import { useStampFill } from '@/lib/use-stamp-fill'
import {
  TIERS, resolveTier, cyclePosition, stampsToNextCoupon,
  TIER_EMOJI, TIER_LABELS, type TierName,
} from '@/lib/tiers'

const BINPERKS_BLUE = '#4A4B98'

/** Lifetime stamps at which the next tier begins, or null at the top tier.
 *  Read from TIERS rather than restated, so the locked thresholds stay in one
 *  place: Bronze 0–199, Silver 200–749, Gold 750–1,999, Diamond 2,000+. */
function nextTierFrom(current: TierName): { name: TierName; at: number } | null {
  const i = TIERS.findIndex(t => t.name === current)
  if (i === -1 || i === TIERS.length - 1) return null
  const next = TIERS[i + 1]
  return { name: next.name, at: next.minStamps }
}

export default function MembershipStampCard({
  totalStamps,
  subscriptionStatus,
  couponDue,
  showUpgradeCta = true,
}: {
  totalStamps: number
  subscriptionStatus: 'free' | 'vip'
  couponDue: boolean
  /** Rewards already has its own upgrade path, so it hides the button. */
  showUpgradeCta?: boolean
}) {
  const tier = resolveTier(totalStamps, subscriptionStatus)
  const cyclePos = cyclePosition(totalStamps)
  const remaining = stampsToNextCoupon(totalStamps)
  // A due coupon shows a full card rather than wrapping to zero — same rule
  // the cashier's stamp tool uses.
  const filled = couponDue ? 20 : cyclePos

  // Same cascade the join landing page plays, from one shared hook. It fills to
  // the member's real count, not to 20 — see lib/use-stamp-fill.
  const animatedFilled = useStampFill(filled)

  const isStarter = subscriptionStatus === 'free'
  const emoji = TIER_EMOJI[tier.name]
  const label = TIER_LABELS[tier.name]

  return (
    <div className="w-full bg-white rounded-2xl px-5 pt-5 pb-5 shadow-sm flex flex-col gap-3">

      {/* Tier line */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-extrabold text-[#1A1A2E]">
          {emoji} {isStarter ? 'Starter Member' : `${label} VIP`}
        </span>
        <span
          className="text-[11px] font-bold tracking-[0.06em] uppercase px-2.5 py-1 rounded-full"
          style={{ backgroundColor: '#FFB21725', color: '#8A6A00' }}
        >
          Next Reward: ${tier.couponValue}
        </span>
      </div>

      {/* Progress toward the next coupon — always a 20-stamp cycle */}
      <StampProgress
        filled={animatedFilled}
        label={isStarter ? 'Stamps' : 'Toward your next reward'}
        caption={couponDue
          ? <><strong className="text-[#1A1A2E]">Reward ready!</strong> Redeem it on your next visit</>
          : <><strong className="text-[#1A1A2E]">{remaining} stamp{remaining === 1 ? '' : 's'} remaining</strong></>
        }
      />

      {isStarter && (
        <p className="text-[12px] font-semibold text-[#8A6A00] bg-[#FFB21720] rounded-xl px-3.5 py-2.5 leading-relaxed">
          You&apos;re almost there! Your Starter membership ends at 20 stamps.
          Upgrade to VIP and keep the rewards coming — forever.
        </p>
      )}

      <TierProgress tierName={tier.name} lifetime={totalStamps} isStarter={isStarter} />

      {isStarter && showUpgradeCta && (
        <Link
          href="/member/upgrade"
          className="w-full py-3.5 rounded-xl font-bold text-[15px] text-white text-center active:opacity-80 transition-opacity"
          style={{ backgroundColor: BINPERKS_BLUE }}
        >
          Upgrade to VIP
        </Link>
      )}
    </div>
  )
}

/** The shared bar, so all three states below draw the same thing. */
function Bar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 rounded-full bg-[#EBEBF2] overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: BINPERKS_BLUE }}
      />
    </div>
  )
}

/**
 * Where the member is on the level ladder. Three states:
 *
 *   Starter   — lifetime count, and the one honest next step: upgrading.
 *   Bronze/Silver/Gold — stamps to the next level, with the bar filled to it.
 *   Diamond   — full bar, maximum reached.
 *
 * STARTER HAS NO STAMP THRESHOLD TO CLIMB. Bronze is reached by subscribing,
 * not by earning stamps — a free member with 500 stamps is still Starter
 * (lib/tiers resolveTier, and the locked tier table: "Starter → Bronze: VIP
 * subscription required regardless of stamp count"). So this shows the upgrade
 * as the next step rather than a stamp countdown that would never complete. The
 * 20-stamp bar above it is their real, reachable next milestone.
 */
function TierProgress({
  tierName, lifetime, isStarter,
}: {
  tierName: TierName
  lifetime: number
  isStarter: boolean
}) {
  const lifetimeLabel = (
    <span className="text-[12px] font-semibold text-[#8E8EA8]">
      {lifetime.toLocaleString()} lifetime stamp{lifetime === 1 ? '' : 's'}
    </span>
  )

  if (isStarter) {
    return (
      <div className="border-t border-[#EBEBF2] pt-3 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          {lifetimeLabel}
          <span className="text-[12px] font-bold text-[#1A1A2E]">🪨 Starter</span>
        </div>
        <Bar pct={0} />
        <p className="text-[12px] font-medium text-[#8E8EA8]">
          Upgrade to VIP to unlock {TIER_EMOJI.Bronze} {TIER_LABELS.Bronze} and start levelling up.
        </p>
      </div>
    )
  }

  const next = nextTierFrom(tierName)

  if (!next) {
    return (
      <div className="border-t border-[#EBEBF2] pt-3 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          {lifetimeLabel}
          <span className="text-[12px] font-bold" style={{ color: BINPERKS_BLUE }}>
            {TIER_EMOJI.Diamond} Maximum tier reached
          </span>
        </div>
        <Bar pct={100} />
      </div>
    )
  }

  const toGo = Math.max(0, next.at - lifetime)
  // Floor, not round: at 199/200 rounding paints a full bar while a stamp is
  // still owed. The bar reads full only on arrival.
  const pct = Math.min(100, Math.floor((lifetime / next.at) * 100))

  return (
    <div className="border-t border-[#EBEBF2] pt-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        {lifetimeLabel}
        <span className="text-[12px] font-bold text-[#1A1A2E]">
          {lifetime.toLocaleString()} / {next.at.toLocaleString()}
        </span>
      </div>
      <Bar pct={pct} />
      <p className="text-[12px] font-medium text-[#8E8EA8]">
        <strong className="text-[#1A1A2E]">
          {toGo.toLocaleString()} stamp{toGo === 1 ? '' : 's'}
        </strong>
        {' '}to {TIER_EMOJI[next.name]} {TIER_LABELS[next.name]} VIP
      </p>
    </div>
  )
}
