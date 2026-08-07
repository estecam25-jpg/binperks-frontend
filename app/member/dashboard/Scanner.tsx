'use client'

import { useRef, useState } from 'react'

/**
 * AI Product Scanner (V3 Phase 4A MVP).
 *
 * Available to ALL members — Starter and VIP alike.
 *
 * A scan records what a member is INTERESTED in, never what they bought.
 * The copy here says "You're interested in:" for that reason — do not change
 * it to purchase language without a corresponding change to what the data
 * actually means.
 *
 * No geofencing in the MVP — the scanner is in-store *in intent* only.
 * In-store verification is Phase 4B.
 */

type Choice = 'shopping_cart' | 'back_to_bins'

interface ScanResult {
  scanEventId: string
  identifiedProduct: string
  identifiedCategory: string
  confidence: number
  description: string
  /** Display text like "$24.99 – $39.99". Empty when the model had no
   *  estimate. This is typical retail value, not the store's price. */
  estimatedRetailPrice: string
}

// Below this, we tell the member outright that we're guessing rather than
// presenting the result as an identification.
const LOW_CONFIDENCE = 0.5

// Longest edge, in pixels, that we upload. Matches the resolution tier the
// scanner model actually uses — anything larger is wasted upload time and
// wasted image tokens with no accuracy gain.
const MAX_EDGE = 1568
const JPEG_QUALITY = 0.8

/**
 * Downscale the captured photo in the browser before upload.
 *
 * A modern phone photo is 3–8 MB, which is slow on store wifi and over the
 * serverless request body limit once base64 inflates it. `from-image`
 * orientation keeps portrait shots upright — without it, iOS photos arrive
 * rotated and identification suffers.
 */
async function downscale(file: File): Promise<{ dataUrl: string; mediaType: string }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas_unavailable')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  return { dataUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY), mediaType: 'image/jpeg' }
}

