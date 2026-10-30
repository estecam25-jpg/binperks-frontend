/**
 * Benny, the BinPerks mascot.
 *
 * ── SWAPPING THE ARTWORK IS ONE CHANGE, IN THIS FILE ───────────────────────
 * Drop the image into `public/benny/` and set BENNY_IMAGE_SRC to its path.
 * Nothing else moves: every page that shows Benny renders <BennyMascot />, so
 * the path is written down once.
 *
 * ── ALWAYS GIVE THE NEW ARTWORK A NEW FILE NAME ────────────────────────────
 * -v2, -v3, and so on. The file is served with a long cache lifetime from
 * Vercel's CDN and from every visitor's browser, so re-using a name means some
 * people keep seeing the previous Benny for days with no way to tell. A new
 * name is a guaranteed cache miss. This is also why the export is a build
 * artefact of the PNG master rather than something edited in place.
 *
 * ── WHY THE WEBP AND NOT THE PNG ───────────────────────────────────────────
 * The master is 1254x1254 and 1.9 MB. benny-hero-v2.webp is the same picture
 * at 1200x1200 and 172 KB, which is sharp at every size below — 480px on
 * desktop at 2x is 960px. The PNG stays beside it as the master and nothing in
 * the app points at it.
 *
 * ── THE ARTWORK IS AN OPAQUE SQUARE SCENE, NOT A CUT-OUT ───────────────────
 * Benny is painted into a bin-store background, so there is no transparency to
 * let the hero's indigo show through. Dropped in flat it reads as a pasted
 * screenshot with a hard square edge, so it is clipped to rounded-3xl and
 * given a soft shadow — a framed picture rather than a bare rectangle.
 *
 * Composition note: Benny's face, the BinPerks logo on his shirt and the phone
 * all sit in the upper middle; the bin fills the bottom. Keep it square. If it
 * ever has to go in a non-square box, bias the crop upward.
 *
 * ── THE WIDTHS AND `sizes` LIVE TOGETHER ON PURPOSE ────────────────────────
 * The CSS widths below and the `sizes` string describe the same three
 * breakpoints. They are the classic pair that rots apart when one is edited in
 * a page and the other is left here, so both are owned by this component and
 * callers only pass positioning. Change one, change the other.
 */

import Image from 'next/image'

/** The optimized copy. The PNG master is public/benny/benny-hero.png. */
export const BENNY_IMAGE_SRC: string | null = '/benny/benny-hero-v2.webp'

/** Alt text for the real artwork, kept beside the path it describes. */
const BENNY_ALT = 'Benny, the BinPerks mascot'

/**
 * Rendered width by breakpoint — mobile, tablet (>=640), desktop (>=1024).
 * Mobile is capped so Benny cannot outgrow a large phone's hero.
 */
const BENNY_BOX = 'w-[min(88vw,360px)] sm:w-[400px] lg:w-[480px]'

/** The same three widths, for the browser to pick a source from. */
const BENNY_SIZES = '(min-width: 1024px) 480px, (min-width: 640px) 400px, min(88vw, 360px)'

export default function BennyMascot({
  className = '',
  /** Above the fold on the homepage, so it is eager by default. */
  priority = true,
}: {
  /** Positioning only — the size is owned by this component. */
  className?: string
  priority?: boolean
}) {
  if (BENNY_IMAGE_SRC) {
    return (
      <div className={`${BENNY_BOX} shrink-0 ${className}`}>
        <Image
          src={BENNY_IMAGE_SRC}
          alt={BENNY_ALT}
          width={1200}
          height={1200}
          sizes={BENNY_SIZES}
          priority={priority}
          // width + height are the intrinsic 1:1 ratio, so with w-full the
          // browser reserves the square before the bytes arrive and nothing
          // below the hero moves when it lands.
          className="w-full h-auto rounded-3xl object-cover
                     shadow-2xl shadow-[#1A1A2E]/40"
        />
      </div>
    )
  }

  return (
    <div
      className={`${BENNY_BOX} aspect-square shrink-0
                  rounded-3xl border-2 border-dashed border-white/35 bg-white/10
                  flex flex-col items-center justify-center gap-1 text-center px-3 ${className}`}
      aria-hidden="true"
    >
      <span className="text-3xl leading-none">🐻</span>
      <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-white/70 leading-tight">
        Benny
      </span>
      <span className="text-[9px] font-medium text-white/45 leading-tight">
        placeholder
      </span>
    </div>
  )
}
