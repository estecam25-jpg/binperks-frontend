'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import StoreCard from '@/components/member/StoreCard'
import type { TodayPrice } from '@/lib/store-pricing'

/**
 * Store finder — the body of /member/stores.
 *
 * A BinPerks membership works across the network, so this lists every
 * location a member can visit rather than only the one they enrolled
 * through. Their Origin Store is first and labelled.
 *
 * Lives on its own page rather than inside the dashboard: browsing the
 * network is a distinct errand from checking your stamps, and it pushed
 * everything below it off the first screen.
 *
 * Perks load lazily when a store is expanded, and are cached per store for
 * the life of the page — reopening a card does not re-fetch.
 */

const BINPERKS_BLUE = '#4A4B98'

/** Debounce on the search box. Long enough to skip most keystrokes, short
 *  enough that results feel attached to typing. */
const SEARCH_DEBOUNCE_MS = 250

interface Store {
  id: string
  canonicalKey: string
  displayName: string
  brandName: string
  city: string
  state: string
  brandColor: string
  /** Resolved by the API in the store's timezone. null = no price published. */
  todayPrice: TodayPrice | null
  restocksToday: boolean
  isOriginStore: boolean
}

interface Perk {
  id: string
  slot: number
  title: string
  description: string
}

interface PerkData {
  freePerks: Perk[]
  vipPerks: Perk[]
  /** Store-authored note. Null when the store hasn't written one, in which
   *  case the whole Store Message section is omitted. */
  storeMessage: string | null
}

