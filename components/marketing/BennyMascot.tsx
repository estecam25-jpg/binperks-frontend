/**
 * Benny, the BinPerks mascot.
 *
 * ── SWAPPING THE ARTWORK IS ONE CHANGE, IN THIS FILE ───────────────────────
 * Drop the image into `public/` and set BENNY_IMAGE_SRC to its path. Nothing
 * else moves: every page that shows Benny renders <BennyMascot />, so the path
 * is written down once.
 *
 *     export const BENNY_IMAGE_SRC: string | null = '/benny.png'
 *
 * While it is null the component draws a clearly marked placeholder rather
 * than a broken image. A missing file that renders as a grey box with the word
 * "placeholder" on it is obvious in review; a 404'd <img> looks like a bug and
 * gets shipped.
 *
 * The frame keeps its size either way, so dropping the real artwork in cannot
 * reflow the hero around it.
 */

export const BENNY_IMAGE_SRC: string | null = null

/** Alt text for the real artwork, kept beside the path it describes. */
const BENNY_ALT = 'Benny, the BinPerks mascot'

export default function BennyMascot({
  className = '',
  size = 160,
}: {
  className?: string
  /** Rendered width and height in pixels. The artwork is square. */
  size?: number
}) {
  if (BENNY_IMAGE_SRC) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={BENNY_IMAGE_SRC}
        alt={BENNY_ALT}
        width={size}
        height={size}
        className={`object-contain ${className}`}
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
