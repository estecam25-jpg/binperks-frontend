'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import StoreHeader from '@/components/stamp/StoreHeader'
import TierBadge from '@/components/stamp/TierBadge'
import StampProgress from '@/components/stamp/StampProgress'
import { cashierSession, storeSession, foundMemberSession, type FoundMember } from '@/lib/stamp-session'
import { resolveTier, cyclePosition, stampsToNextCoupon } from '@/lib/tiers'

export default function MemberViewPage() {
  const router = useRouter()
  const [member, setMember] = useState<FoundMember | null>(null)
  const [store, setStore] = useState({ name: 'BinPerks', brandColor: '#4A4B98', logoUrl: null as string | null })
  const [refreshing, setRefreshing] = useState(true)

  useEffect(() => {
    const c = cashierSession.get()
    if (!c) { router.replace('/stamptool'); return }
    const s = storeSession.get()
    if (s) setStore({ name: s.name, brandColor: s.brandColor, logoUrl: s.logoUrl })
    const cached = foundMemberSession.get()
    if (!cached) { router.replace('/stamptool/lookup'); return }
    refreshMember(cached, c.storeId)
  }, [router]) // eslint-disable-line react-hooks/exhaustive-deps

  async function refreshMember(cached: FoundMember, storeId: string) {
    setRefreshing(true)
    const supabase = createClient()

    const [{ data: fresh }, todayVisitResult] = await Promise.all([
      supabase
        .from('members')
        // subscription_status is refetched rather than taken from the cached
        // lookup: it decides the tier and coupon value, and a member who
        // upgraded to VIP since the lookup should see that here.
        .select('total_stamps, coupon_due, is_blacklisted, subscription_status')
        .eq('id', cached.id)
        .single(),
      supabase
        .from('visits')
        .select('id')
        .eq('member_id', cached.id)
        .eq('store_id', storeId)
        .eq('date', new Date().toISOString().split('T')[0])
        .single(),
    ])

    if (!fresh) { router.replace('/stamptool/lookup'); return }
    if (fresh.is_blacklisted) { router.replace('/stamptool/lookup'); return }

    // resolveTier, not getTier: a free member is Starter with a $5 coupon no
    // matter how many stamps they have. getTier would say Bronze/$7.
    const tier = resolveTier(fresh.total_stamps, fresh.subscription_status)

    setMember({
      ...cached,
      totalStamps: fresh.total_stamps,
      subscriptionStatus: fresh.subscription_status,
      couponDue: fresh.coupon_due,
      couponValue: tier.couponValue,
      alreadyStampedToday: !!todayVisitResult.data,
    })
    setRefreshing(false)
  }

  function handleAwardStamp() {
    router.push('/stamptool/verify')
  }

  function handleReturnToLookup() {
    foundMemberSession.clear()
    router.push('/stamptool/lookup')
  }

  if (refreshing || !member) {
    return (
      <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">
        <StoreHeader storeName={store.name} brandColor={store.brandColor} logoUrl={store.logoUrl} />
        <div className="flex-1 flex items-center justify-center">
          <span className="w-8 h-8 border-[3px] border-[#EBEBF2] border-t-[#4A4B98] rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  const tier = resolveTier(member.totalStamps, member.subscriptionStatus)
  const cyclePos = cyclePosition(member.totalStamps)
  const remaining = stampsToNextCoupon(member.totalStamps)
  const filledDots = member.couponDue ? 20 : cyclePos

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">
      <StoreHeader storeName={store.name} brandColor={store.brandColor} logoUrl={store.logoUrl} />

      {member.couponDue && (
        <div className="bg-[#DA1212] px-5 py-3.5 flex items-center gap-3">
          <span className="text-2xl flex-shrink-0">🎟️</span>
          <div className="flex-1">
            <p className="text-[15px] font-bold text-white leading-tight">
              Active coupon — redeem before stamping
            </p>
            <p className="text-[12px] text-white/80 font-medium mt-0.5">
              Ask member to show this at checkout first
            </p>
          </div>
          <div className="bg-white text-[#DA1212] font-['Coiny'] text-2xl px-3 py-1 rounded-full flex-shrink-0 leading-tight">
            ${member.couponValue}
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col items-center px-4 py-5 gap-3.5">

        <div className="bg-white rounded-2xl px-5 py-5 w-full max-w-md shadow-sm flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-[#4A4B98] flex items-center justify-center font-['Coiny'] text-2xl text-white flex-shrink-0">
            {member.firstName[0]}{member.lastName[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[20px] font-bold text-[#1A1A2E] truncate">
              {member.firstName} {member.lastName}
            </p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <TierBadge totalStamps={member.totalStamps} subscriptionStatus={member.subscriptionStatus} />
            </div>
          </div>
        </div>

        {/* Shared with the member dashboard — see components/stamp/StampProgress. */}
        <div className="bg-white rounded-2xl px-5 py-5 w-full max-w-md shadow-sm">
          <StampProgress
            filled={filledDots}
            caption={member.couponDue ? (
              <><strong className="text-[#1A1A2E]">Coupon ready!</strong> Redeem before next stamp</>
            ) : (
              <><strong className="text-[#1A1A2E]">{remaining} more {remaining === 1 ? 'stamp' : 'stamps'}</strong> to earn a <strong className="text-[#1A1A2E]">${tier.couponValue} coupon</strong></>
            )}
          />
        </div>

        <div className="w-full max-w-md flex flex-col gap-2.5 mt-1">
          {member.alreadyStampedToday ? (
            <button
              disabled
              className="w-full py-5 rounded-2xl font-bold text-[18px] font-['Montserrat'] bg-[#EBEBF2] text-[#8E8EA8] cursor-not-allowed flex flex-col items-center gap-1"
            >
              <span>Already stamped today</span>
              <span className="text-[12px] font-medium text-[#8E8EA8]">
                {member.firstName} already received a stamp at this location today
              </span>
            </button>
          ) : (
            /* Matches the big blue primary button used across the tool —
               same width, radius, weight, size, font and press animation. The
               second line stays: when a coupon is due this single tap also
               redeems it, and dropping that warning would hide a consequence
               from the cashier. */
            <button
              onClick={handleAwardStamp}
              className="w-full py-[18px] rounded-2xl font-bold text-[17px] text-white font-['Montserrat'] tracking-wide bg-[#4A4B98] disabled:opacity-35 disabled:cursor-not-allowed active:scale-[0.97] transition-all flex flex-col items-center justify-center gap-1"
            >
              <span className="flex items-center gap-2">
                <span>🏷️</span>
                <span>{member.couponDue ? 'Stamp + Redeem Coupon' : 'Award Stamp'}</span>
              </span>
              <span className="text-[12px] font-medium text-white/80">
                {member.couponDue
                  ? `Awards stamp · redeems $${member.couponValue} coupon in one tap`
                  : `Tap to stamp ${member.firstName}'s card`
                }
              </span>
            </button>
          )}

          <button
            onClick={handleReturnToLookup}
            className="w-full py-4 rounded-2xl font-semibold text-[15px] text-[#8E8EA8] font-['Montserrat'] border-2 border-[#EBEBF2] active:border-[#4A4B98] active:text-[#4A4B98] transition-colors"
          >
            ← Return to Lookup
          </button>
        </div>
      </main>
    </div>
  )
}