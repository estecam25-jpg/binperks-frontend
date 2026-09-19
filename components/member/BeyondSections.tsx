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
import {
  FeedSection, FeedCarousel, PromoCarousel, OnlineStoreCard, DealCard, CtaButton,
  CARD_W, withReveal,
} from './FeedCards'
import type { PromoCard, OnlineStore, Deal } from '@/lib/member-mock-data'

const BINPERKS_BLUE = '#4A4B98'

type Row = Record<string, unknown>
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

interface Partner {
  id: string
  partner_name: string
  description: string
  cta_label: string | null
  cta_url: string | null
  /** Signed URL for the card's 1:1 artwork, or null. */
  image: string | null
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

/**
 * Sponsored perk card.
 *
 * A carousel tile at the shared card width, not the full-width stack it used to
 * be: it sits among Shop From Home and Deals Near You, and one section scrolling
 * sideways while its neighbour grows downwards made a member scroll two
 * different ways through what is one row of sponsors.
 */
function PartnerCard({ p }: { p: Partner }) {
  return (
    <article className={`${CARD_W} bg-white rounded-2xl px-4 py-4 shadow-sm flex flex-col gap-2`}>
      {withReveal(p.image, p.partner_name, (
        <div className="min-w-0">
          <p className="text-[14px] font-extrabold text-[#1A1A2E] leading-tight">{p.partner_name}</p>
          <p className="text-[12px] font-medium text-[#8E8EA8] mt-1 leading-snug">{p.description}</p>
        </div>
      ))}
      <CtaButton href={p.cta_url} label={p.cta_label} />
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
  showGroupHeader = true,
}: {
  /** Home passes true; the MORE tab passes false. */
  pinnedOnly: boolean
  /** Home hides empty sections; MORE shows "Check back soon." instead. */
  showEmptySections: boolean
  /**
   * The "Beyond the Bins" heading over the three subsections.
   *
   * Home needs it — these sections sit among others there. The MORE tab is
   * already titled "Beyond the Bins" in its own page header, so rendering it
   * again put the same words twice on one screen, directly above Shop From
   * Home. That tab passes false.
   */
  showGroupHeader?: boolean
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
          subtitle: str(r.subtitle),
          description: str(r.description_text) || null,
          href: str(r.cta_url) || null,
          // Signed by /api/member/content; image_path itself never reaches here.
          image: str(r.image_url) || null,
        })),
        deals: deals.map(r => ({
          id: str(r.id), name: str(r.event_name),
          location: [str(r.event_type), str(r.location)].filter(Boolean).join(' · '),
          description: str(r.description) || null,
          href: str(r.cta_url) || null,
          image: str(r.image_url) || null,
        })),
        partners: partners.map(r => ({
          id: str(r.id), partner_name: str(r.partner_name),
          description: str(r.description),
          cta_label: str(r.cta_label) || null,
          cta_url: str(r.cta_url) || null,
          image: str(r.image_url) || null,
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

  const body = (
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
              <FeedCarousel>
                {partners.map(p => <PartnerCard key={p.id} p={p} />)}
              </FeedCarousel>
            ))}
          </>
        )}
    </div>
  )

  return showGroupHeader
    ? <FeedSection title="Beyond the Bins">{body}</FeedSection>
    // Without the heading the sections still need the section element's
    // spacing, or they butt against whatever the page put above them.
    : <section className="w-full flex flex-col gap-2.5">{body}</section>
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
        description: str(r.description) || null,
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
