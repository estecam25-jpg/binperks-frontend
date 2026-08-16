'use client'

/**
 * My Finds — the member's own scan history, inside the Scan tab.
 *
 * Every scan is a find. There is no manual save step: the "Save to My Finds"
 * button was removed because the history is automatic.
 *
 * PHOTOS are the member's OWN, served through short-lived signed URLs minted
 * per request. Scans from before photo storage existed have none and fall back
 * to a category tile, so history stays readable rather than half-broken.
 *
 * A signed URL can expire while this list is open, so a failed image load falls
 * back to the tile too rather than leaving a torn thumbnail.
 */

import { useCallback, useEffect, useState } from 'react'

const BINPERKS_BLUE = '#4A4B98'

type Range = 'week' | 'month' | 'all'

const RANGES: { id: Range; label: string }[] = [
  { id: 'week',  label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'all',   label: 'All Time' },
]

interface Find {
  id: string
  product: string | null
  category: string | null
  estimatedRetail: string | null
  scannedAt: string
  storeName: string | null
  /** Fresh signed URL, or null for scans taken before photo storage. */
  photoUrl: string | null
}

/** "Aug 15" for this year, "Aug 15, 2025" otherwise. */
function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/** A glyph per broad category, so the tile is not the same box every row. */
function categoryGlyph(category: string | null): string {
  const c = (category ?? '').toLowerCase()
  if (/toy|game|children|costume/.test(c))          return '🧸'
  if (/kitchen|dining|drinkware|cook/.test(c))      return '🍳'
  if (/camera|electronic|tech|audio|phone/.test(c)) return '🔌'
  if (/cloth|apparel|shoe|wear/.test(c))            return '👕'
  if (/beauty|cosmetic|health|personal/.test(c))    return '🧴'
  if (/tool|hardware|garden|auto/.test(c))          return '🔧'
  if (/home|decor|furnitur|bed|bath/.test(c))       return '🏠'
  if (/book|media|music/.test(c))                   return '📚'
  if (/sport|outdoor|fitness/.test(c))              return '⚽'
  if (/pet/.test(c))                                return '🐾'
  return '📦'
}

export default function MyFinds({ onBack }: { onBack: () => void }) {
  const [range, setRange]   = useState<Range>('all')
  const [finds, setFinds]   = useState<Find[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [failed, setFailed] = useState(false)
  // Derived: loading exactly while what is on screen is not this range yet.
  // Storing it would mean a setState in the effect body.
  const [loadedFor, setLoadedFor] = useState<Range | null>(null)
  const loading = loadedFor !== range

  const [loadingMore, setLoadingMore] = useState(false)

  /** Photos whose signed URL failed to load — expired, or removed. Falls back
   *  to the category tile rather than showing a broken image. */
  const [failedPhotos, setFailedPhotos] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    fetch(`/api/member/my-finds?range=${range}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled) return
        if (d) { setFinds(d.finds ?? []); setHasMore(!!d.hasMore); setFailed(false) }
        else setFailed(true)
        setLoadedFor(range)
      })
      .catch(() => { if (!cancelled) { setFailed(true); setLoadedFor(range) } })
    return () => { cancelled = true }
  }, [range])

  const loadMore = useCallback(async () => {
    setLoadingMore(true)
    const res = await fetch(`/api/member/my-finds?range=${range}&offset=${finds.length}`)
    if (res.ok) {
      const d = await res.json()
      setFinds(prev => [...prev, ...(d.finds ?? [])])
      setHasMore(!!d.hasMore)
    }
    setLoadingMore(false)
  }, [range, finds.length])

  return (
    <>
      <div className="flex rounded-xl bg-white p-1 shadow-sm" role="group" aria-label="Time range">
        {RANGES.map(r => (
          <button
            key={r.id}
            onClick={() => setRange(r.id)}
            aria-pressed={range === r.id}
            className="flex-1 py-2 rounded-lg text-[12px] font-bold transition-colors"
            style={range === r.id
              ? { backgroundColor: BINPERKS_BLUE, color: '#fff' }
              : { color: '#8E8EA8' }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map(i => <div key={i} className="h-20 rounded-2xl bg-white animate-pulse" />)}
        </div>
      ) : failed ? (
        <div className="w-full bg-white rounded-2xl px-5 py-10 shadow-sm text-center">
          <p className="text-[14px] font-semibold text-[#8E8EA8]">
            Couldn&apos;t load your finds. Pull to refresh.
          </p>
        </div>
      ) : finds.length === 0 ? (
        <div className="w-full bg-white rounded-2xl px-5 py-12 shadow-sm flex flex-col items-center gap-3">
          <span className="text-4xl">🏷️</span>
          <p className="text-[14px] font-semibold text-[#8E8EA8] text-center leading-relaxed">
            {range === 'all'
              ? 'No finds yet. Start scanning to build your history.'
              : 'Nothing scanned in this period yet.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {finds.map(f => (
            <article key={f.id} className="w-full bg-white rounded-2xl px-4 py-3.5 shadow-sm flex items-start gap-3.5">
              {/* The member's own photo when there is one, else the tile. */}
              {f.photoUrl && !failedPhotos.has(f.id) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={f.photoUrl}
                  alt={f.product ?? 'Scanned item'}
                  onError={() => setFailedPhotos(prev => new Set(prev).add(f.id))}
                  // Not loading="lazy": an offscreen lazy image never requests,
                  // so onError never fires and an expired URL would leave a gap
                  // where the tile should have been.
                  decoding="async"
                  className="w-14 h-14 rounded-xl object-cover bg-[#F5F5F8] border border-[#EBEBF2] flex-shrink-0"
                />
              ) : (
                <div
                  className="w-14 h-14 rounded-xl bg-[#F5F5F8] border border-[#EBEBF2] flex items-center justify-center flex-shrink-0"
                  aria-hidden="true"
                >
                  <span className="text-[22px]">{categoryGlyph(f.category)}</span>
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold text-[#1A1A2E] leading-snug">
                  {f.product ?? 'Unidentified item'}
                </p>
                {f.category && (
                  <p className="text-[11px] font-semibold text-[#8E8EA8] mt-0.5 truncate">
                    {f.category}
                  </p>
                )}
                {f.estimatedRetail && (
                  <p className="text-[13px] font-bold mt-1" style={{ color: BINPERKS_BLUE }}>
                    {f.estimatedRetail}
                  </p>
                )}
                <p className="text-[11px] font-medium text-[#B0B0C8] mt-1">
                  {[f.storeName, formatDate(f.scannedAt)].filter(Boolean).join(' · ')}
                </p>
              </div>
            </article>
          ))}

          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full py-3 rounded-xl font-bold text-[13px] bg-white border-2 border-[#EBEBF2] disabled:opacity-60"
              style={{ color: BINPERKS_BLUE }}
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      )}

      <button
        onClick={onBack}
        className="w-full py-3.5 rounded-xl font-bold text-[14px] text-[#1A1A2E] bg-white border-2 border-[#EBEBF2] active:scale-[0.98] transition-transform"
      >
        Back
      </button>
    </>
  )
}
