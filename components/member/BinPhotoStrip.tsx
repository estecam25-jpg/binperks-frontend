'use client'

/**
 * "What's In The Bins" — the merchant's photos of current stock, shown at the
 * top of a store's View Perks panel.
 *
 * HIDDEN ENTIRELY WHEN EMPTY. Most stores will not have uploaded anything, and
 * an empty-state box on every one of those would be a permanent apology in the
 * highest-value slot on the panel. No photos, no section.
 *
 * Photos arrive as short-lived signed URLs minted per request. One that expires
 * while the panel is open drops out rather than leaving a torn thumbnail.
 *
 * Fetched lazily, on expand, in the same spirit as the perks it sits above —
 * a member scrolling a list of stores should not pay for photos they never open.
 */

import { useEffect, useState } from 'react'

const BINPERKS_BLUE = '#4A4B98'

interface BinPhoto {
  id: string
  url: string
  caption: string | null
}

export default function BinPhotoStrip({ storeId }: { storeId: string }) {
  const [photos, setPhotos] = useState<BinPhoto[]>([])
  const [failed, setFailed] = useState<Set<string>>(new Set())
  /** The photo opened full screen, or null. */
  const [lightbox, setLightbox] = useState<BinPhoto | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/member/store-bin-photos/${storeId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setPhotos((d?.photos ?? []) as BinPhoto[]) })
      .catch(() => { /* no photos rather than an error box — see the header */ })
    return () => { cancelled = true }
  }, [storeId])

  // Close the lightbox on Escape, the shortcut anyone tries first.
  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  const visible = photos.filter(p => !failed.has(p.id))
  if (visible.length === 0) return null

  return (
    <section className="pt-3 flex flex-col gap-2" id={`bin-photos-${storeId}`}>
      <h3 className="text-[22px] font-bold tracking-[0.01em] uppercase text-black leading-tight">
        What&apos;s In <span style={{ color: BINPERKS_BLUE }}>The Bins</span>
      </h3>

      {/* Scrolls horizontally inside its own box; the panel never scrolls
          sideways. Negative margin lets the strip bleed to the card edge while
          the padding keeps the first photo aligned with the text above it. */}
      <div className="overflow-x-auto -mx-4 px-4">
        <div className="flex gap-2.5 w-max pb-1">
          {visible.map(photo => (
            <figure key={photo.id} className="flex flex-col gap-1 m-0 w-40 flex-shrink-0">
              <button
                onClick={() => setLightbox(photo)}
                aria-label={photo.caption ?? 'View photo full screen'}
                className="block active:scale-[0.98] transition-transform"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={photo.caption ?? 'What is in the bins at this store'}
                  onError={() => setFailed(prev => new Set(prev).add(photo.id))}
                  // Not loading="lazy": an offscreen lazy image never requests,
                  // so onError never fires and an expired URL would leave a gap
                  // where the photo should have been.
                  decoding="async"
                  className="w-40 h-32 rounded-xl object-cover bg-[#F5F5F8] border border-[#EBEBF2]"
                />
              </button>
              {photo.caption && (
                <figcaption className="text-[11px] font-medium text-[#8E8EA8] leading-snug">
                  {photo.caption}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      </div>

      <p className="text-[10px] font-medium text-[#B0B0C8] leading-relaxed">
        Posted by the store. Stock changes — these show what was in the bins recently,
        not a guarantee of what is there today.
      </p>

      {/* Full-screen view. A plain fixed overlay rather than a dialog element:
          it has one job, closes on tap or Escape, and needs no focus trap. */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center px-4 gap-3"
          onClick={() => setLightbox(null)}
          role="button"
          tabIndex={-1}
          aria-label="Close photo"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox.url}
            alt={lightbox.caption ?? 'What is in the bins at this store'}
            className="max-w-full max-h-[75dvh] rounded-xl object-contain"
          />
          {lightbox.caption && (
            <p className="text-[13px] font-semibold text-white text-center max-w-md">
              {lightbox.caption}
            </p>
          )}
          <p className="text-[12px] font-medium text-white/60">Tap anywhere to close</p>
        </div>
      )}
    </section>
  )
}
