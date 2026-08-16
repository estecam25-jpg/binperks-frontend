'use client'

/**
 * One store in the Stores tab.
 *
 * Each PHYSICAL LOCATION is its own card — locations are never grouped under a
 * merchant brand, because a member visits a location, not a company.
 *
 * Today's bin price is real as of Phase 2A — resolved server-side in the
 * STORE's timezone, so a member in another zone still sees what they will
 * actually be charged. Distance is still a placeholder: no coordinates are
 * stored and there is no GPS yet.
 */

import { formatPrice, type TodayPrice } from '@/lib/store-pricing'

const BINPERKS_BLUE = '#4A4B98'

export interface StoreCardStore {
  id: string
  canonicalKey: string
  displayName: string
  brandName: string
  city: string
  state: string
  brandColor: string
  /** Always present. Read `closed` and `price` — see lib/store-pricing. */
  todayPrice: TodayPrice
  /** The merchant's own Google Maps link, when they have set one. */
  googleMapsUrl?: string | null
  address?: string | null
  /** Still returned by the API and still used to order the list — it is just
   *  no longer labelled on the card. */
  isOriginStore: boolean
}

export default function StoreCard({
  store, expanded, onToggle, children,
}: {
  store: StoreCardStore
  expanded: boolean
  onToggle: () => void
  /** Store detail (perks, message), rendered when expanded. */
  children?: React.ReactNode
}) {
  const location = [store.city, store.state].filter(Boolean).join(', ')

  // The merchant's own Google Maps link is authoritative — they pasted the pin
  // for their exact unit. Falling back to a search by address, then by name and
  // city, which Google resolves well for a named business.
  const directionsHref = store.googleMapsUrl?.trim()
    ? store.googleMapsUrl.trim()
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        [store.address, store.displayName, store.city, store.state].filter(Boolean).join(' '),
      )}`

  return (
    <div className="w-full bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-start gap-3.5 px-4 pt-4">
        {/* Brand mark — the store's own colour, initial as a logo stand-in
            until logo_url is exposed to members. */}
        <div
          className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center font-['Coiny'] text-lg text-white"
          style={{ backgroundColor: store.brandColor }}
          aria-hidden="true"
        >
          {(store.brandName || store.displayName).charAt(0)}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-extrabold text-[#1A1A2E] leading-tight">
            {store.displayName}
          </p>
          <p className="text-[10px] font-medium text-[#B0B0C8] tracking-wide truncate">
            {store.canonicalKey}
          </p>
          {location && (
            <p className="text-[12px] text-[#8E8EA8] font-medium mt-0.5">{location}</p>
          )}
        </div>
      </div>

      {/* Distance is still MOCK — no coordinates in the schema. Price is real. */}
      <div className="grid grid-cols-2 gap-2 px-4 pt-3">
        <div className="rounded-xl bg-[#F5F5F8] px-3 py-2">
          <p className="text-[9px] font-bold tracking-[0.08em] uppercase text-[#8E8EA8]">Distance</p>
          <p className="text-[12px] font-bold text-[#B0B0C8] mt-0.5">Coming soon</p>
        </div>
        {/* Three states, and they read differently on purpose:
              CLOSED       the merchant said so
              "—"          no price published yet — never "$0", which is a
                           legitimate free-bin day
              a price      open */}
        <div
          className="rounded-xl px-3 py-2"
          style={{
            backgroundColor: store.todayPrice.closed
              ? '#EBEBF2'
              : store.todayPrice.price !== null ? `${BINPERKS_BLUE}12` : '#F5F5F8',
          }}
        >
          <p className="text-[9px] font-bold tracking-[0.08em] uppercase text-[#8E8EA8]">
            Today&apos;s bin price
          </p>
          <p
            className="text-[12px] font-bold mt-0.5"
            style={{
              color: store.todayPrice.closed
                ? '#8E8EA8'
                : store.todayPrice.price !== null ? BINPERKS_BLUE : '#B0B0C8',
            }}
          >
            {store.todayPrice.closed
              ? 'Closed today'
              : store.todayPrice.price !== null ? formatPrice(store.todayPrice.price) : '—'}
          </p>
        </div>
      </div>

      {/* A special event today gets its name AND price, prominently — it is
          the reason to come in, so it outranks the price tile above. */}
      {store.todayPrice.isEvent && store.todayPrice.label && (
        <div className="px-4 pt-2">
          <span
            className="inline-block text-[12px] font-extrabold px-2.5 py-1 rounded-full"
            style={{ backgroundColor: '#DA121215', color: '#DA1212' }}
          >
            🎉 {store.todayPrice.label}
            {store.todayPrice.price !== null && ` — ${formatPrice(store.todayPrice.price)}`}
          </span>
        </div>
      )}

      <div className="flex gap-2 px-4 py-3">
        <a
          href={directionsHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-center border-2 border-[#EBEBF2] text-[#1A1A2E] active:border-[#1A1A2E] transition-colors"
        >
          Directions
        </a>
        <button
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-white active:opacity-80 transition-opacity"
          style={{ backgroundColor: BINPERKS_BLUE }}
        >
          {expanded ? 'Hide Perks' : 'View Perks'}
        </button>
      </div>

      {expanded && children && (
        <div className="px-4 pb-4 pt-1 border-t border-[#F0F0F5] flex flex-col gap-2.5">
          {children}
        </div>
      )}
    </div>
  )
}
