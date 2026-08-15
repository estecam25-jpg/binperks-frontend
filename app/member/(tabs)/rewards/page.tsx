'use client'

/**
 * /member/rewards — the Rewards tab.
 *
 * All real data, from /api/member/me: stamp progress, tier, earned coupons and
 * the member's referral link.
 *
 * The reward structure below is a REFERENCE TABLE of what each level earns per
 * 20-stamp cycle — not a stamp ladder. It never says "20 = $5, 40 = $7"; the
 * cycle is always 20 stamps and only the reward value changes by level.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppHeader from '@/components/member/AppHeader'
import MembershipStampCard from '@/components/member/MembershipStampCard'
import { TIERS, STARTER_TIER, resolveTier, TIER_EMOJI, TIER_LABELS, type TierName } from '@/lib/tiers'

const BINPERKS_BLUE = '#4A4B98'

interface MemberData {
  firstName: string
  subscriptionStatus: 'free' | 'vip'
  totalStamps: number
  couponDue: boolean
  referralUrl: string | null
  referralCode: string | null
}

/** The locked table, read from lib/tiers so values are never restated here —
 *  including the multipliers, which are already the source of truth for what
 *  the stamp route awards per visit.
 *
 *  No prices: the VIP cost belongs on the upgrade page, not in a rewards
 *  reference table. */
const LEVELS: { name: TierName; value: number; multiplier: number }[] = [
  { name: 'Free', value: STARTER_TIER.couponValue, multiplier: STARTER_TIER.multiplier },
  ...TIERS.map(t => ({ name: t.name, value: t.couponValue, multiplier: t.multiplier })),
]

/** "FREE STARTER MEMBERSHIP" / "Bronze VIP MEMBERSHIP". */
function membershipLabel(name: TierName): string {
  return name === 'Free' ? 'FREE STARTER MEMBERSHIP' : `${TIER_LABELS[name]} VIP MEMBERSHIP`
}

export default function MemberRewardsPage() {
  const router = useRouter()
  const [member, setMember] = useState<MemberData | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/member/me')
      .then(res => {
        if (res.status === 401) { router.replace('/'); return null }
        return res.ok ? res.json() : null
      })
      .then(d => {
        if (d?.member) setMember(d.member)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [router])

  async function copyReferral() {
    if (!member?.referralUrl) return
    try {
      await navigator.clipboard.writeText(member.referralUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be blocked; the link is on screen to copy by hand.
    }
  }

  const currentTier = member
    ? resolveTier(member.totalStamps, member.subscriptionStatus).name
    : null

  return (
    <>
      <AppHeader />

      <main className="flex-1 flex flex-col items-center px-4 py-5 gap-5 max-w-md mx-auto w-full">

        <div className="w-full px-1">
          <h1 className="font-['Coiny'] text-[26px] text-[#1A1A2E] leading-tight">Rewards</h1>
        </div>

        {loading ? (
          <div className="w-full h-64 rounded-2xl bg-white animate-pulse" />
        ) : !member ? (
          <div className="w-full bg-white rounded-2xl py-12 px-6 text-center">
            <p className="text-[14px] font-semibold text-[#8E8EA8]">
              Couldn&apos;t load your rewards. Please refresh.
            </p>
          </div>
        ) : (
          <>
            <MembershipStampCard
              totalStamps={member.totalStamps}
              subscriptionStatus={member.subscriptionStatus}
              couponDue={member.couponDue}
              showUpgradeCta={member.subscriptionStatus === 'free'}
            />

            {/* ── Reward structure ── reference, NOT a ladder */}
            <section className="w-full flex flex-col gap-2.5">
              <h2 className="text-[15px] font-extrabold text-[#1A1A2E] px-1">BinPerks Club</h2>
              <div className="w-full bg-white rounded-2xl shadow-sm overflow-hidden divide-y divide-[#EBEBF2]">
                {LEVELS.map(level => {
                  const isCurrent = level.name === currentTier
                  return (
                    <div
                      key={level.name}
                      className="px-4 py-3 flex items-center gap-3"
                      style={isCurrent ? { backgroundColor: `${BINPERKS_BLUE}0D` } : undefined}
                    >
                      <span className="text-[18px] flex-shrink-0">{TIER_EMOJI[level.name]}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold text-[#1A1A2E] leading-tight">
                          {membershipLabel(level.name)}
                          {isCurrent && (
                            <span
                              className="ml-2 text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded-full align-middle"
                              style={{ backgroundColor: BINPERKS_BLUE, color: 'white' }}
                            >
                              You
                            </span>
                          )}
                        </p>
                        <p className="text-[12px] font-medium text-[#8E8EA8] mt-0.5">
                          Every 20 stamps → ${level.value}
                        </p>
                      </div>

                      {/* The multiplier is the reason to upgrade, so it is set
                          as a solid badge rather than muted secondary text. */}
                      <span
                        className="flex-shrink-0 text-[13px] font-extrabold px-2.5 py-1.5 rounded-xl whitespace-nowrap"
                        style={{ backgroundColor: `${BINPERKS_BLUE}14`, color: BINPERKS_BLUE }}
                      >
                        {level.multiplier}x stamps per visit
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* ── Ways to earn ── the only place referral tools live */}
            <section className="w-full flex flex-col gap-2.5">
              <h2 className="text-[15px] font-extrabold text-[#1A1A2E] px-1">
                Ways to Earn More Stamps
              </h2>
              <div className="w-full bg-white rounded-2xl px-5 py-5 shadow-sm flex flex-col gap-3">
                <p className="text-[15px] font-extrabold text-[#1A1A2E]">👥 Invite a Friend</p>
                <p className="text-[13px] font-medium text-[#8E8EA8] leading-relaxed">
                  Earn +5 stamps when a referred friend joins BinPerks and earns their
                  first stamp.
                </p>

                {member.referralUrl ? (
                  <>
                    <div className="rounded-xl bg-[#F5F5F8] px-3.5 py-2.5">
                      <p className="text-[11px] font-medium text-[#1A1A2E] break-all leading-relaxed">
                        {member.referralUrl}
                      </p>
                    </div>
                    <button
                      onClick={copyReferral}
                      className="w-full py-3.5 rounded-xl font-bold text-[15px] text-white active:opacity-80 transition-opacity"
                      style={{ backgroundColor: BINPERKS_BLUE }}
                    >
                      {copied ? '✓ Link copied' : 'Invite Friends'}
                    </button>
                  </>
                ) : (
                  <p className="text-[12px] font-medium text-[#8E8EA8]">
                    Your invite link is being set up. Check back shortly.
                  </p>
                )}
              </div>
            </section>
          </>
        )}

        {/* Clears the fixed bottom nav. A dedicated spacer rather than padding
            on an ancestor: the scanner and account screens each set their own
            height, and padding on a wrapper they overflow does not reach them.
            80px covers the 58px bar plus the raised SCAN pill's overhang, and
            the inset is added for the home indicator on notched phones. */}
        <div style={{ height: 'calc(80px + env(safe-area-inset-bottom))' }} aria-hidden="true" />
      </main>
    </>
  )
}
