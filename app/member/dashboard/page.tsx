'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase'
import TierBadge from '@/components/stamp/TierBadge'
import { getTier, cyclePosition, stampsToNextCoupon } from '@/lib/tiers'

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

interface Perk {
  id: string
  slot: number
  title: string
  description: string
}

export default function MemberDashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [member, setMember] = useState<MemberData | null>(null)
  const [store, setStore] = useState<StoreData | null>(null)
  const [rewards, setRewards] = useState<Reward[]>([])
  const [freePerks, setFreePerks] = useState<Perk[]>([])
  const [vipPerks, setVipPerks] = useState<Perk[]>([])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/member/me')
      if (res.status === 401) {
        router.replace('/member/login')
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
      setFreePerks(data.freePerks ?? [])
      setVipPerks(data.vipPerks ?? [])
      setLoading(false)
    }
    load()
  }, [router])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/member/login')
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

  if (!member) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-[#F5F5F8] px-6 text-center gap-4">
        <p className="text-[15px] font-semibold text-[#1A1A2E] max-w-xs leading-relaxed">
          Check your texts for a sign-in link to access your dashboard.
        </p>
        <button
          onClick={() => router.replace('/member/login')}
          className="w-full max-w-xs py-4 rounded-2xl font-bold text-[15px] font-['Montserrat'] bg-[#4A4B98] text-white active:scale-[0.97] transition-all"
        >
          Go to sign in
        </button>
      </div>
    )
  }

  const brandColor = store?.brandColor ?? '#4A4B98'
  const brandName = store?.brandName ?? 'BinPerks'
  const storeName = store?.storeName ?? 'BinPerks'

  if (member.isBlacklisted) {
    return (
      <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">
        <div className="px-5 py-3 flex items-center gap-2.5" style={{ backgroundColor: brandColor }}>
          <span className="font-['Coiny'] text-xl leading-none text-white">{brandName}</span>
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

  const tier = getTier(member.totalStamps)
  const cyclePos = cyclePosition(member.totalStamps)
  const remaining = stampsToNextCoupon(member.totalStamps)
  const progressPct = Math.min((cyclePos / 20) * 100, 100)

  const activeRewards = rewards.filter(r => r.status === 'earned')
  const pastRewards = rewards.filter(r => r.status !== 'earned')
  const isFree = member.subscriptionStatus === 'free'
  const hasUsedFreeLifetimeCoupon = isFree && pastRewards.some(r => r.status === 'redeemed')

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">

      {/* White-label header */}
      <div className="px-5 py-3 flex items-center gap-2.5" style={{ backgroundColor: brandColor }}>
        {store?.logoUrl ? (
          <div className="w-8 h-8 rounded-full bg-white overflow-hidden flex-shrink-0 shadow-sm">
            <Image
              src={store.logoUrl}
              alt={brandName}
              width={32}
              height={32}
              className="object-cover w-full h-full"
            />
          </div>
        ) : null}
        <span className="font-['Coiny'] text-xl leading-none text-white">{storeName}</span>
        <span className="text-white/50 text-[10px] font-semibold tracking-widest uppercase ml-auto">
          Powered by BinPerks
        </span>
      </div>

      <main className="flex-1 flex flex-col items-center px-4 py-7 gap-4 max-w-md mx-auto w-full">

        {/* Greeting + tier */}
        <div className="w-full flex flex-col items-center text-center gap-1.5">
          <h1 className="font-['Coiny'] text-2xl text-[#1A1A2E]">Hi, {member.firstName}</h1>
          <TierBadge totalStamps={member.totalStamps} />
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
          <div className="w-full mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-bold tracking-[0.06em] uppercase text-[#8E8EA8]">
                Toward next coupon
              </span>
              <span className="text-[13px] font-bold text-[#1A1A2E]">{cyclePos} / 20</span>
            </div>
            <div className="h-2 rounded-full bg-[#EBEBF2] overflow-hidden mb-2">
              <div
                className="h-full rounded-full bg-[#FFB217] transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-[12px] font-semibold text-[#8E8EA8]">
              <strong className="text-[#1A1A2E]">{remaining} more stamp{remaining !== 1 ? 's' : ''}</strong>
              {' '}to earn a <strong className="text-[#1A1A2E]">${tier.couponValue} coupon</strong>
            </p>
          </div>
        </div>

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
          </div>
        )}

        {/* Free-tier upgrade nudge */}
        {isFree && (
          <Link
            href="/member/upgrade"
            className="w-full rounded-2xl p-5 flex flex-col gap-2"
            style={{ backgroundColor: `${brandColor}12`, border: `1.5px solid ${brandColor}30` }}
          >
            <p className="font-['Coiny'] text-lg" style={{ color: brandColor }}>Keep earning with VIP</p>
            <p className="text-[12px] text-[#8E8EA8] font-medium leading-relaxed">
              {hasUsedFreeLifetimeCoupon
                ? "You've used your one lifetime Free coupon. Upgrade to VIP ($29.99/mo) to keep earning stamps and unlock bigger coupons."
                : 'Upgrade to VIP ($29.99/mo) to earn stamps faster and unlock bigger coupons.'}
            </p>
            <span className="text-[13px] font-bold mt-1" style={{ color: brandColor }}>See VIP perks</span>
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
                backgroundColor: copied ? '#2A7D34' : `${brandColor}15`,
                color: copied ? 'white' : brandColor,
              }}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Perks at this store */}
        {(freePerks.length > 0 || vipPerks.length > 0) && (
          <div className="w-full flex flex-col gap-2.5">
            <p className="text-[12px] font-bold tracking-[0.06em] uppercase text-[#8E8EA8] px-1">
              Perks at {brandName}
            </p>

            {/* Free perks — visible to all members */}
            {freePerks.map(p => (
              <div key={p.id} className="w-full bg-white rounded-2xl px-5 py-4 shadow-sm">
                <p className="text-[14px] font-bold text-[#1A1A2E]">{p.title}</p>
                {p.description && (
                  <p className="text-[12px] text-[#8E8EA8] font-medium mt-0.5 leading-relaxed">{p.description}</p>
                )}
              </div>
            ))}

            {/* VIP perks -- fully shown to VIP, grayed out for free members */}
            {vipPerks.map(p =>
              isFree ? (
                <div key={p.id} className="w-full bg-white rounded-2xl px-5 py-4 shadow-sm relative overflow-hidden">
                  <p className="text-[14px] font-bold text-[#D1D1DC]">{p.title}</p>
                  {p.description && (
                    <p className="text-[12px] text-[#D1D1DC] font-medium mt-0.5 leading-relaxed">{p.description}</p>
                  )}
                  <div className="absolute inset-0 flex items-center justify-end pr-4">
                    <span
                      className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                      style={{ backgroundColor: `${brandColor}18`, color: brandColor }}
                    >
                      VIP Only — Upgrade to unlock
                    </span>
                  </div>
                </div>
              ) : (
                <div key={p.id} className="w-full bg-white rounded-2xl px-5 py-4 shadow-sm">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded-full bg-[#4A4B98] text-white flex-shrink-0">
                      VIP
                    </span>
                    <p className="text-[14px] font-bold text-[#1A1A2E]">{p.title}</p>
                  </div>
                  {p.description && (
                    <p className="text-[12px] text-[#8E8EA8] font-medium mt-0.5 leading-relaxed">{p.description}</p>
                  )}
                </div>
              )
            )}
          </div>
        )}

        {/* Past coupons */}
        {pastRewards.length > 0 && (
          <div className="w-full flex flex-col gap-2">
            <p className="text-[12px] font-bold tracking-[0.06em] uppercase text-[#8E8EA8] px-1">
              Coupon history
            </p>
            {pastRewards.map(r => (
              <div key={r.id} className="w-full flex items-center justify-between px-1 py-1.5">
                <span className="text-[12px] font-semibold text-[#8E8EA8]">${r.couponValue} coupon</span>
                <span className="text-[11px] font-semibold text-[#D1D1DC] uppercase tracking-wide">{r.status}</span>
              </div>
            ))}
          </div>
        )}

        {/* Account links */}
        <div className="w-full grid grid-cols-2 gap-2.5 mt-1">
          <Link href="/member/feedback" className="flex flex-col items-center gap-1 py-3.5 rounded-2xl bg-white shadow-sm text-center">
            <span className="text-lg">💬</span>
            <span className="text-[11px] font-bold text-[#1A1A2E]">Feedback</span>
          </Link>
          <Link href="/member/settings" className="flex flex-col items-center gap-1 py-3.5 rounded-2xl bg-white shadow-sm text-center">
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
