'use client'

/**
 * One store in the Stores tab.
 *
 * Each PHYSICAL LOCATION is its own card — locations are never grouped under a
 * merchant brand, because a member visits a location, not a company.
 *
 * LAYOUT, top to bottom:
 *   name → key → city, state → the store's own message
 *   [ Directions ] [ Today's bin price ]
 *   [ What's in the Bins ] [ View Store Perks ]
 *   the open panel, if either button is on
 *
 * ONE PANEL AT A TIME. The two buttons are a pair, not two independent
 * toggles: opening one closes the other, and pressing the open one closes it.
 * A card that could show photos and perks stacked together would push the next
 * store most of a screen away.
 *
 * Today's bin price is real as of Phase 2A — resolved server-side in the
 * STORE's timezone, so a member in another zone still sees what they will
 * actually be charged.
 */

import { formatPrice, type TodayPrice } from '@/lib/store-pricing'

const BINPERKS_BLUE = '#4A4B98'

/** Which expandable section is showing. */
export type StorePanel = 'bins' | 'perks'

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
  /** True when the merchant has posted photos of current stock. Most stores
   *  have none, and the button is offered but inert rather than opening onto
   *  nothing. */
  hasBinPhotos?: boolean
  /**
   * The merchant's own note to members.
   *
   * Comes from the store LIST now, not the perks fetch. It sits in the card
   * header where it is read before anything is tapped, and the perks request
   * only happens on expand — so leaving it on that response would have meant a
   * message that only appeared after opening the panel it is no longer in.
   */
  storeMessage?: string | null
}

