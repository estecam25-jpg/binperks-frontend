'use client'

/**
 * /member/beyond — the Beyond the Bins tab.
 *
 * Took over the fifth nav slot from Account (now the gear in AppHeader).
 *
 * Real content from /api/member/content/beyond-the-bins, curated in the admin
 * dashboard. NO mock fallback: an empty table shows the "check back soon"
 * message, because inventing partners would put BinPerks' name behind
 * companies no admin approved.
 */

import { useEffect, useState } from 'react'
import AppHeader from '@/components/member/AppHeader'

const BINPERKS_BLUE = '#4A4B98'

interface Partner {
  id: string
  partner_name: string
  description: string
  cta_label: string | null
  cta_url: string | null
}

export default function MemberBeyondPage() {
  const [partners, setPartners] = useState<Partner[]>([])
  // Derived, so there is no setState in the effect body.
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/member/content/beyond-the-bins')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled) return
        setPartners((d?.items ?? []) as Partner[])
        setLoaded(true)
      })
      .catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [])

  return (
    <>
      <AppHeader />

      <main className="flex-1 flex flex-col items-center px-4 py-5 gap-5 max-w-md mx-auto w-full">

        <div className="w-full px-1">
          <h1 className="font-['Coiny'] text-[26px] text-[#1A1A2E] leading-tight">
            Beyond the Bins
          </h1>
          <p className="text-[13px] text-[#8E8EA8] font-medium mt-1">
            Exclusive perks and deals from our partners
          </p>
        </div>

        <section className="w-full flex flex-col gap-2.5">
          <h2 className="text-[15px] font-extrabold text-[#1A1A2E] px-1">Sponsored Perks</h2>

          {!loaded ? (
            <div className="flex flex-col gap-2.5">
              {[0, 1].map(i => <div key={i} className="h-28 rounded-2xl bg-white animate-pulse" />)}
            </div>
          ) : partners.length === 0 ? (
            <div className="w-full bg-white rounded-2xl px-5 py-12 shadow-sm flex flex-col items-center gap-3">
              <span className="text-4xl">⭐</span>
              <p className="text-[14px] font-semibold text-[#8E8EA8] text-center leading-relaxed">
                Check back soon — exciting partner deals are coming.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {partners.map(p => (
                <article key={p.id} className="w-full bg-white rounded-2xl px-5 py-4 shadow-sm flex flex-col gap-2">
                  <p className="text-[15px] font-extrabold text-[#1A1A2E] leading-tight">
                    {p.partner_name}
                  </p>
                  <p className="text-[13px] font-medium text-[#8E8EA8] leading-relaxed">
                    {p.description}
                  </p>
                  {/* The button only appears when there is somewhere to send
                      them — a dead CTA is worse than none. */}
                  {p.cta_url && (
                    <a
                      href={p.cta_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="self-start mt-1 px-4 py-2 rounded-xl text-[13px] font-bold text-white active:opacity-80 transition-opacity"
                      style={{ backgroundColor: BINPERKS_BLUE }}
                    >
                      {p.cta_label?.trim() || 'Learn more'}
                    </a>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Clears the fixed bottom nav — see the other tab screens. */}
        <div style={{ height: 'calc(80px + env(safe-area-inset-bottom))' }} aria-hidden="true" />
      </main>
    </>
  )
}