export default function StoreFinder({ isFree }: { isFree: boolean }) {
  const [query, setQuery]       = useState('')
  /** Only 'All Stores' is selectable until Phase 2 adds location + favourites. */
  const [filter, setFilter]     = useState<'Near Me' | 'Favorites' | 'All Stores'>('All Stores')
  const [stores, setStores]     = useState<Store[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(false)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [perks, setPerks]           = useState<Record<string, PerkData>>({})
  const [perksLoading, setPerksLoading] = useState<string | null>(null)
  const [perksError, setPerksError]     = useState<string | null>(null)

  // Guards against a slow early request overwriting a newer one.
  const requestSeq = useRef(0)

  const loadStores = useCallback(async (q: string) => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(`/api/member/stores?q=${encodeURIComponent(q)}`)
      if (seq !== requestSeq.current) return
      if (!res.ok) { setError(true); setStores([]); return }
      const data = await res.json()
      setStores(data.stores ?? [])
    } catch {
      if (seq === requestSeq.current) { setError(true); setStores([]) }
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => loadStores(query.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query, loadStores])

  async function toggleStore(store: Store) {
    if (expandedId === store.id) { setExpandedId(null); return }

    setExpandedId(store.id)
    setPerksError(null)

    if (perks[store.id]) return   // cached from a previous expand

    setPerksLoading(store.id)
    try {
      const res = await fetch(`/api/member/stores/${store.id}/perks`)
      if (!res.ok) { setPerksError(store.id); return }
      const data = await res.json()
      setPerks(prev => ({
        ...prev,
        [store.id]: {
          freePerks:    data.freePerks ?? [],
          vipPerks:     data.vipPerks ?? [],
          storeMessage: data.storeMessage ?? null,
        },
      }))
    } catch {
      setPerksError(store.id)
    } finally {
      setPerksLoading(null)
    }
  }

  return (
    <div className="w-full flex flex-col gap-2.5">

      {/* Filters. "All Stores" is the only one backed by data today — the
          other two need member location and a favourites table.
          MOCK DATA — connect to real API in Phase 2. */}
      <div className="flex gap-2" role="tablist" aria-label="Store filters">
        {(['Near Me', 'Favorites', 'All Stores'] as const).map(f => {
          const active = f === filter
          const enabled = f === 'All Stores'
          return (
            <button
              key={f}
              role="tab"
              aria-selected={active}
              disabled={!enabled}
              onClick={() => enabled && setFilter(f)}
              title={enabled ? undefined : 'Coming soon'}
              className={`flex-1 py-2 rounded-full text-[12px] font-bold transition-colors ${
                active
                  ? 'text-white'
                  : enabled
                    ? 'bg-white text-[#1A1A2E] border border-[#EBEBF2]'
                    : 'bg-white text-[#D1D1DC] border border-[#EBEBF2] cursor-not-allowed'
              }`}
              style={active ? { backgroundColor: BINPERKS_BLUE } : undefined}
            >
              {f}
            </button>
          )
        })}
      </div>

      {/* Search */}
      <input
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search by store name or city"
        aria-label="Search BinPerks stores by name or city"
        className="w-full px-4 py-3.5 rounded-2xl border-2 border-transparent bg-white font-['Montserrat'] text-[14px] font-semibold text-[#1A1A2E] outline-none transition-colors placeholder:text-[#D1D1DC] placeholder:font-medium focus:border-[#4A4B98]"
      />

      {loading && (
        <div className="bg-white rounded-2xl px-5 py-8 flex items-center justify-center shadow-sm">
          <span className="w-6 h-6 border-[3px] border-[#EBEBF2] border-t-[#4A4B98] rounded-full animate-spin" />
        </div>
      )}

      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
          <p className="text-[13px] font-semibold text-[#DA1212]">
            We couldn&apos;t load stores right now.{' '}
            <button onClick={() => loadStores(query.trim())} className="underline">
              Try again
            </button>
          </p>
        </div>
      )}

      {!loading && !error && stores.length === 0 && (
        <div className="bg-white rounded-2xl px-5 py-6 text-center shadow-sm">
          <p className="text-[14px] text-[#8E8EA8] font-medium">
            {query.trim()
              ? `No BinPerks stores match "${query.trim()}".`
              : 'No stores available right now.'}
          </p>
        </div>
      )}

      {!loading && !error && stores.map(store => {
        const isExpanded = expandedId === store.id
        const data = perks[store.id]

        return (
          <StoreCard
            key={store.id}
            store={store}
            expanded={isExpanded}
            onToggle={() => toggleStore(store)}
          >
            <>

                {perksLoading === store.id && (
                  <div className="py-5 flex items-center justify-center">
                    <span className="w-5 h-5 border-[3px] border-[#EBEBF2] border-t-[#4A4B98] rounded-full animate-spin" />
                  </div>
                )}

                {perksError === store.id && (
                  <p className="text-[13px] font-semibold text-[#DA1212] py-3">
                    Couldn&apos;t load this store&apos;s details.
                  </p>
                )}

                {data && data.freePerks.length === 0 && data.vipPerks.length === 0 && !data.storeMessage && (
                  <p className="text-[13px] text-[#8E8EA8] font-medium py-3">
                    This store hasn&apos;t published its perks yet.
                  </p>
                )}

                {/* ── Starter Member Perks ── */}
                {data && data.freePerks.length > 0 && (
                  <section className="pt-3 flex flex-col gap-2.5">
                    <h3 className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#8E8EA8]">
                      Starter Member Perks
                    </h3>
                    {data.freePerks.map(p => (
                      <div key={p.id}>
                        <p className="text-[14px] font-bold text-[#1A1A2E]">{p.title}</p>
                        {p.description && (
                          <p className="text-[12px] text-[#8E8EA8] font-medium mt-1 leading-relaxed">
                            {p.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </section>
                )}

                {/* ── VIP Member Perks ──
                    Shown to Starter members too, greyed — they're the reason
                    to upgrade, so hiding them would defeat the point. */}
                {data && data.vipPerks.length > 0 && (
                  <section className="pt-3 flex flex-col gap-2.5">
                    <h3 className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#8E8EA8]">
                      VIP Member Perks
                    </h3>
                    {data.vipPerks.map(p => (
                      <div key={p.id}>
                        <p className={`text-[14px] font-bold ${isFree ? 'text-[#D1D1DC]' : 'text-[#1A1A2E]'}`}>
                          {p.title}
                        </p>
                        {p.description && (
                          <p className={`text-[12px] font-medium mt-1 leading-relaxed ${isFree ? 'text-[#D1D1DC]' : 'text-[#8E8EA8]'}`}>
                            {p.description}
                          </p>
                        )}
                      </div>
                    ))}
                    {isFree && (
                      <p className="text-[11px] font-semibold" style={{ color: BINPERKS_BLUE }}>
                        Upgrade to VIP to unlock these.
                      </p>
                    )}
                  </section>
                )}

                {/* ── Store Message ── Omitted entirely when the store hasn't
                    written one. */}
                {data?.storeMessage && (
                  <section className="pt-3 flex flex-col gap-1.5">
                    <h3 className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#8E8EA8]">
                      Store Message
                    </h3>
                    <p className="text-[13px] font-medium text-[#1A1A2E] leading-relaxed">
                      {data.storeMessage}
                    </p>
                  </section>
                )}
            </>
          </StoreCard>
        )
      })}

      <p className="text-[11px] text-[#8E8EA8] font-medium px-1 leading-relaxed">
        Your stamps and coupons work at every participating BinPerks location.
      </p>
    </div>
  )
}
