'use client'

/**
 * Rotating branded greeting.
 *
 * The greeting is picked once per mount from a fixed approved list — no AI, no
 * network call. Selection happens in an effect rather than during render
 * because it depends on Date.now(): choosing on the server and again on the
 * client would produce different text and trip hydration.
 */

import { useEffect, useState } from 'react'

/** Approved copy. {name} is substituted with the member's first name; lines
 *  without it are brand lines that read fine on their own. */
const GREETINGS = [
  'Welcome back, {name}',
  'More Bins. More Wins.',
  'Ready for another treasure hunt, {name}?',
  "Let's see what you find today.",
  "What's hiding in the bins today, {name}?",
  'Happy hunting, {name}!',
  'Good finds start here, {name}.',
]

/** How often the greeting changes. One per app open would re-roll on every
 *  client-side tab switch, so it is bucketed by hour instead — the same member
 *  moving between tabs keeps reading the same line. */
const ROTATION_MS = 60 * 60 * 1000

export default function GreetingCard({ firstName }: { firstName: string }) {
  // Index 0 on first paint so server and client agree; the effect rotates it
  // immediately after mount.
  const [index, setIndex] = useState(0)

  useEffect(() => {
    setIndex(Math.floor(Date.now() / ROTATION_MS) % GREETINGS.length)
  }, [])

  const name = firstName?.trim() || 'there'
  const greeting = GREETINGS[index].replace('{name}', name)

  return (
    <div className="w-full px-1">
      <h1 className="font-['Coiny'] text-[26px] leading-tight text-[#1A1A2E]">
        {greeting}
      </h1>
    </div>
  )
}
