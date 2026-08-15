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
  FeedSection, PromoCarousel, FeedCarousel,
  OnlineStoreCard, DealCard, BeyondBinsCard,
} from '@/components/member/FeedCards'
import { useFeedContent } from '@/lib/use-feed-content'

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

  // Admin-managed content, with the built-in copy as a per-section fallback so
  // the feed is never an empty shell. See lib/use-feed-content.
  const feed = useFeedContent()

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
            Live content from the admin content tables, falling back to the
            built-in copy per section while they are still being filled in. */}

        {/* The "Upgrade to VIP" card is filtered out for members who already
            subscribe — selling someone what they already pay for. Filtered by
            id rather than by title so re-wording the copy cannot quietly switch
            it back on. */}
        <FeedSection title="BinPerks Promos">
          <PromoCarousel
            promos={feed.promos.filter(
              p => !(p.id === 'promo-vip' && member?.subscriptionStatus === 'vip'),
            )}
          />
        </FeedSection>

        <FeedSection title="Shop From Home" subtitle="Buy from BinPerks stores online">
          <FeedCarousel>
            {feed.shopFromHome.map(s => <OnlineStoreCard key={s.id} store={s} />)}
          </FeedCarousel>
        </FeedSection>

        <FeedSection title="Deals Near You" subtitle="Flea markets, estate sales and garage sales">
          <FeedCarousel>
            {feed.deals.map(d => <DealCard key={d.id} deal={d} />)}
          </FeedCarousel>
        </FeedSection>

        <FeedSection title="Beyond the Bins" subtitle="Tools and partners for resellers">
          <FeedCarousel>
            {feed.beyondBins.map(p => <BeyondBinsCard key={p.id} partner={p} />)}
          </FeedCarousel>
        </FeedSection>


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