export default function Scanner({ brandColor }: { brandColor: string }) {
  const [open, setOpen]         = useState(false)
  const [busy, setBusy]         = useState(false)
  const [result, setResult]     = useState<ScanResult | null>(null)
  const [error, setError]       = useState('')

  // The member's own downscaled photo, as a data URL. Kept after upload so the
  // result screen can show them what they actually pointed the camera at,
  // next to the stock photo of what we think it is.
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null)

  // Stock photo from /api/member/scan/image. Null means "nothing found", which
  // is the common case — DuckDuckGo only has an instant answer for products
  // with an encyclopedia entry. `stockFailed` additionally covers a URL that
  // was returned but wouldn't load. Either way the slot renders nothing.
  const [stockPhoto, setStockPhoto]   = useState<string | null>(null)
  const [stockFailed, setStockFailed] = useState(false)

  const fileInput = useRef<HTMLInputElement>(null)

  /** Guards against a slow lookup for a previous scan landing on a newer one. */
  const stockLookupSeq = useRef(0)

  function reset() {
    setResult(null); setError(''); setCapturedPhoto(null); setBusy(false)
    setStockPhoto(null); setStockFailed(false)
    stockLookupSeq.current++          // orphan any lookup still in flight
    if (fileInput.current) fileInput.current.value = ''
  }

  function close() { setOpen(false); reset() }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setBusy(true); setError(''); setResult(null)
    setStockPhoto(null); setStockFailed(false)

    try {
      const { dataUrl, mediaType } = await downscale(file)
      // Held for the result screen, not just as an upload preview.
      setCapturedPhoto(dataUrl)

      const res = await fetch('/api/member/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl, mediaType }),
      })

      if (!res.ok) {
        const d = await res.json().catch(() => null)
        setError(
          d?.error === 'rate_limited'
            ? 'The scanner is busy right now. Try again in a moment.'
            : d?.error === 'image_too_large'
              ? "That photo was too large. Try taking it again."
              : d?.error === 'unsupported_media_type'
                ? 'That file type isn’t supported. Take a photo instead.'
                : "We couldn't scan that item. Please try again.",
        )
      } else {
        const scan = await res.json() as ScanResult
        setResult(scan)
        // Not awaited: the result is already usable, and a stock photo is
        // decoration. Making the member wait on a third-party lookup to see
        // their own identification would be the wrong trade.
        void lookupStockPhoto(scan.identifiedProduct)
      }
    } catch {
      setError("We couldn't read that photo. Please try again.")
    } finally {
      setBusy(false)
      // Allow re-picking the same file.
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  /**
   * Ask the server for a stock photo of the identified product.
   *
   * Silent on every failure path. DuckDuckGo's instant answers only cover
   * products with an encyclopedia entry, so "nothing found" is the ordinary
   * outcome for most bin merchandise — not an error worth showing anyone.
   */
  async function lookupStockPhoto(productName: string) {
    if (!productName) return
    const seq = ++stockLookupSeq.current

    try {
      const res = await fetch(`/api/member/scan/image?q=${encodeURIComponent(productName)}`)
      if (!res.ok) return
      const { imageUrl } = await res.json() as { imageUrl: string | null }
      // A newer scan (or a reset) started while this was in flight.
      if (seq !== stockLookupSeq.current) return
      if (imageUrl) setStockPhoto(imageUrl)
    } catch {
      // Network hiccup on an optional decoration — leave the slot empty.
    }
  }

  /**
   * Record the member's verdict and go straight back to the camera.
   *
   * No confirmation screen: someone standing over a bin is already reaching
   * for the next item, and a tap-through in between is friction for no
   * information. The result clearing IS the acknowledgement.
   *
   * Fire-and-forget by design. The choice is a stated preference, not a
   * transaction — nothing downstream blocks on it, so a failed write must not
   * drag the member back to a screen they have already left. It is logged and
   * dropped. (A 409 just means it was already recorded, which is not a
   * failure worth noting at all.)
   */
  function recordChoice(next: Choice) {
    if (!result) return
    const { scanEventId } = result

    reset()

    void fetch('/api/member/scan/choice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scanEventId, choice: next }),
    })
      .then(res => {
        if (!res.ok && res.status !== 409) {
          console.error('[Scanner] choice not recorded:', res.status)
        }
      })
      .catch(err => console.error('[Scanner] choice request failed:', err))
  }

  const lowConfidence = result !== null && result.confidence < LOW_CONFIDENCE

  // The stock slot appears only once we have a URL that hasn't failed to load.
  // Both conditions matter: nothing found, and found-but-broken, render alike.
  const showStock = stockPhoto !== null && !stockFailed

  return (
    <>
      {/* Entry point on the dashboard */}
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl px-5 py-5 flex items-center gap-4 text-left shadow-sm bg-white active:scale-[0.99] transition-transform"
      >
        <span className="text-3xl flex-shrink-0">📷</span>
        <div className="flex-1">
          <p className="font-['Coiny'] text-lg text-[#1A1A2E]">Scan an item</p>
          <p className="text-[12px] text-[#8E8EA8] font-medium mt-0.5 leading-relaxed">
            Point your camera at anything in the bins and we&apos;ll tell you what it is.
          </p>
        </div>
        <span className="text-[#D1D1DC] text-xl flex-shrink-0">›</span>
      </button>

      {!open ? null : (
        <div className="fixed inset-0 z-50 bg-[#F5F5F8] flex flex-col">

          {/* Header. Close is deliberately absent once a result is on screen:
              the member answers Shopping Cart or Back to Bins, which records
              the choice and drops them straight back here, where Close is
              available again. So they can always leave — just not while a
              result is sitting unanswered. */}
          <div className="px-5 py-4 flex items-center gap-3" style={{ backgroundColor: brandColor }}>
            <span className="font-['Coiny'] text-xl text-white leading-none flex-1">
              BinPerks Scanner
            </span>
            {!result && (
              <button
                onClick={close}
                className="text-white/70 text-[13px] font-bold px-2 py-1"
                aria-label="Close scanner"
              >
                Close
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-4 max-w-md mx-auto w-full">

            {/* Upload preview — only until the result lands. Once it does,
                the photo reappears inside the result card paired with the
                stock photo, so showing it twice would be noise. */}
            {capturedPhoto && !result && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={capturedPhoto}
                alt="The item you scanned"
                className="w-full rounded-2xl object-cover max-h-64 shadow-sm"
              />
            )}

            {busy && (
              <div className="bg-white rounded-2xl px-5 py-10 flex flex-col items-center gap-3 shadow-sm">
                <span className="w-8 h-8 border-[3px] border-[#EBEBF2] border-t-[#4A4B98] rounded-full animate-spin" />
                <p className="text-[13px] font-semibold text-[#8E8EA8]">Identifying your item…</p>
              </div>
            )}

            {error && !busy && (
              <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
                <p className="text-[13px] font-semibold text-[#DA1212]">{error}</p>
              </div>
            )}

            {/* ── Result ── */}
            {result && !busy && (
              <div className="bg-white rounded-2xl px-5 py-5 shadow-sm flex flex-col gap-2">

                {/* AI disclaimer — on every result, at every confidence level.
                    The low-confidence banner below is an extra warning, not a
                    replacement for this. */}
                <p className="text-[11px] italic text-[#8E8EA8] font-medium leading-relaxed">
                  AI-powered identification — this is our best guess, not a guarantee.
                  Always inspect the item before purchasing.
                </p>

                {/* Their photo, and what we think it is, side by side — the
                    comparison is the whole point, so the member can judge the
                    match themselves rather than taking our word for it.
                    When there is no stock photo (the common case) their photo
                    simply takes the full width; no placeholder, no empty cell. */}
                {capturedPhoto && (
                  <div className={`grid gap-2 ${showStock ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    <figure className="flex flex-col gap-1 m-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={capturedPhoto}
                        alt="The photo you took"
                        className="w-full rounded-xl object-cover aspect-square bg-[#F5F5F8]"
                      />
                      <figcaption className="text-[10px] font-bold tracking-[0.06em] uppercase text-[#8E8EA8] text-center">
                        Your item
                      </figcaption>
                    </figure>

                    {showStock && (
                      <figure className="flex flex-col gap-1 m-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={stockPhoto!}
                          alt={`Stock photo of ${result.identifiedProduct}`}
                          onError={() => setStockFailed(true)}
                          // Deliberately NOT loading="lazy": a lazily-loaded
                          // image that is still offscreen never requests, so
                          // onError never fires and a dead URL leaves the
                          // caption and an empty gap on screen until the
                          // member scrolls to it. Eager loading is what makes
                          // hide-on-failure work.
                          decoding="async"
                          referrerPolicy="no-referrer"
                          className="w-full rounded-xl object-contain aspect-square bg-[#F5F5F8]"
                        />
                        <figcaption className="text-[10px] font-bold tracking-[0.06em] uppercase text-[#8E8EA8] text-center">
                          Closest match
                        </figcaption>
                      </figure>
                    )}
                  </div>
                )}

                {lowConfidence ? (
                  <p className="text-[12px] font-semibold text-[#8A6A00] bg-[#FFB21725] rounded-lg px-3 py-2 leading-relaxed">
                    We&apos;re not sure what this is — here&apos;s our best guess:
                  </p>
                ) : (
                  // Interest, never a purchase. See the file header.
                  <p className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#8E8EA8]">
                    You&apos;re interested in:
                  </p>
                )}

                <p className="font-['Coiny'] text-2xl text-[#1A1A2E] leading-tight">
                  {result.identifiedProduct}
                </p>
                <p className="text-[12px] font-semibold text-[#4A4B98]">
                  {result.identifiedCategory}
                </p>

                {/* Retail estimate. Labelled as a typical retail range, never
                    as this store's price — the model has no idea what the bin
                    costs today, and members must not read it as one. */}
                {result.estimatedRetailPrice && (
                  <div className="mt-1 rounded-xl bg-[#F5F5F8] px-3.5 py-2.5">
                    <p className="text-[10px] font-bold tracking-[0.06em] uppercase text-[#8E8EA8]">
                      Estimated retail
                    </p>
                    <p className="text-[15px] font-bold text-[#1A1A2E] mt-0.5 leading-snug">
                      {result.estimatedRetailPrice}
                    </p>
                    <p className="text-[10px] text-[#8E8EA8] font-medium mt-1 leading-relaxed">
                      Typical price at retail — not this store&apos;s price.
                    </p>
                  </div>
                )}

                {result.description && (
                  <p className="text-[13px] text-[#8E8EA8] font-medium leading-relaxed mt-0.5">
                    {result.description}
                  </p>
                )}

                {/* Confidence */}
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold tracking-[0.06em] uppercase text-[#8E8EA8]">
                      Confidence
                    </span>
                    <span className="text-[11px] font-bold text-[#1A1A2E]">
                      {Math.round(result.confidence * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#EBEBF2] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.round(result.confidence * 100)}%`,
                        backgroundColor:
                          result.confidence >= 0.8 ? '#2A7D34'
                          : result.confidence >= LOW_CONFIDENCE ? '#FFB217'
                          : '#DA1212',
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── Choice ── Answering either one records it and returns
                straight to the camera; there is no screen in between. */}
            {result && !busy && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => recordChoice('shopping_cart')}
                  className="py-5 rounded-2xl font-bold text-[15px] text-white bg-[#2A7D34] active:scale-[0.97] transition-transform flex flex-col items-center gap-1"
                >
                  <span className="text-2xl">🛒</span>
                  Shopping Cart
                </button>
                <button
                  onClick={() => recordChoice('back_to_bins')}
                  className="py-5 rounded-2xl font-bold text-[15px] text-[#1A1A2E] bg-white border-2 border-[#EBEBF2] active:scale-[0.97] transition-transform flex flex-col items-center gap-1"
                >
                  <span className="text-2xl">🗑️</span>
                  Back to Bins
                </button>
              </div>
            )}

            {/* Capture — the entry action whenever there's no pending result */}
            {!result && !busy && (
              <>
                <button
                  onClick={() => fileInput.current?.click()}
                  className="w-full py-6 rounded-2xl font-bold text-[17px] text-white flex flex-col items-center gap-2 active:scale-[0.97] transition-transform"
                  style={{ backgroundColor: brandColor }}
                >
                  <span className="text-3xl">📷</span>
                  {error ? 'Try again' : 'Take a photo'}
                </button>
                <p className="text-[11px] text-[#8E8EA8] font-medium text-center leading-relaxed px-2">
                  Hold the item steady and fill the frame. We identify items to help you decide —
                  scans aren&apos;t purchases and don&apos;t earn stamps.
                </p>
              </>
            )}

            {/* `capture` opens the rear camera directly on mobile and falls
                back to a file picker on desktop. */}
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFile}
            />
          </div>
        </div>
      )}
    </>
  )
}
