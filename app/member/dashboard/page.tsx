'use client'

/**
 * Member dashboard.
 *
 * V3: this is a BinPerks surface, not a store surface. It uses BinPerks
 * colors only — the member belongs to the network, and the Origin Store is
 * an attribution fact, not a skin. Store-specific content lives on
 * /member/stores, where each store is one of many.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import TierBadge from '@/components/stamp/TierBadge'
import StampProgress from '@/components/stamp/StampProgress'
import Scanner from './Scanner'
import AddToHomeScreen from './AddToHomeScreen'
import { resolveTier, cyclePosition, stampsToNextCoupon } from '@/lib/tiers'

/** The only brand color on this page. */
const BINPERKS_BLUE = '#4A4B98'

/** How many past coupons the history shows. A glance, not an archive. */
const RECENT_COUPON_COUNT = 3

/** "August 1, 2026". Falls back to an empty string on a missing or unparseable
 *  date so a bad row renders as "Received" with nothing after it rather than
 *  "Invalid Date". */
function formatReceived(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

interface MemberData {
  id: string
  firstName: string
  lastName: string
  phone: string
  email: string
  status: string
  subscriptionStatus: 'free' | 'vip'
  vipBillingCycle: string | null
  totalStamps: number
  couponDue: boolean
  smsOptIn: boolean
  isBlacklisted: boolean
  referralCode: string
  referralUrl: string
  createdAt: string
}

interface StoreData {
  id: string
  storeName: string
  brandName: string
  brandColor: string
  logoUrl: string | null
  googleReviewUrl: string | null
  facebookReviewUrl: string | null
}

interface Reward {
  id: string
  couponValue: number
  rewardType: string
  status: 'earned' | 'redeemed' | 'expired'
  earnedAt: string
  redeemedAt: string | null
}

export default function MemberDashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [member, setMember] = useState<MemberData | null>(null)
  const [store, setStore] = useState<StoreData | null>(null)
  const [rewards, setRewards] = useState<Reward[]>([])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/member/me')
      if (res.status === 401) {
        // Home page, not /member/login. /member/login is a store picker, and
        // sending a signed-out member there makes them choose a store before
        // they can even type their phone — which reads as a loop when they
        // just came from signing in. The home page is the one front door.
        router.replace('/')
        return
      }
      if (!res.ok) {
        setLoading(false)
        return
      }
      const data = await res.json()
      setMember(data.member)
      setStore(data.store)
      setRewards(data.rewards ?? [])
      setLoading(false)
    }
    load()
  }, [router])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  async function handleCopyReferral() {
    if (!member) return
    try {
      await navigator.clipboard.writeText(member.referralUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // no-op fallback
    }
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#F5F5F8]">
        <span className="w-8 h-8 border-[3px] border-[#EBEBF2] border-t-[#4A4B98] rounded-full animate-spin" />
      </div>
    )
  }

  // Authenticated, but no members row matches this auth identity. Signing in
  // again cannot fix that, so this deliberately does not offer a sign-in
  // button — that is precisely the loop. Sign out and point at support.
  if (!member) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-[#F5F5F8] px-6 text-center gap-4">
        <span className="text-3xl">⚠️</span>
        <p className="font-['Coiny'] text-xl text-[#1A1A2E]">We can&apos;t find your membership</p>
        <p className="text-[13px] text-[#8E8EA8] font-medium max-w-xs leading-relaxed">
          You&apos;re signed in, but this login isn&apos;t linked to a BinPerks membership.
          Email{' '}
          <a href="mailto:support@binperks.com" className="underline font-semibold">
            support@binperks.com
          </a>{' '}
          and we&apos;ll get it sorted — signing in again won&apos;t change this.
        </p>
        <button
          onClick={handleSignOut}
          className="w-full max-w-xs py-4 rounded-2xl font-bold text-[15px] font-['Montserrat'] bg-[#4A4B98] text-white active:scale-[0.97] transition-all"
        >
          Sign out
        </button>
      </div>
    )
  }

  if (member.isBlacklisted) {
    return (
      <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">
        <div className="px-5 py-3 flex items-center gap-2.5" style={{ backgroundColor: BINPERKS_BLUE }}>
          <span className="font-['Coiny'] text-xl leading-none text-white">BinPerks Member</span>
        </div>
        <main className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
          <span className="text-3xl">⚠️</span>
          <p className="font-['Coiny'] text-xl text-[#1A1A2E]">Account unavailable</p>
          <p className="text-[13px] text-[#8E8EA8] font-medium max-w-xs">
            Please contact support@binperks.com for help with your account.
          </p>
          <button onClick={handleSignOut} className="text-[13px] font-semibold text-[#4A4B98] underline mt-2">
            Sign out
          </button>
        </main>
      </div>
    )
  }

  // resolveTier, not getTier: a free member is Starter with a $5 coupon no
  // matter how many stamps they have. getTier said Bronze/$7, so Starter
  // members were being promised a coupon $2 larger than the one they get.
  const tier = resolveTier(member.totalStamps, member.subscriptionStatus)
  const cyclePos = cyclePosition(member.totalStamps)
  const remaining = stampsToNextCoupon(member.totalStamps)
  // Same rule the stamp tool uses: a due coupon shows a full card rather than
  // wrapping back to zero, so the member sees why it is ready.
  const filledDots = member.couponDue ? 20 : cyclePos

  const activeRewards = rewards.filter(r => r.status === 'earned')
  const pastRewards = rewards.filter(r => r.status !== 'earned')
  const isFree = member.subscriptionStatus === 'free'
  // Still checked against the full history, not the trimmed display list — a
  // Starter member's one lifetime coupon may be older than the last three.
  const hasUsedFreeLifetimeCoupon = isFree && pastRewards.some(r => r.status === 'redeemed')

  // /api/member/me already orders by earned_at desc, but sort here too so the
  // "last 3" holds regardless of what the API decides to do later.
  const recentRewards = [...pastRewards]
    .sort((a, b) => new Date(b.earnedAt).getTime() - new Date(a.earnedAt).getTime())
    .slice(0, RECENT_COUPON_COUNT)

  const approachingBanner = (() => {
    if (isFree) return null
    const s = member.totalStamps
    if (s >= 180 && s < 200)  return { emoji: '🥈', label: 'Silver',  mult: 3 }
    if (s >= 730 && s < 750)  return { emoji: '🥇', label: 'Gold',    mult: 4 }
    if (s >= 1980 && s < 2000) return { emoji: '💎', label: 'Diamond', mult: 5 }
    return null
  })()

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">

      {/* BinPerks-only header. No store name, no store logo, no store color —
          the membership is with the network. */}
      <div className="px-5 py-3 flex items-center gap-2.5" style={{ backgroundColor: BINPERKS_BLUE }}>
        <span className="font-['Coiny'] text-xl leading-none text-white flex-1">
          BinPerks Member
        </span>
        <TierBadge
          totalStamps={member.totalStamps}
          subscriptionStatus={member.subscriptionStatus}
          className="flex-shrink-0"
        />
      </div>

      <main className="flex-1 flex flex-col items-center px-4 py-7 gap-4 max-w-md mx-auto w-full">

        {/* Renders nothing once dismissed, when already installed, or on
            desktop — so it costs an empty node the rest of the time. */}
        <AddToHomeScreen />

        {/* Greeting. The tier badge lives in the header now — one badge, not two. */}
        <div className="w-full flex flex-col items-center text-center gap-1.5">
          <h1 className="font-['Coiny'] text-2xl text-[#1A1A2E]">Hi, {member.firstName}</h1>
          <p className="text-[12px] text-[#8E8EA8] font-medium">
            BinPerks network membership
          </p>
        </div>

        {/* Stamp progress card */}
        <div className="w-full bg-white rounded-2xl px-6 pt-7 pb-6 shadow-sm flex flex-col items-center gap-1.5">
          <p className="text-[11px] font-bold tracking-[0.1em] uppercase text-[#8E8EA8] mb-1">
            Lifetime stamps
          </p>
          <div className="flex items-baseline gap-1.5">
            <span className="font-['Coiny'] text-[64px] text-[#FFB217] leading-none tracking-tight">
              {member.totalStamps}
            </span>
          </div>
          {/* The same 20-dot card the cashier sees in the stamp tool, from the
              shared component — a member should recognise their card across the
              counter. Replaces the bare progress bar that used to sit here;
              StampProgress renders its own bar, so keeping both would have
              shown two. */}
          <div className="w-full mt-4">
            <StampProgress
              filled={filledDots}
              label="Toward next coupon"
              caption={member.couponDue ? (
                <><strong className="text-[#1A1A2E]">Coupon ready!</strong> Redeem it on your next visit</>
              ) : (
                <><strong className="text-[#1A1A2E]">{remaining} more stamp{remaining !== 1 ? 's' : ''}</strong>{' '}
                to earn a <strong className="text-[#1A1A2E]">${tier.couponValue} coupon</strong></>
              )}
            />
          </div>
        </div>

        {/* Approaching tier banner */}
        {approachingBanner && (
          <div className="w-full rounded-2xl px-5 py-4 flex items-center gap-3.5" style={{ backgroundColor: '#FFB217' }}>
            <span className="text-3xl flex-shrink-0">{approachingBanner.emoji}</span>
            <p className="text-[14px] font-semibold text-[#1A1A2E] leading-snug">
              You’re almost a <strong>BinPerks {approachingBanner.label} Member!</strong> Just a few more visits to unlock your <strong>{approachingBanner.mult}x stamp multiplier!</strong>
            </p>
          </div>
        )}

        {/* AI Product Scanner — available to ALL members, Starter and VIP */}
        <Scanner brandColor={BINPERKS_BLUE} />

        {/* Active coupons */}
        {activeRewards.length > 0 && (
          <div className="w-full flex flex-col gap-2.5">
            <p className="text-[12px] font-bold tracking-[0.06em] uppercase text-[#8E8EA8] px-1">
              Ready to use
            </p>
            {activeRewards.map(r => (
              <div key={r.id} className="w-full bg-[#2A7D34] rounded-2xl px-5 py-4 flex items-center gap-3.5">
                <span className="text-2xl flex-shrink-0">🎟️</span>
                <div className="flex-1">
                  <p className="text-[14px] font-bold text-white leading-tight">${r.couponValue} coupon</p>
                  <p className="text-[11px] text-white/80 font-medium mt-0.5">Show this at checkout</p>
                </div>
                <div className="font-['Coiny'] text-xl text-white flex-shrink-0">${r.couponValue}</div>
              </div>
            ))}
            <p className="text-[11px] text-[#8E8EA8] font-medium px-1 leading-relaxed">
              Redeemable at any participating BinPerks location.
            </p>
          </div>
        )}

        {/* Free-tier upgrade nudge */}
        {isFree && (
          <Link
            href="/member/upgrade"
            className="w-full rounded-2xl p-5 flex flex-col gap-2"
            style={{ backgroundColor: `${BINPERKS_BLUE}12`, border: `1.5px solid ${BINPERKS_BLUE}30` }}
          >
            <p className="font-['Coiny'] text-lg" style={{ color: BINPERKS_BLUE }}>Keep earning with VIP</p>
            <p className="text-[12px] text-[#8E8EA8] font-medium leading-relaxed">
              {hasUsedFreeLifetimeCoupon
                ? "You've used your one lifetime Starter coupon. Upgrade to VIP ($29.99/mo) to keep earning stamps and unlock bigger coupons."
                : 'Upgrade to VIP ($29.99/mo) to earn stamps faster and unlock bigger coupons.'}
            </p>
            <span className="text-[13px] font-bold mt-1" style={{ color: BINPERKS_BLUE }}>See VIP perks</span>
          </Link>
        )}

        {/* Referral share */}
        <div className="w-full bg-white rounded-2xl px-5 py-5 shadow-sm flex flex-col gap-3">
          <div>
            <p className="font-['Coiny'] text-lg text-[#1A1A2E]">Share &amp; both earn bonus stamps</p>
            <p className="text-[12px] text-[#8E8EA8] font-medium mt-0.5">
              When a friend joins using your link, you earn 2 bonus stamps.
            </p>
          </div>
          <div className="bg-[#F5F5F8] rounded-xl px-4 py-3 flex items-center gap-3">
            <p className="flex-1 text-[12px] font-semibold text-[#8E8EA8] truncate">{member.referralUrl}</p>
            <button
              onClick={handleCopyReferral}
              className="flex-shrink-0 text-[12px] font-bold px-3 py-1.5 rounded-lg transition-colors"
              style={{
                backgroundColor: copied ? '#2A7D34' : `${BINPERKS_BLUE}15`,
                color: copied ? 'white' : BINPERKS_BLUE,
              }}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Browsing the network lives on its own page. Inline, the finder
            pushed coupons, referrals and everything below it off the first
            screen. */}
        <Link
          href="/member/stores"
          className="w-full rounded-2xl px-5 py-5 flex items-center gap-4 shadow-sm bg-white active:scale-[0.99] transition-transform"
        >
          <span className="text-3xl flex-shrink-0">🏪</span>
          <div className="flex-1">
            <p className="font-['Coiny'] text-lg text-[#1A1A2E]">Browse Stores &amp; Perks</p>
            <p className="text-[12px] text-[#8E8EA8] font-medium mt-0.5 leading-relaxed">
              See every BinPerks location and what each one offers.
            </p>
          </div>
          <span className="text-[#D1D1DC] text-xl flex-shrink-0">›</span>
        </Link>

        {/* Coupon history — the three most recent only. Older ones are still
            in the database; this is a glance at what you've earned lately, not
            an archive. */}
        {recentRewards.length > 0 && (
          <div className="w-full flex flex-col gap-2">
            <p className="text-[12px] font-bold tracking-[0.06em] uppercase text-[#8E8EA8] px-1">
              Coupon history
            </p>
            {recentRewards.map(r => (
              <div key={r.id} className="w-full flex items-center justify-between gap-3 px-1 py-1.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[#1A1A2E]">${r.couponValue} coupon</p>
                  <p className="text-[11px] text-[#8E8EA8] font-medium mt-0.5">
                    Received {formatReceived(r.earnedAt)}
                  </p>
                </div>
                <span className="text-[11px] font-semibold text-[#D1D1DC] uppercase tracking-wide flex-shrink-0">
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Account links. Feedback is not offered here — members get a GHL SMS
            invite an hour after a stamp, which is when they actually have
            something to say. */}
        <div className="w-full mt-1">
          <Link href="/member/settings" className="w-full flex flex-col items-center gap-1 py-3.5 rounded-2xl bg-white shadow-sm text-center">
            <span className="text-lg">⚙️</span>
            <span className="text-[11px] font-bold text-[#1A1A2E]">Settings</span>
          </Link>
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="w-full py-4 rounded-2xl font-semibold text-[14px] font-['Montserrat'] text-[#8E8EA8] border-2 border-[#EBEBF2] active:border-[#1A1A2E] active:text-[#1A1A2E] transition-colors mt-2"
        >
          Sign out
        </button>

        <p className="text-[11px] text-[#8E8EA8] text-center font-medium">
          Questions? <a href="mailto:support@binperks.com" className="underline">support@binperks.com</a>
        </p>
      </main>
    </div>
  )
}
