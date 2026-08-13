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
  /** null when the merchant has published no price for today. Not $0. */
  todayPrice: TodayPrice | null
  restocksToday: boolean
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

  // No street address is stored, so Directions searches by name and city.
  // Google resolves that to the right pin for a named business.
  const directionsQuery = encodeURIComponent(
    [store.displayName, store.city, store.state].filter(Boolean).join(' '),
  )

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
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-[15px] font-extrabold text-[#1A1A2E] leading-tight">
              {store.displayName}
            </p>
            {store.isOriginStore && (
              <span
                className="text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: `${BINPERKS_BLUE}15`, color: BINPERKS_BLUE }}
              >
                Your store
              </span>
            )}
          </div>
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
        <div
          className="rounded-xl px-3 py-2"
          style={{ backgroundColor: store.todayPrice ? `${BINPERKS_BLUE}12` : '#F5F5F8' }}
        >
          <p className="text-[9px] font-bold tracking-[0.08em] uppercase text-[#8E8EA8]">Today&apos;s bin price</p>
          {/* "—" for null, never "$0" — an unset price is not a free one. */}
          <p
            className="text-[12px] font-bold mt-0.5"
            style={{ color: store.todayPrice ? BINPERKS_BLUE : '#B0B0C8' }}
          >
            {store.todayPrice ? formatPrice(store.todayPrice.price) : '—'}
          </p>
        </div>
      </div>

      {(store.todayPrice?.label || store.restocksToday) && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-2">
          {store.todayPrice?.label && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: '#DA121215', color: '#DA1212' }}
            >
              {store.todayPrice.label}
            </span>
          )}
          {store.restocksToday && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: '#FFB21725', color: '#8A5A00' }}
            >
              Restocks today
            </span>
          )}
        </div>
      )}

      <div className="flex gap-2 px-4 py-3">
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${directionsQuery}`}
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
          {expanded ? 'Hide Store' : 'View Store'}
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
