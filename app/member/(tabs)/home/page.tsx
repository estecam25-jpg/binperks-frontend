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
import BeyondSections from '@/components/member/BeyondSections'

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
      {/* No unreadCount: there is no alerts backend, and passing a literal 1
          here is what gave every member a permanent unread dot. */}
      <AppHeader />

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

        {/* ── Beyond the Bins ──
            PINNED items only. A section with nothing pinned is hidden
            entirely, so Home stays a curated shortlist rather than the full
            catalogue — that lives on the MORE tab. */}
        <BeyondSections pinnedOnly showEmptySections={false} />

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
