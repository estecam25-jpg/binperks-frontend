/**
 * The 20-stamp progress visual.
 *
 * Shared deliberately. It appears in the cashier stamp tool
 * (/stamptool/member) and on the member dashboard, and the two are supposed to
 * be the same picture — a member looking at their phone should see exactly
 * what the cashier sees over the counter. Copying the markup would have let
 * them drift the first time either side was touched.
 *
 * The cycle is always 20 stamps regardless of tier (CLAUDE.md CORE RULE 2);
 * only the coupon VALUE changes with tier, which is why that lives in the
 * caption the caller supplies rather than in here.
 */

const CYCLE_LENGTH = 20

export default function StampProgress({
  filled,
  label = 'Stamp progress',
  caption,
}: {
  /** Stamps filled in the current cycle, 0–20. Callers pass 20 when a coupon
   *  is due, so a completed card reads as full rather than resetting to 0. */
  filled: number
  label?: string
  /** Rendered under the bar. Tier-specific wording lives here. */
  caption?: React.ReactNode
}) {
  const safe = Math.max(0, Math.min(CYCLE_LENGTH, Math.round(filled)))

  return (
    <>
      <div className="flex items-baseline justify-between mb-4">
        <span className="font-['Coiny'] text-[18px] text-[#1A1A2E]">{label}</span>
        <span className="text-[13px] font-bold text-[#8E8EA8]">
          <span className="text-[#1A1A2E]">{safe}</span> / {CYCLE_LENGTH}
        </span>
      </div>

      <div className="grid grid-cols-10 gap-1.5 mb-4">
        {Array.from({ length: CYCLE_LENGTH }).map((_, i) => (
          <div
            key={i}
            className={`
              aspect-square rounded-full border-2 flex items-center justify-center
              ${i < safe
                ? 'bg-[#FFB217] border-[#FFB217]'
                : 'bg-[#F5F5F8] border-[#EBEBF2]'
              }
            `}
          >
            {i < safe && (
              <span className="text-white/80 text-[8px]">★</span>
            )}
          </div>
        ))}
      </div>

      <div className="h-1.5 rounded-full bg-[#EBEBF2] overflow-hidden mb-2.5">
        <div
          className="h-full rounded-full bg-[#FFB217] transition-all duration-500"
          style={{ width: `${(safe / CYCLE_LENGTH) * 100}%` }}
        />
      </div>

      {caption && (
        <p className="text-[13px] font-semibold text-[#8E8EA8] text-center">
          {caption}
        </p>
      )}
    </>
  )
}
