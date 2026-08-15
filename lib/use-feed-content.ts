'use client'

/**
 * Home-feed content, from the admin-managed tables with a built-in fallback.
 *
 * Each section falls back to lib/member-mock-data when the API returns nothing,
 * so the feed never renders as an empty shell while BinPerks is still filling
 * the tables in. Once a section has real rows, the fallback stops being used
 * for that section only — they are independent.
 *
 * The mapping from column names to card props lives here rather than in the
 * components, so the cards stay presentational and the admin schema can change
 * without touching them.
 */

import { useEffect, useState } from 'react'
import {
  MOCK_PROMOS, MOCK_ONLINE_STORES, MOCK_DEALS, MOCK_BEYOND_BINS,
  type PromoCard, type OnlineStore, type Deal, type BeyondBinsPartner,
} from '@/lib/member-mock-data'

type Row = Record<string, unknown>

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v))

/** "2026-08-15" → "Aug 15". Dates are optional, so an absent one yields ''. */
function shortDate(v: unknown): string {
  const raw = str(v)
  if (!raw) return ''
  const d = new Date(`${raw}T00:00:00`)
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export interface FeedContent {
  promos: PromoCard[]
  shopFromHome: OnlineStore[]
  deals: Deal[]
  beyondBins: BeyondBinsPartner[]
}

const FALLBACK: FeedContent = {
  promos: MOCK_PROMOS,
  shopFromHome: MOCK_ONLINE_STORES,
  deals: MOCK_DEALS,
  beyondBins: MOCK_BEYOND_BINS,
}

async function load(slug: string): Promise<Row[]> {
  try {
    const res = await fetch(`/api/member/content/${slug}`)
    if (!res.ok) return []
    const d = await res.json()
    return Array.isArray(d.items) ? d.items as Row[] : []
  } catch {
    return []
  }
}

export function useFeedContent(): FeedContent {
  const [content, setContent] = useState<FeedContent>(FALLBACK)

  useEffect(() => {
    let cancelled = false

    Promise.all([
      load('promos'),
      load('shop-from-home'),
      load('deals-near-you'),
      load('beyond-the-bins'),
    ]).then(([promos, shop, deals, beyond]) => {
      if (cancelled) return

      setContent({
        promos: promos.length === 0 ? MOCK_PROMOS : promos.map(r => ({
          id:     str(r.id),
          title:  str(r.title),
          body:   str(r.subtitle),
          cta:    str(r.cta_label) || 'Learn more',
          href:   str(r.cta_url) || null,
          accent: str(r.bg_color) || '#4A4B98',
        })),

        shopFromHome: shop.length === 0 ? MOCK_ONLINE_STORES : shop.map(r => ({
          id:              str(r.id),
          storeName:       str(r.store_name),
          featuredProduct: str(r.product_title),
          platform:        str(r.platform),
          cta:             'Shop',
          href:            str(r.cta_url) || null,
        })),

        deals: deals.length === 0 ? MOCK_DEALS : deals.map(r => ({
          id:       str(r.id),
          // event_type reads as a subtitle on the card, so it is folded into
          // the location line rather than given a row of its own.
          name:     str(r.event_name),
          location: [str(r.event_type), str(r.location)].filter(Boolean).join(' · '),
          date:     shortDate(r.event_date),
          href:     str(r.cta_url) || null,
        })),

        beyondBins: beyond.length === 0 ? MOCK_BEYOND_BINS : beyond.map(r => ({
          id:          str(r.id),
          partner:     str(r.partner_name),
          description: str(r.description),
          cta:         str(r.cta_label) || 'Learn more',
          href:        str(r.cta_url) || null,
        })),
      })
    })

    return () => { cancelled = true }
  }, [])

  return content
}
