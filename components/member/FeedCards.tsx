'use client'

/**
 * Home feed cards.
 *
 * Every component here renders placeholder content today — see
 * lib/member-mock-data. They are real components with real layout so Phase 2
 * swaps the data source without redesigning anything: each takes a typed item
 * prop and renders it.
 *
 * Grouped in one file because they share a card idiom; splitting them into six
 * files would spread that idiom out for no benefit.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type {
  PromoCard, OnlineStore, Deal, BeyondBinsPartner,
} from '@/lib/member-mock-data'

const BINPERKS_BLUE = '#4A4B98'

/** How long a touch has to be held before the card gives up its text. Short
 *  enough not to feel broken, long enough that a scroll flick does not fire
 *  it. */
const HOLD_MS = 350

/**
 * Every reveal box is a square.
 *
 * DERIVED FROM THE WIDTH, not a fixed height. It was 250px, which held the
 * row even but meant the box was a different shape on every surface — a
 * 248px carousel tile gave a portrait box, a full-width store card a
 * landscape one, and artwork cropped differently in each. An aspect ratio is
 * the same shape everywhere and still cannot grow with its copy, which is
 * what the fixed height was there for: a description too long for the box
 * scrolls inside it rather than pushing the card taller than its neighbours.
 */
const REVEAL_SHAPE = 'aspect-square'

