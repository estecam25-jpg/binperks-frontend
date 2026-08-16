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
 * Content comes from the suggested_perks table, curated in the admin dashboard.
 * There is NO mock fallback: an empty table renders the header and intro with
 * no items, because inventing examples would put words in BinPerks' mouth that
 * no admin approved.
 *
 * Read through /api/merchant/suggested-perks, not the admin content route —
 * that one requires an admin session and 403s for every merchant.
 *
 * Module scope so its state cannot be reset by a parent re-render.
 */

import { useEffect, useState } from 'react'

const BLUE = '#4A4B98'

interface Suggestion {
  id: string
  title: string
  description: string
}

/** How long the "Copied!" confirmation stays up. */
const COPIED_MS = 1500

export default function SuggestedPerks() {
  /** Which exact string was copied last — keyed by value so the tick appears on
   *  the tapped line, not on the whole card. */
  const [copied, setCopied] = useState<string | null>(null)

  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  // Derived rather than stored, so there is no setState in the effect body.
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/merchant/suggested-perks')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled) return
        setSuggestions(d?.perks ?? [])
        setLoaded(true)
      })
      .catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [])

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

      {/* Nothing at all until the admin has published some — no placeholder
          items, and no skeleton for a section that may legitimately be empty. */}
      {loaded && suggestions.length > 0 && (
      <div className="flex flex-col gap-2">
        {suggestions.map(s => (
          <div
            key={s.id}
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
      )}
    </div>
  )
}
