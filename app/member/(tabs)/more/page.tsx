'use client'

/**
 * /member/more — the MORE tab.
 *
 * The full catalogue of admin-curated content: everything active, pinned or
 * not. Home shows only the pinned shortlist; this is where the rest lives, so
 * an item that is not pinned is still reachable rather than invisible.
 *
 * Both render the same BeyondSections component with different filters — see
 * that file.
 */

import AppHeader from '@/components/member/AppHeader'
import BeyondSections from '@/components/member/BeyondSections'

export default function MemberMorePage() {
  return (
    <>
      <AppHeader />

      <main className="flex-1 flex flex-col items-center px-4 py-5 gap-5 max-w-md mx-auto w-full">

        <div className="w-full px-1">
          <h1 className="font-['Coiny'] text-[26px] text-[#1A1A2E] leading-tight">
            Beyond the Bins
          </h1>
          <p className="text-[13px] text-[#8E8EA8] font-medium mt-1">
            Exclusive perks and deals from our partners
          </p>
        </div>

        {/* Everything active, and an empty section says so rather than
            vanishing — on a tab whose whole purpose is the full list, a missing
            heading reads as a bug. */}
        <BeyondSections pinnedOnly={false} showEmptySections />

        {/* Clears the fixed bottom nav — see the other tab screens. */}
        <div style={{ height: 'calc(80px + env(safe-area-inset-bottom))' }} aria-hidden="true" />
      </main>
    </>
  )
}