/** Section wrapper — heading plus an optional "for you" subtitle. */
export function FeedSection({
  title, subtitle, children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="w-full flex flex-col gap-2.5">
      <div className="px-1">
        <h2 className="text-[15px] font-extrabold text-[#1A1A2E] tracking-tight">{title}</h2>
        {subtitle && (
          <p className="text-[12px] font-medium text-[#8E8EA8] mt-0.5">{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  )
}

/**
 * A card's artwork, sitting over its text until the member asks to see it.
 *
 * HOVER on a mouse, PRESS AND HOLD on a touch screen — both routed through
 * pointer events, which report which kind of input they came from, so one
 * handler set covers both without sniffing the user agent. A phone fires
 * pointerenter on tap too, which is why the reveal is gated on pointerType
 * rather than taken from enter alone.
 *
 * The hold timer is what keeps a scroll flick from stripping the image off
 * every card it passes under.
 *
 * RENDERS ITS CHILDREN EITHER WAY. Callers wrap the text block in this only
 * when a row has an image; the text is always in the DOM, so a screen reader
 * reads it whether or not the picture is currently over it.
 *
 * The image is pointer-events-none so the wrapper keeps receiving the gesture,
 * and the long-press callout is suppressed — holding to read a description
 * should not offer to save the picture.
 */
export function RevealBox({
  cover, children, maxSize,
}: {
  /** What sits on top until the member asks to see through it — an image on a
   *  feed card, a logo or an initials tile on a store card. */
  cover: React.ReactNode
  children: React.ReactNode
  /** Caps the box in px and centres it, for a surface where a full-width
   *  square is more picture than the card wants — Bin Stores Near Me, where
   *  the logo is a thumbnail beside the store's name rather than the point of
   *  the card. Capping the WIDTH is what keeps it square: the height comes
   *  from the width, so a max-height alone would flatten it. */
  maxSize?: number
}) {
  const [revealed, setRevealed] = useState(false)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearHold() {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null }
  }

  // A card can unmount mid-hold when the feed reloads; a timer left running
  // would set state on a component that is gone.
  useEffect(() => clearHold, [])

  /** Put the cover back. Named for what it does, not what it is — `cover`
   *  is the prop holding the thing being put back. */
  function hide() { clearHold(); setRevealed(false) }

  return (
    <div
      className={`relative ${REVEAL_SHAPE} w-full rounded-xl overflow-hidden select-none`}
      style={{ WebkitTouchCallout: 'none', maxWidth: maxSize, marginInline: maxSize ? 'auto' : undefined }}
      onPointerEnter={e => { if (e.pointerType === 'mouse') setRevealed(true) }}
      onPointerLeave={hide}
      onPointerDown={e => {
        if (e.pointerType === 'mouse') return
        clearHold()
        holdTimer.current = setTimeout(() => setRevealed(true), HOLD_MS)
      }}
      onPointerUp={hide}
      onPointerCancel={hide}
      onContextMenu={e => e.preventDefault()}
    >
      {/* The revealed side, filling the box. It scrolls rather than pushing
          the box taller — the fixed height is the whole point. */}
      <div className="absolute inset-0 overflow-y-auto bg-white">
        {children}
      </div>

      <div
        aria-hidden={revealed}
        className="absolute inset-0 pointer-events-none transition-opacity duration-300 ease-out"
        style={{ opacity: revealed ? 0 : 1 }}
      >
        {cover}
      </div>
    </div>
  )
}

/** The cover an image makes: fills the box, cropped rather than squashed. */
export function CoverImage({ src, alt }: { src: string; alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      draggable={false}
      className="w-full h-full object-cover"
    />
  )
}

/** Wraps `body` in the reveal when the row has artwork, and returns it
 *  untouched when it does not — so a card with no image keeps exactly the
 *  markup it had before images existed. */
export function withReveal(image: string | null | undefined, alt: string, body: React.ReactNode) {
  return image
    ? <RevealBox cover={<CoverImage src={image} alt={alt} />}>{body}</RevealBox>
    : body
}

// ── Horizontal carousel ──────────────────────────────────────────────────────

/**
 * The scroll track every Home feed section uses.
 *
 * Extracted from PromoCarousel so all four sections scroll identically rather
 * than each re-implementing the classes. The negative margin lets cards bleed
 * to the screen edge while the padding keeps the first one aligned with the
 * section heading; the page itself never scrolls sideways.
 */
export function FeedCarousel({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full overflow-x-auto -mx-4 px-4 pb-1">
      <div className="flex gap-3 w-max">{children}</div>
    </div>
  )
}

/**
 * Card shell that becomes a link when the row carries a URL.
 *
 * Module scope, not a component built inside the render: defining a component
 * during render gives it a new identity every time, so React unmounts and
 * remounts the whole card on each pass.
 */
function CardShell({
  href, className, children,
}: {
  href?: string | null
  className: string
  children: React.ReactNode
}) {
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>
    : <article className={className}>{children}</article>
}

/** Shared card width — cards in a track must be a fixed width, or flex sizes
 *  them to content and the row stops looking like a carousel. Exported so the
 *  Sponsored Perks card in BeyondSections matches rather than guesses. */
export const CARD_W = 'w-[248px] flex-shrink-0'

/**
 * The one CTA button every feed card carries.
 *
 * Full width, BinPerks blue, white text, and reading "Learn More" unless the
 * row supplies its own label. A member scanning the feed finds the same control
 * in the same place on every card instead of a different word and shape per
 * section.
 *
 * RENDERS NOTHING WITHOUT A URL. A button that goes nowhere is worse than no
 * button, so an unlinked row simply ends after its text.
 *
 * mt-auto pins it to the bottom of the card: cards in a track stretch to the
 * tallest one, and without this the buttons sit at ragged heights.
 */
export function CtaButton({
  href, label, onAccent,
}: {
  href?: string | null
  label?: string | null
  /** True on promo cards, which paint their own background — possibly this
   *  exact blue. The hairline keeps the button from disappearing into it. */
  onAccent?: boolean
}) {
  if (!href) return null

  const className =
    'block w-full mt-auto text-center px-4 py-2.5 rounded-xl text-[13px] font-bold ' +
    'text-white active:opacity-80 transition-opacity'
  const style = {
    backgroundColor: BINPERKS_BLUE,
    border: onAccent ? '1px solid rgba(255,255,255,0.45)' : undefined,
  }
  const text = label?.trim() || 'Learn More'

  // An in-app path stays in the app; an external one opens in a new tab so the
  // member does not lose their place in the feed.
  return href.startsWith('/')
    ? <Link href={href} className={className} style={style}>{text}</Link>
    : <a href={href} target="_blank" rel="noopener noreferrer" className={className} style={style}>{text}</a>
}

export function PromoCarousel({ promos }: { promos: PromoCard[] }) {
  return (
    <FeedCarousel>
      {promos.map(p => (
        <article
          key={p.id}
          className={`${CARD_W} rounded-2xl px-4 py-4 flex flex-col gap-2 shadow-sm`}
          style={{ backgroundColor: p.accent }}
        >
          <h3 className="text-[15px] font-extrabold text-white leading-tight">{p.title}</h3>
          {p.body && (
            <p className="text-[12.5px] font-semibold text-white/90 leading-snug">{p.body}</p>
          )}
          {p.description && (
            <p className="text-[12px] font-medium text-white/80 leading-relaxed">{p.description}</p>
          )}
          <CtaButton href={p.href} onAccent />
        </article>
      ))}
    </FeedCarousel>
  )
}

// ── Shop From Home ───────────────────────────────────────────────────────────

/** An article, not a CardShell link: the card now ends in a real CTA button,
 *  and an anchor inside an anchor is invalid markup that browsers unnest in
 *  their own ways. The button is the link. */
export function OnlineStoreCard({ store }: { store: OnlineStore }) {
  return (
    <article className={`${CARD_W} bg-white rounded-2xl px-4 py-4 shadow-sm flex flex-col gap-2`}>
      {/* No icon tile. The artwork is the picture now, and a card without one
          leads with its text rather than a generic emoji square. */}
      {withReveal(store.image, store.storeName, (
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-[0.06em] uppercase text-[#8E8EA8] truncate">
            {store.storeName}
          </p>
          <p className="text-[14px] font-extrabold text-[#1A1A2E] leading-tight">{store.subtitle}</p>
          {store.description && (
            <p className="text-[12px] font-medium text-[#8E8EA8] mt-1 leading-snug">{store.description}</p>
          )}
        </div>
      ))}
      <CtaButton href={store.href} />
    </article>
  )
}

// ── Deals Near You ───────────────────────────────────────────────────────────

/** No date line. These are standing listings now, and the card ends in the
 *  shared CTA button — so, like the Shop From Home card, it is an article with
 *  one link inside rather than a link wrapping one. */
export function DealCard({ deal }: { deal: Deal }) {
  return (
    <article className={`${CARD_W} bg-white rounded-2xl px-4 py-4 shadow-sm flex flex-col gap-2`}>
      {withReveal(deal.image, deal.name, (
        <div className="min-w-0">
          <p className="text-[14px] font-extrabold text-[#1A1A2E] leading-tight">{deal.name}</p>
          <p className="text-[12px] font-medium text-[#8E8EA8] mt-0.5">{deal.location}</p>
          {deal.description && (
            <p className="text-[12px] font-medium text-[#8E8EA8] mt-1 leading-snug">{deal.description}</p>
          )}
        </div>
      ))}
      <CtaButton href={deal.href} />
    </article>
  )
}

// ── Beyond the Bins ──────────────────────────────────────────────────────────

export function BeyondBinsCard({ partner }: { partner: BeyondBinsPartner }) {
  return (
    <CardShell
      href={partner.href}
      className={`${CARD_W} bg-white rounded-2xl px-4 py-4 shadow-sm flex flex-col gap-2`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-extrabold text-[#1A1A2E] leading-tight">{partner.partner}</p>
        <p className="text-[12px] font-medium text-[#8E8EA8] mt-0.5 leading-snug">{partner.description}</p>
      </div>
      <span className="text-[12px] font-bold" style={{ color: BINPERKS_BLUE }}>
        {partner.cta} ›
      </span>
    </CardShell>
  )
}
