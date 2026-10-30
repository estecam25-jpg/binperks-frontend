/**
 * Benny, the BinPerks mascot.
 *
 * ── SWAPPING THE ARTWORK IS ONE CHANGE, IN THIS FILE ───────────────────────
 * Drop the image into `public/benny/` and set BENNY_IMAGE_SRC to its path.
 * Nothing else moves: every page that shows Benny renders <BennyMascot />, so
 * the path is written down once.
 *
 * ── WHY THE WEBP AND NOT THE PNG ───────────────────────────────────────────
 * The delivered artwork is 1254x1254 and 1.9 MB, which is a lot of bytes for
 * something drawn at 150px above the fold. public/benny/benny-hero.webp is the
 * same picture at 800x800 and 101 KB — still over 5x the rendered size, so it
 * stays sharp on a 3x phone screen. The original PNG is kept beside it as the
 * master; nothing in the app points at it.
 *
 * ── THE ARTWORK IS AN OPAQUE SQUARE SCENE, NOT A CUT-OUT ───────────────────
 * Benny is painted into a bin-store background, so there is no transparency to
 * let the hero's indigo show through. Dropped in flat it would read as a
 * pasted screenshot with a hard square edge. The frame is therefore clipped to
 * the same rounded-3xl the placeholder used, which keeps the footprint
 * identical and makes it read as a framed picture.
 *
 * Composition note for anyone changing the shape: Benny's face and phone sit
 * in the upper middle and the bin fills the bottom. Keep it square. If it ever
 * has to be cropped to a non-square box, bias the crop upward.
 */

import Image from 'next/image'

/** The optimized copy. The 1.9 MB PNG master is public/benny/benny-hero.png. */
export const BENNY_IMAGE_SRC: string | null = '/benny/benny-hero.webp'

/** Alt text for the real artwork, kept beside the path it describes. */
const BENNY_ALT = 'Benny, the BinPerks mascot'

export default function BennyMascot({
  className = '',
  size = 160,
  /** Above the fold on the homepage, so it is eager by default. */
  priority = true,
}: {
  className?: string
  /** Rendered width and height in pixels. The artwork is square. */
  size?: number
  priority?: boolean
}) {
  if (BENNY_IMAGE_SRC) {
    return (
      <Image
        src={BENNY_IMAGE_SRC}
        alt={BENNY_ALT}
        width={size}
        height={size}
        priority={priority}
        // Width AND height are fixed and the source is 1:1, so the box is
        // reserved before the bytes arrive — nothing reflows around it.
        className={`rounded-3xl object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <div
      className={`rounded-3xl border-2 border-dashed border-white/35 bg-white/10
                  flex flex-col items-center justify-center gap-1 text-center px-3 ${className}`}
      style={{ width: size, height: size }}
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
