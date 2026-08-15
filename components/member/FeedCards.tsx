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
  PromoCard, StorePromo, Find, OnlineStore, LocalEvent, BeyondBinsPartner,
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

// ── Deals Near You ───────────────────────────────────────────────────────────

export function StorePromoCard({ deal }: { deal: StorePromo }) {
  return (
    <article className="w-full bg-white rounded-2xl px-4 py-4 shadow-sm flex items-center gap-3.5">
      <div
        className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center font-['Coiny'] text-lg text-white"
        style={{ backgroundColor: deal.brandColor }}
        aria-hidden="true"
      >
        {deal.storeName.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold tracking-[0.06em] uppercase text-[#8E8EA8] truncate">
          {deal.storeName}
        </p>
        <p className="text-[14px] font-extrabold text-[#1A1A2E] leading-tight">{deal.dealTitle}</p>
        <p className="text-[12px] font-medium text-[#8E8EA8] mt-0.5 leading-snug">{deal.detail}</p>
      </div>
      <span className="text-[12px] font-bold flex-shrink-0" style={{ color: BINPERKS_BLUE }}>
        {deal.cta} ›
      </span>
    </article>
  )
}

// ── My Finds ─────────────────────────────────────────────────────────────────

export function FindCard({ find }: { find: Find }) {
  return (
    <article className="w-full bg-white rounded-2xl px-4 py-4 shadow-sm flex items-start gap-3.5">
      <ImagePlaceholder label="📦" />
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-bold text-[#1A1A2E] leading-snug">{find.itemName}</p>
        <p className="text-[13px] font-bold mt-1" style={{ color: BINPERKS_BLUE }}>
          {find.estimatedRetail}
        </p>
        <p className="text-[11px] font-medium text-[#8E8EA8] mt-0.5">
          {find.storeName} · {find.scannedAt}
        </p>
      </div>
    </article>
  )
}

// ── Shop From Home ───────────────────────────────────────────────────────────

export function OnlineStoreCard({ store }: { store: OnlineStore }) {
  return (
    <article className={`${CARD_W} bg-white rounded-2xl px-4 py-4 shadow-sm flex flex-col gap-2`}>
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
    </article>
  )
}

// ── Happening Near You ───────────────────────────────────────────────────────

export function LocalEventCard({ event }: { event: LocalEvent }) {
  return (
    <article className={`${CARD_W} bg-white rounded-2xl px-4 py-4 shadow-sm flex flex-col gap-2`}>
      <div
        className="w-12 h-12 rounded-xl bg-[#FFB21725] flex items-center justify-center flex-shrink-0"
        aria-hidden="true"
      >
        <span className="text-[20px]">📅</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-extrabold text-[#1A1A2E] leading-tight">{event.name}</p>
        <p className="text-[12px] font-medium text-[#8E8EA8] mt-0.5">{event.location}</p>
        <p className="text-[12px] font-bold mt-0.5" style={{ color: BINPERKS_BLUE }}>{event.date}</p>
      </div>
    </article>
  )
}

// ── Beyond the Bins ──────────────────────────────────────────────────────────

export function BeyondBinsCard({ partner }: { partner: BeyondBinsPartner }) {
  return (
    <article className={`${CARD_W} bg-white rounded-2xl px-4 py-4 shadow-sm flex flex-col gap-2`}>
      <ImagePlaceholder label="🤝" size="w-12 h-12" />
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-extrabold text-[#1A1A2E] leading-tight">{partner.partner}</p>
        <p className="text-[12px] font-medium text-[#8E8EA8] mt-0.5 leading-snug">{partner.description}</p>
      </div>
      <span className="text-[12px] font-bold" style={{ color: BINPERKS_BLUE }}>
        {partner.cta} ›
      </span>
    </article>
  )
}
