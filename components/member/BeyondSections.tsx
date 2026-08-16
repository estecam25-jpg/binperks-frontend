'use client'

/**
 * "Beyond the Bins" — the admin-curated partner sections.
 *
 * ONE component for both places it appears, differing only in what it lets
 * through:
 *   Home     — pinned items only, and a section with none is hidden entirely.
 *   MORE tab — every active item, and an empty section says "Check back soon."
 *
 * Two copies would have drifted the first time a section was added, and the
 * section order is the same promise to the reader in both places.
 *
 * BinPerks Promos is NOT here. It is BinPerks talking about itself, not a
 * partner, and it belongs on Home alone — see PromosSection below, which Home
 * renders as its own standalone block above this one.
 *
 * NO MOCK FALLBACK. An empty section on Home simply does not render, which is
 * a better answer than inventing partners and deals that no admin approved —
 * these carry BinPerks' name to real businesses.
 */

import { useEffect, useState } from 'react'
import { FeedSection, FeedCarousel, PromoCarousel, OnlineStoreCard, DealCard } from './FeedCards'
import type { PromoCard, OnlineStore, Deal } from '@/lib/member-mock-data'

const BINPERKS_BLUE = '#4A4B98'

type Row = Record<string, unknown>
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

/** "2026-09-01" → "Sep 1". Dates are optional. */
function shortDate(v: unknown): string {
  const raw = str(v)
  if (!raw) return ''
  const d = new Date(`${raw}T00:00:00`)
  return Number.isNaN(d.getTime())
    ? raw
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

interface Partner {
  id: string
  partner_name: string
  description: string
  cta_label: string | null
  cta_url: string | null
}

interface Content {
  shop: OnlineStore[]
  deals: Deal[]
  partners: Partner[]
}

const EMPTY: Content = { shop: [], deals: [], partners: [] }

async function load(slug: string, pinnedOnly: boolean): Promise<Row[]> {
  try {
    const res = await fetch(`/api/member/content/${slug}${pinnedOnly ? '?pinned=true' : ''}`)
    if (!res.ok) return []
    const d = await res.json()
    return Array.isArray(d.items) ? d.items as Row[] : []
  } catch {
    return []
  }
}

/** Sponsored partner card. Its own markup rather than BeyondBinsCard's, because
 *  this one is a full-width row with a real CTA button, not a carousel tile. */
function PartnerCard({ p }: { p: Partner }) {
  return (
    <article className="w-full bg-white rounded-2xl px-5 py-4 shadow-sm flex flex-col gap-2">
      <p className="text-[15px] font-extrabold text-[#1A1A2E] leading-tight">{p.partner_name}</p>
      <p className="text-[13px] font-medium text-[#8E8EA8] leading-relaxed">{p.description}</p>
      {/* Only when there is somewhere to send them — a dead CTA is worse than none. */}
      {p.cta_url && (
        <a
          href={p.cta_url}
          target="_blank"
          rel="noopener noreferrer"
          className="self-start mt-1 px-4 py-2 rounded-xl text-[13px] font-bold text-white active:opacity-80 transition-opacity"
          style={{ backgroundColor: BINPERKS_BLUE }}
        >
          {p.cta_label?.trim() || 'Learn more'}
        </a>
      )}
    </article>
  )
}

function Subheader({ title }: { title: string }) {
  return (
    <h3 className="text-[14px] font-extrabold text-[#1A1A2E] px-1 mt-1">{title}</h3>
  )
}

function ComingSoon() {
  return (
    <p className="text-[13px] font-medium text-[#8E8EA8] px-1 py-2">Check back soon.</p>
  )
}

export default function BeyondSections({
  pinnedOnly,
  showEmptySections,
}: {
  /** Home passes true; the MORE tab passes false. */
  pinnedOnly: boolean
  /** Home hides empty sections; MORE shows "Check back soon." instead. */
  showEmptySections: boolean
}) {
  const [content, setContent] = useState<Content>(EMPTY)
  // Derived, so nothing calls setState in the effect body.
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false

    Promise.all([
      load('shop-from-home', pinnedOnly),
      load('deals-near-you', pinnedOnly),
      load('beyond-the-bins', pinnedOnly),
    ]).then(([shop, deals, partners]) => {
      if (cancelled) return
      setContent({
        shop: shop.map(r => ({
          id: str(r.id), storeName: str(r.store_name),
          featuredProduct: str(r.product_title), platform: str(r.platform),
          cta: 'Shop', href: str(r.cta_url) || null,
        })),
        deals: deals.map(r => ({
          id: str(r.id), name: str(r.event_name),
          location: [str(r.event_type), str(r.location)].filter(Boolean).join(' · '),
          date: shortDate(r.event_date), href: str(r.cta_url) || null,
        })),
        partners: partners.map(r => ({
          id: str(r.id), partner_name: str(r.partner_name),
          description: str(r.description),
          cta_label: str(r.cta_label) || null,
          cta_url: str(r.cta_url) || null,
        })),
      })
      setLoaded(true)
    })

    return () => { cancelled = true }
  }, [pinnedOnly])

  const { shop, deals, partners } = content
  const anything = shop.length || deals.length || partners.length

  // Nothing at all, and Home is not meant to show empty sections — render the
  // whole block away rather than leaving a bare heading behind.
  if (loaded && !anything && !showEmptySections) return null

  /** A subsection renders its content, or "Check back soon.", or nothing. */
  const section = (title: string, count: number, body: React.ReactNode) => {
    if (count === 0 && !showEmptySections) return null
    return (
      <div key={title} className="w-full flex flex-col gap-2">
        <Subheader title={title} />
        {count === 0 ? <ComingSoon /> : body}
      </div>
    )
  }

  return (
    <FeedSection title="Beyond the Bins">
      <div className="w-full flex flex-col gap-3">
        {!loaded ? (
          <div className="h-28 rounded-2xl bg-white animate-pulse" />
        ) : (
          <>
            {section('Shop From Home', shop.length, (
              <FeedCarousel>
                {shop.map(s => <OnlineStoreCard key={s.id} store={s} />)}
              </FeedCarousel>
            ))}

            {section('Deals Near You', deals.length, (
              <FeedCarousel>
                {deals.map(d => <DealCard key={d.id} deal={d} />)}
              </FeedCarousel>
            ))}

            {section('Sponsored Perks', partners.length, (
              <div className="flex flex-col gap-2.5">
                {partners.map(p => <PartnerCard key={p.id} p={p} />)}
              </div>
            ))}
          </>
        )}
      </div>
    </FeedSection>
  )
}

/**
 * BinPerks Promos — HOME ONLY, and standalone.
 *
 * Not part of Beyond the Bins: that header groups PARTNER content, and a promo
 * is BinPerks talking about itself. Grouping them implied a sponsorship
 * relationship that does not exist.
 *
 * Pinned only, and renders nothing at all when there are none — a bare heading
 * over an empty carousel is worse than no section.
 */
export function PromosSection() {
  const [promos, setPromos] = useState<PromoCard[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    load('promos', true).then(rows => {
      if (cancelled) return
      setPromos(rows.map(r => ({
        id: str(r.id),
        title: str(r.title),
        body: str(r.subtitle),
        cta: str(r.cta_label) || 'Learn more',
        href: str(r.cta_url) || null,
        accent: str(r.bg_color) || BINPERKS_BLUE,
      })))
      setLoaded(true)
    })
    return () => { cancelled = true }
  }, [])

  if (!loaded) return <div className="w-full h-28 rounded-2xl bg-white animate-pulse" />
  if (promos.length === 0) return null

  return (
    <FeedSection title="BinPerks Promos">
      <PromoCarousel promos={promos} />
    </FeedSection>
  )
}
