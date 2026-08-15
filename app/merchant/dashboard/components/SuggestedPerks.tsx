'use client'

/**
 * Suggested Perks — ideas a merchant can borrow when filling in their own.
 *
 * Deliberately muted: these are examples, not the merchant's saved perks, and
 * the one thing that must never happen is a merchant reading them as already
 * configured. Hence the grey card, the "examples" wording, and no save button.
 *
 * Title and description are each independently tappable and copy to the
 * clipboard, because a merchant usually wants one or the other, not both
 * glued together.
 *
 * Hardcoded for now. The admin Suggested Perks tab writes to a suggested_perks
 * table; pointing this at GET /api/admin/content/suggested-perks (or a
 * merchant-facing equivalent) is the only change needed to make it live.
 *
 * Module scope so its state cannot be reset by a parent re-render.
 */

import { useState } from 'react'

const BLUE = '#4A4B98'

interface Suggestion {
  title: string
  description: string
}

const SUGGESTIONS: Suggestion[] = [
  {
    title: 'Early Bird Access',
    description: 'VIP members get first pick of new bin inventory before doors open to the public.',
  },
  {
    title: 'Free Bag Day',
    description: 'Fill a bag for a flat fee on select Saturdays — VIP members get an extra bag free.',
  },
  {
    title: 'Loyalty Price Lock',
    description: "VIP members pay yesterday's bin price on the last day of the pricing cycle.",
  },
  {
    title: 'Referral Bonus',
    description: 'Earn store credit when a friend you referred makes their first purchase.',
  },
  {
    title: 'Birthday Surprise',
    description: 'A special surprise reward delivered to VIP members during their birthday month.',
  },
]

/** How long the "Copied!" confirmation stays up. */
const COPIED_MS = 1500

export default function SuggestedPerks() {
  /** Which exact string was copied last — keyed by value so the tick appears on
   *  the tapped line, not on the whole card. */
  const [copied, setCopied] = useState<string | null>(null)

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(text)
      setTimeout(() => setCopied(c => (c === text ? null : c)), COPIED_MS)
    } catch {
      // Clipboard access can be blocked (insecure context, permissions). The
      // text is on screen and selectable, so this fails quietly rather than
      // throwing an error at someone who can just read it.
    }
  }

  return (
    <div className="bg-[#F5F5F8] rounded-2xl border border-[#EBEBF2] px-4 py-4 flex flex-col gap-3">
      <div>
        <h3 className="text-[15px] font-bold text-[#8E8EA8]">Suggested Perks</h3>
        <p className="text-[12px] font-medium text-[#B0B0C8] mt-0.5 leading-relaxed">
          Here are some ideas for attractive perks you could offer. Tap any title or
          description to copy it, then paste it into a slot above. These are examples
          only — nothing here is saved to your store.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {SUGGESTIONS.map(s => (
          <div
            key={s.title}
            className="bg-white/70 rounded-xl px-3.5 py-3 border border-[#EBEBF2] flex flex-col gap-1"
          >
            <button
              onClick={() => copy(s.title)}
              className="text-left text-[13px] font-bold text-[#8E8EA8] hover:text-[#1A1A2E] transition-colors flex items-center gap-1.5"
              aria-label={`Copy title: ${s.title}`}
            >
              <span>{s.title}</span>
              {copied === s.title && (
                <span className="text-[10px] font-bold flex-shrink-0" style={{ color: BLUE }}>
                  ✓ Copied!
                </span>
              )}
            </button>

            <button
              onClick={() => copy(s.description)}
              className="text-left text-[12px] font-medium text-[#B0B0C8] hover:text-[#8E8EA8] transition-colors leading-relaxed"
              aria-label={`Copy description for ${s.title}`}
            >
              {s.description}
              {copied === s.description && (
                <span className="ml-1.5 text-[10px] font-bold whitespace-nowrap" style={{ color: BLUE }}>
                  ✓ Copied!
                </span>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
