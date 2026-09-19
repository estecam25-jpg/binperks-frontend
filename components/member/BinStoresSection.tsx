'use client'

/**
 * "Bin Stores Near Me" — every participating location, on Home.
 *
 * NOT ADMIN-CURATED. Unlike the Beyond the Bins sections below it, this is the
 * store table itself: any store that is active and network_visible appears,
 * with no row for anyone to pin, order or forget to add. A new merchant going
 * live shows up here the moment their store is visible.
 *
 * ALPHABETICAL BY NAME, which is the only order a member can predict. The
 * /api/member/stores response is ordered for the store finder (Origin Store
 * first, then canonical_key), so it is re-sorted here rather than asking that
 * route to serve two orderings.
 *
 * NEAR ME IS ASPIRATIONAL, as on the Stores tab: no coordinates are stored and
 * there is no GPS, so this is every store rather than the closest ones. The
 * heading matches the filter the Stores tab already offers under that name.
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { FeedSection, FeedCarousel, RevealBox, CoverImage, CARD_W } from './FeedCards'

const BINPERKS_BLUE = '#4A4B98'

interface Store {
  id: string
  displayName: string
  brandName: string
  brandColor: string
  logoUrl: string | null
  storeMessage: string | null
}

/** Up to two initials, the same stand-in the Stores tab uses for a store with
 *  no logo — a letter in the store's own colour reads as a brand mark, where
 *  an empty grey square reads as a broken image. */
function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()
}

/** The tile behind the reveal: the store's logo, or its initials. */
function StoreMark({ store }: { store: Store }) {
  if (store.logoUrl) {
    return <CoverImage src={store.logoUrl} alt={`${store.displayName} logo`} />
  }
  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{ backgroundColor: store.brandColor }}
    >
      <span className="font-['Coiny'] text-[44px] text-white leading-none">
        {initials(store.brandName || store.displayName)}
      </span>
    </div>
  )
}

function StoreCard({ store }: { store: Store }) {
  const message = store.storeMessage?.trim()

  const mark = <StoreMark store={store} />

  return (
    <article className={`${CARD_W} bg-white rounded-2xl px-4 py-4 shadow-sm flex flex-col gap-2`}>
      {/* With a message the mark becomes the cover and holding reveals the
          words underneath. Without one there is nothing to reveal, so the mark
          is drawn plainly in a box of the same height — the row stays even
          either way. */}
      {message ? (
        <RevealBox cover={mark}>
          <div className="p-3">
            <p className="text-[12px] font-medium text-[#8E8EA8] leading-relaxed">{message}</p>
          </div>
        </RevealBox>
      ) : (
        <div className="relative aspect-square w-full rounded-xl overflow-hidden">{mark}</div>
      )}

      <p className="text-[14px] font-extrabold text-[#1A1A2E] leading-tight">
        {store.displayName}
      </p>

      {/* One destination for every card: the Stores tab, where the member gets
          the price, the perks and the directions. A per-store deep link would
          be a second way into a screen that already lists them all. */}
      <Link
        href="/member/stores"
        className="block w-full mt-auto text-center px-4 py-2.5 rounded-xl text-[13px] font-bold text-white active:opacity-80 transition-opacity"
        style={{ backgroundColor: BINPERKS_BLUE }}
      >
        View Store
      </Link>
    </article>
  )
}

export default function BinStoresSection() {
  const [stores, setStores] = useState<Store[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/member/stores')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled) return
        const rows = Array.isArray(d?.stores) ? d.stores as Store[] : []
        setStores(
          [...rows].sort((a, b) =>
            a.displayName.localeCompare(b.displayName, 'en', { sensitivity: 'base' })),
        )
      })
      .catch(() => { /* the section hides itself; Home carries on */ })
      .finally(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [])

  if (!loaded) return <div className="w-full h-28 rounded-2xl bg-white animate-pulse" />
  // No visible stores is a network with nothing to show, not a section worth
  // a heading — same rule the pinned Beyond the Bins sections follow on Home.
  if (stores.length === 0) return null

  return (
    <FeedSection title="Bin Stores Near Me">
      <FeedCarousel>
        {stores.map(s => <StoreCard key={s.id} store={s} />)}
      </FeedCarousel>
    </FeedSection>
  )
}
