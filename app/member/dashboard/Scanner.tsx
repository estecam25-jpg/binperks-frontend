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
  /** Fingerprint hints from the vision model, null when not readable off the
   *  item. Forwarded to the Product Image Service; not shown to the member. */
  upc: string | null
  brand: string | null
  modelNumber: string | null
}

/** Ceiling on the representative-image request, measured from the moment the
 *  result renders. Past this the slot stays empty for good — a decoration is
 *  not worth a spinner on a screen the member is already reading. */
const PRODUCT_IMAGE_TIMEOUT_MS = 5000

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
  // result screen can show them what they actually pointed the camera at.
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null)

  // Representative image from the Product Image Service (Brave-backed). A
  // transient URL: rendered once, never persisted by us or by the server.
  // Null is the normal state — the feature ships disabled, and even enabled it
  // declines low-confidence and vague identifications.
  const [productImage, setProductImage]             = useState<string | null>(null)
  const [productImageFailed, setProductImageFailed] = useState(false)

  const fileInput = useRef<HTMLInputElement>(null)

  /** Guards against a slow lookup for a previous scan landing on a newer one,
   *  plus a controller so the older request is actually aborted rather than
   *  merely ignored on arrival. */
  const productImageSeq = useRef(0)
  const productImageAbort = useRef<AbortController | null>(null)

  /** Cancels any in-flight product-image request and orphans its response.
   *  Called on every new scan and on every reset, so an image from scan N can
   *  never land on the result of scan N+1. */
  function cancelProductImage() {
    productImageSeq.current++
    productImageAbort.current?.abort()
    productImageAbort.current = null
  }

  function reset() {
    setResult(null); setError(''); setCapturedPhoto(null); setBusy(false)
    setProductImage(null); setProductImageFailed(false)
    cancelProductImage()
    if (fileInput.current) fileInput.current.value = ''
  }

  function close() { setOpen(false); reset() }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setBusy(true); setError(''); setResult(null)
    // Kill any image request still running for the previous scan before this
    // one starts — requirement: an older image must never appear on a newer
    // result.
    setProductImage(null); setProductImageFailed(false)
    cancelProductImage()

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
        // Not awaited: the result is already on screen and the image is
        // decoration. Making the member wait on a third-party lookup to see
        // their own identification would be the wrong trade.
        void lookupProductImage(scan)
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
   * Ask the Product Image Service for a representative image.
   *
   * Fires only after the result is already rendered, and the member never
   * waits on it. Silent on every failure path, of which there are several
   * ordinary ones: the feature ships disabled, and even enabled it declines
   * low-confidence or vague identifications. "No image" is the default
   * outcome, not an error.
   *
   * Bounded twice over — an AbortController that a newer scan can trigger, and
   * a 5s timeout — so a slow provider leaves the slot empty rather than
   * arriving late over a result the member has moved past.
   */
  async function lookupProductImage(scan: ScanResult) {
    const seq = ++productImageSeq.current

    const controller = new AbortController()
    productImageAbort.current = controller
    const timer = setTimeout(() => controller.abort(), PRODUCT_IMAGE_TIMEOUT_MS)

    try {
      const res = await fetch('/api/member/product-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          scanEventId:        scan.scanEventId,
          identifiedProduct:  scan.identifiedProduct,
          identifiedCategory: scan.identifiedCategory,
          confidence:         scan.confidence,
          upc:                scan.upc,
          brand:              scan.brand,
          modelNumber:        scan.modelNumber,
        }),
      })
      if (!res.ok) {
        console.error('[Scanner] product-image HTTP', res.status)
        return
      }
      const { imageUrl } = await res.json() as { imageUrl: string | null }

      // A newer scan (or a reset) started while this was in flight. Checked
      // even though the request is aborted too, because a response can already
      // be decoding by the time abort lands.
      if (seq !== productImageSeq.current) return
      if (imageUrl) setProductImage(imageUrl)
    } catch (err) {
      // An abort is expected — a newer scan or the 5s ceiling — and stays
      // silent. Anything else is a real failure and used to vanish here
      // without a trace, on the client and the server alike, which made "is
      // this even firing?" unanswerable. Still never surfaced to the member:
      // the image is decoration and the scan result is already on screen.
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        console.error('[Scanner] product-image request failed:', err)
      }
    } finally {
      clearTimeout(timer)
      if (productImageAbort.current === controller) productImageAbort.current = null
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

  // The representative image appears only once we have a URL that hasn't
  // failed to load. Both conditions matter: nothing found, and found-but-
  // broken, render alike. Off by default in production, so this is false on
  // every scan until the feature flag is turned on.
  const showProductImage = productImage !== null && !productImageFailed

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

                {/* The member's own photo — the only picture of the actual
                    item on this screen. Full width now that the DuckDuckGo
                    "Closest match" pane is gone; the representative image
                    below is a separate, clearly-labelled slot rather than a
                    side-by-side comparison. */}
                {capturedPhoto && (
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
                )}

                {/* Representative image from the Product Image Service.
                    Sits between the disclaimer and the product name, and is
                    labelled as representative so nobody reads it as a photo of
                    the item in the bin — the member's own photo above is the
                    only picture of the actual item. The URL is transient:
                    rendered here and never stored. */}
                {showProductImage && (
                  <figure className="flex flex-col gap-1 m-0 mt-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={productImage!}
                      alt={`Representative image of ${result.identifiedProduct}`}
                      onError={() => setProductImageFailed(true)}
                      // Not loading="lazy", for the same reason as the stock
                      // photo above: an offscreen lazy image never requests, so
                      // onError never fires and a dead URL leaves a caption over
                      // an empty gap.
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className="w-full rounded-xl object-contain max-h-44 bg-[#F5F5F8]"
                    />
                    <figcaption className="text-[10px] font-medium text-[#8E8EA8] text-center">
                      Representative image — not the actual item
                    </figcaption>
                  </figure>
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
