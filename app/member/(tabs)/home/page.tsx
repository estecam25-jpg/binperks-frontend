'use client'

/**
 * /member/home — the Home tab.
 *
 * Real data: the membership stamp card, from /api/member/me.
 * Everything below it is placeholder feed content — see lib/member-mock-data.
 *
 * No Home Store selector here by design: the membership is with the network,
 * and the Origin Store is an attribution record the member cannot change.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppHeader from '@/components/member/AppHeader'
import GreetingCard from '@/components/member/GreetingCard'
import AddToHomeScreen from '@/components/member/AddToHomeScreen'
import MembershipStampCard from '@/components/member/MembershipStampCard'
import {
  FeedSection, PromoCarousel, StorePromoCard, FindCard,
  OnlineStoreCard, LocalEventCard, BeyondBinsCard,
} from '@/components/member/FeedCards'
import {
  MOCK_PROMOS, MOCK_STORE_DEALS, MOCK_FINDS,
  MOCK_ONLINE_STORES, MOCK_EVENTS, MOCK_BEYOND_BINS,
} from '@/lib/member-mock-data'

interface MemberData {
  firstName: string
  subscriptionStatus: 'free' | 'vip'
  totalStamps: number
  couponDue: boolean
}

export default function MemberHomePage() {
  const router = useRouter()
  const [member, setMember] = useState<MemberData | null>(null)
  const [loading, setLoading] = useState(true)

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

  return (
    <>
      {/* MOCK DATA — connect to real API in Phase 2 (unread alert count). */}
      <AppHeader unreadCount={1} />

      <main className="flex-1 flex flex-col items-center px-4 py-5 gap-5 max-w-md mx-auto w-full">

        {/* Renders nothing once dismissed, when already installed, or on
            desktop — see components/member/AddToHomeScreen. */}
        <AddToHomeScreen />

        {loading ? (
          <>
            <div className="w-full h-8 rounded-xl bg-white animate-pulse" />
            <div className="w-full h-64 rounded-2xl bg-white animate-pulse" />
          </>
        ) : member ? (
          <>
            <GreetingCard firstName={member.firstName} />
            <MembershipStampCard
              totalStamps={member.totalStamps}
              subscriptionStatus={member.subscriptionStatus}
              couponDue={member.couponDue}
            />
          </>
        ) : (
          <div className="w-full bg-white rounded-2xl py-12 px-6 text-center">
            <p className="text-[14px] font-semibold text-[#8E8EA8]">
              Couldn&apos;t load your membership. Pull to refresh, or email{' '}
              <a href="mailto:support@binperks.com" className="underline text-[#4A4B98]">
                support@binperks.com
              </a>.
            </p>
          </div>
        )}

        {/* ── Feed ──
            MOCK DATA — connect to real API in Phase 2. Each section below
            renders from lib/member-mock-data; swapping in a fetch does not
            change any markup. */}

        <FeedSection title="BinPerks Promos">
          <PromoCarousel promos={MOCK_PROMOS} />
        </FeedSection>

        <FeedSection title="Deals Near You" subtitle="Offers at stores in the network">
          <div className="flex flex-col gap-2.5">
            {MOCK_STORE_DEALS.map(d => <StorePromoCard key={d.id} deal={d} />)}
          </div>
        </FeedSection>

        <FeedSection title="My Finds" subtitle="Items you've scanned">
          <div className="flex flex-col gap-2.5">
            {MOCK_FINDS.map(f => <FindCard key={f.id} find={f} />)}
          </div>
        </FeedSection>

        <FeedSection title="Shop From Home" subtitle="Buy from BinPerks stores online">
          <div className="flex flex-col gap-2.5">
            {MOCK_ONLINE_STORES.map(s => <OnlineStoreCard key={s.id} store={s} />)}
          </div>
        </FeedSection>

        <FeedSection title="Happening Near You">
          <div className="flex flex-col gap-2.5">
            {MOCK_EVENTS.map(e => <LocalEventCard key={e.id} event={e} />)}
          </div>
        </FeedSection>

        <FeedSection title="Beyond the Bins" subtitle="Tools and partners for resellers">
          <div className="flex flex-col gap-2.5">
            {MOCK_BEYOND_BINS.map(p => <BeyondBinsCard key={p.id} partner={p} />)}
          </div>
        </FeedSection>

      </main>
    </>
  )
}
