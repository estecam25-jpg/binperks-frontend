'use client'

/**
 * The stamp-fill cascade — dots lighting up one after another.
 *
 * Extracted from the join landing page so the member dashboard plays the exact
 * same animation rather than a lookalike. The timing constants below ARE the
 * animation; changing them changes it everywhere it plays.
 *
 * The join page fills all 20 as a demo of what a full card looks like. The
 * dashboard fills to the member's REAL stamp count — the cascade is decoration,
 * the number it lands on is data, and animating past it would misreport
 * progress.
 */

import { useEffect, useRef, useState } from 'react'

/** Beat before the first dot, so the card is on screen when it starts. */
const START_DELAY_MS = 400
/** The cascade accelerates halfway: a 20-dot fill at one speed drags. */
const SLOW_STEP_MS = 60
const FAST_STEP_MS = 40
const SPEED_CHANGE_AT = 10

export function useStampFill(target: number): number {
  // Always starts at 0, which is also what the server renders — the animation
  // is scheduled from an effect, so there is no hydration mismatch even when
  // the member has reduced motion enabled.
  const [filled, setFilled] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const safeTarget = Math.max(0, Math.round(target))
    const clear = () => { if (timer.current) clearTimeout(timer.current) }

    // Decorative motion only — honour the OS setting and land on the final
    // value instead of animating. Scheduled rather than set inline: a
    // setState in an effect BODY cascades an extra render
    // (react-hooks/set-state-in-effect), and a 0ms timeout is imperceptible.
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    if (reduced || safeTarget === 0) {
      timer.current = setTimeout(() => setFilled(safeTarget), 0)
      return clear
    }

    // Every update happens inside a timer, so the effect body itself never
    // calls setState. The cascade starts from the first dot; `filled` is
    // already 0 on mount, and this UI only ever revises the target upward
    // (0 while /api/member/me is in flight, then the real count).
    let count = 0
    function fillNext() {
      count++
      setFilled(count)
      if (count < safeTarget) {
        timer.current = setTimeout(fillNext, count < SPEED_CHANGE_AT ? SLOW_STEP_MS : FAST_STEP_MS)
      }
    }
    timer.current = setTimeout(fillNext, START_DELAY_MS)

    return clear
  }, [target])

  return filled
}
