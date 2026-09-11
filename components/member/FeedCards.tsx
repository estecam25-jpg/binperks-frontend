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

import Link from 'next/link'
import type {
  PromoCard, OnlineStore, Deal, BeyondBinsPartner,
} from '@/lib/member-mock-data'

const BINPERKS_BLUE = '#4A4B98'

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

/** Square placeholder standing in for imagery Phase 2 will supply. */
function ImagePlaceholder({ label, size = 'w-16 h-16' }: { label: string; size?: string }) {
  return (
    <div
      className={`${size} rounded-xl bg-[#F5F5F8] border border-[#EBEBF2] flex items-center justify-center flex-shrink-0`}
      aria-hidden="true"
    >
      <span className="text-[18px] opacity-40">{label}</span>
    </div>
  )
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
      <ImagePlaceholder label="🛍️" size="w-12 h-12" />
      <div className="min-w-0">
        <p className="text-[11px] font-bold tracking-[0.06em] uppercase text-[#8E8EA8] truncate">
          {store.storeName}
        </p>
        <p className="text-[14px] font-extrabold text-[#1A1A2E] leading-tight">{store.subtitle}</p>
        {store.description && (
          <p className="text-[12px] font-medium text-[#8E8EA8] mt-1 leading-snug">{store.description}</p>
        )}
      </div>
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
      <div
        className="w-12 h-12 rounded-xl bg-[#FFB21725] flex items-center justify-center flex-shrink-0"
        aria-hidden="true"
      >
        <span className="text-[20px]">📍</span>
      </div>
      <div className="min-w-0">
        <p className="text-[14px] font-extrabold text-[#1A1A2E] leading-tight">{deal.name}</p>
        <p className="text-[12px] font-medium text-[#8E8EA8] mt-0.5">{deal.location}</p>
        {deal.description && (
          <p className="text-[12px] font-medium text-[#8E8EA8] mt-1 leading-snug">{deal.description}</p>
        )}
      </div>
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
      <ImagePlaceholder label="🤝" size="w-12 h-12" />
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
