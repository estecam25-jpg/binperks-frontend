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
 *  them to content and the row stops looking like a carousel. */
const CARD_W = 'w-[248px] flex-shrink-0'

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
          <p className="text-[12px] font-medium text-white/85 leading-relaxed flex-1">{p.body}</p>
          {p.href ? (
            <Link
              href={p.href}
              className="self-start mt-1 px-3.5 py-1.5 rounded-full bg-white text-[12px] font-bold"
              style={{ color: p.accent }}
            >
              {p.cta}
            </Link>
          ) : (
            <span className="self-start mt-1 px-3.5 py-1.5 rounded-full bg-white/90 text-[12px] font-bold" style={{ color: p.accent }}>
              {p.cta}
            </span>
          )}
        </article>
      ))}
    </FeedCarousel>
  )
}

// ── Shop From Home ───────────────────────────────────────────────────────────

export function OnlineStoreCard({ store }: { store: OnlineStore }) {
  return (
    <CardShell
      href={store.href}
      className={`${CARD_W} bg-white rounded-2xl px-4 py-4 shadow-sm flex flex-col gap-2`}
    >
      <ImagePlaceholder label="🛍️" size="w-12 h-12" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold tracking-[0.06em] uppercase text-[#8E8EA8] truncate">
          {store.storeName}
        </p>
        <p className="text-[14px] font-extrabold text-[#1A1A2E] leading-tight">{store.featuredProduct}</p>
        <p className="text-[12px] font-medium text-[#8E8EA8] mt-0.5">{store.platform}</p>
      </div>
      <span className="text-[12px] font-bold" style={{ color: BINPERKS_BLUE }}>
        {store.cta} ›
      </span>
    </CardShell>
  )
}

// ── Deals Near You ───────────────────────────────────────────────────────────

export function DealCard({ deal }: { deal: Deal }) {
  const body = (
    <>
      <div
        className="w-12 h-12 rounded-xl bg-[#FFB21725] flex items-center justify-center flex-shrink-0"
        aria-hidden="true"
      >
        <span className="text-[20px]">📅</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-extrabold text-[#1A1A2E] leading-tight">{deal.name}</p>
        <p className="text-[12px] font-medium text-[#8E8EA8] mt-0.5">{deal.location}</p>
        {deal.date && (
          <p className="text-[12px] font-bold mt-0.5" style={{ color: BINPERKS_BLUE }}>{deal.date}</p>
        )}
      </div>
    </>
  )
  // Admin-managed rows may carry a link; the built-in fallback copy does not.
  return (
    <CardShell
      href={deal.href}
      className={`${CARD_W} bg-white rounded-2xl px-4 py-4 shadow-sm flex flex-col gap-2`}
    >
      {body}
    </CardShell>
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