export default function StoreCard({
  store, openPanel, onTogglePanel, children, favorited, onToggleFavorite,
}: {
  store: StoreCardStore
  /** The section currently showing on this card, or null for collapsed. */
  openPanel: StorePanel | null
  onTogglePanel: (panel: StorePanel) => void
  /** The open panel's content, rendered by the caller. */
  children?: React.ReactNode
  /** Omitted where favouriting is not offered. */
  favorited?: boolean
  onToggleFavorite?: () => void
}) {
  const location = [store.city, store.state].filter(Boolean).join(', ')
  const message  = store.storeMessage?.trim()

  // The merchant's own Google Maps link is authoritative — they pasted the pin
  // for their exact unit. Falling back to a search by address, then by name and
  // city, which Google resolves well for a named business.
  const directionsHref = store.googleMapsUrl?.trim()
    ? store.googleMapsUrl.trim()
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        [store.address, store.displayName, store.city, store.state].filter(Boolean).join(' '),
      )}`

  // Three states, and they read differently on purpose:
  //   CLOSED   the merchant said so
  //   "—"      no price published yet — never "$0", which is a legitimate
  //            free-bin day
  //   a price  open
  const priceText = store.todayPrice.closed
    ? 'Closed today'
    : store.todayPrice.price !== null ? formatPrice(store.todayPrice.price) : '—'

  const priceColor = store.todayPrice.closed
    ? '#8E8EA8'
    : store.todayPrice.price !== null ? BINPERKS_BLUE : '#B0B0C8'

  const priceBg = store.todayPrice.closed
    ? '#EBEBF2'
    : store.todayPrice.price !== null ? `${BINPERKS_BLUE}12` : '#F5F5F8'

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

          {/* The store's own words, set in italic so they read as a quote from
              the merchant rather than another field. Nothing at all when
              unwritten — an empty line here would read as a store with
              nothing to say. */}
          {message && (
            <p className="text-[12px] italic text-[#8E8EA8] font-medium mt-1.5 leading-relaxed">
              {message}
            </p>
          )}
        </div>

        {/* Favourite. Its own button, not part of any panel toggle — tapping
            the heart must never also open a section. */}
        {onToggleFavorite && (
          <button
            onClick={onToggleFavorite}
            aria-pressed={!!favorited}
            aria-label={favorited
              ? `Remove ${store.displayName} from favourites`
              : `Save ${store.displayName} to favourites`}
            className="flex-shrink-0 -mt-1 -mr-1 w-9 h-9 flex items-center justify-center rounded-full active:bg-[#F5F5F8] transition-colors"
          >
            <span className="text-[19px] leading-none">{favorited ? '❤️' : '♡'}</span>
          </button>
        )}
      </div>

      {/* A special event today gets its name AND price, prominently — it is
          the reason to come in, so it outranks the price tile below. */}
      {store.todayPrice.isEvent && store.todayPrice.label && (
        <div className="px-4 pt-2.5">
          <span
            className="inline-block text-[12px] font-extrabold px-2.5 py-1 rounded-full"
            style={{ backgroundColor: '#DA121215', color: '#DA1212' }}
          >
            🎉 {store.todayPrice.label}
            {store.todayPrice.price !== null && ` — ${formatPrice(store.todayPrice.price)}`}
          </span>
        </div>
      )}

      {/* Row 1 — getting there, and what it costs today.
          The price sits in the button row but is NOT a button: it has nothing
          to do when pressed, and a control that does nothing is worse than a
          tile that never claimed to be one. It only matches the row's shape. */}
      <div className="grid grid-cols-2 gap-2 px-4 pt-3 items-stretch">
        <a
          href={directionsHref}
          target="_blank"
          rel="noopener noreferrer"
          className="py-2.5 px-3 rounded-xl text-[13px] font-bold text-center border-2 border-[#EBEBF2] text-[#1A1A2E] active:border-[#1A1A2E] transition-colors flex items-center justify-center"
        >
          Directions
        </a>

        <div
          className="py-1.5 px-3 rounded-xl flex flex-col items-center justify-center text-center"
          style={{ backgroundColor: priceBg }}
        >
          <p className="text-[9px] font-bold tracking-[0.08em] uppercase text-[#8E8EA8] leading-tight">
            Today&apos;s bin price
          </p>
          <p className="text-[13px] font-bold leading-tight mt-0.5" style={{ color: priceColor }}>
            {priceText}
          </p>
        </div>
      </div>

      {/* Row 2 — the two expandable sections. */}
      <div className="grid grid-cols-2 gap-2 px-4 pt-2 pb-3 items-stretch">
        <PanelButton
          label="What's in the Bins"
          active={openPanel === 'bins'}
          // Offered but inert when the merchant has posted nothing: the row
          // keeps its shape across every card, and pressing it cannot open an
          // empty panel. BinPhotoStrip renders null with no photos, so an
          // enabled button here would just appear to do nothing.
          disabled={!store.hasBinPhotos}
          disabledHint="No photos posted yet"
          onClick={() => onTogglePanel('bins')}
        />
        <PanelButton
          label="View Store Perks"
          active={openPanel === 'perks'}
          onClick={() => onTogglePanel('perks')}
        />
      </div>

      {openPanel && children && (
        <div className="px-4 pb-4 pt-1 border-t border-[#F0F0F5] flex flex-col gap-2.5">
          {children}
        </div>
      )}
    </div>
  )
}

/**
 * One of the two section toggles.
 *
 * Filled while its section is showing, outlined when it is not — with two
 * buttons side by side the fill is what says which one you are looking at, so
 * the label stays put instead of flipping to "Hide".
 */
function PanelButton({
  label, active, onClick, disabled = false, disabledHint,
}: {
  label: string
  active: boolean
  onClick: () => void
  disabled?: boolean
  disabledHint?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-expanded={active}
      title={disabled ? disabledHint : undefined}
      className={`py-2.5 px-2 rounded-xl text-[13px] font-bold text-center transition-colors leading-tight ${
        disabled
          ? 'border-2 border-[#EBEBF2] text-[#D1D1DC] cursor-not-allowed'
          : active
            ? 'text-white active:opacity-80'
            : 'border-2 border-[#EBEBF2] text-[#1A1A2E] active:border-[#1A1A2E]'
      }`}
      style={active && !disabled ? { backgroundColor: BINPERKS_BLUE } : undefined}
    >
      {label}
    </button>
  )
}
