'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

interface StoreInfo {
  brandName: string
  brandColor: string
  logoUrl: string | null
}

export default function MemberFeedbackPage() {
  const router = useRouter()
  const [store, setStore] = useState<StoreInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/member/me').then(res => {
      if (res.status === 401) { router.replace('/member/login'); return null }
      return res.ok ? res.json() : null
    }).then(data => {
      if (data?.store) setStore({
        brandName: data.store.brandName,
        brandColor: data.store.brandColor,
        logoUrl: data.store.logoUrl ?? null,
      })
      setLoading(false)
    })
  }, [router])

  async function handleRating(display: 'wow' | 'meh' | 'bad') {
    if (submitting) return
    setSubmitting(display)
    const dbRating = display === 'bad' ? 'mad' : display
    let reviewUrl = ''
    try {
      const res = await fetch('/api/member/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: dbRating }),
      })
      if (res.ok) {
        const data = await res.json()
        reviewUrl = data.reviewUrl ?? ''
      }
    } catch { /* continue */ }

    const dest = reviewUrl
      ? `/member/feedback/thankyou?reviewUrl=${encodeURIComponent(reviewUrl)}`
      : '/member/feedback/thankyou'
    router.push(dest)
  }

  const brandColor = store?.brandColor ?? '#4A4B98'
  const brandName = store?.brandName ?? 'BinPerks'

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#F5F5F8]">
        <span className="w-8 h-8 border-[3px] border-[#EBEBF2] border-t-[#4A4B98] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">
      <div className="px-5 py-3 flex items-center gap-2.5" style={{ backgroundColor: brandColor }}>
        {store?.logoUrl && (
          <div className="w-8 h-8 rounded-full bg-white overflow-hidden flex-shrink-0 shadow-sm">
            <Image src={store.logoUrl} alt={brandName} width={32} height={32} className="object-cover w-full h-full" />
          </div>
        )}
        <span className="font-['Coiny'] text-xl leading-none text-white">{brandName}</span>
        <span className="text-white/50 text-[10px] font-semibold tracking-widest uppercase ml-auto">Powered by BinPerks</span>
      </div>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-10 gap-8 max-w-md mx-auto w-full">
        <div className="text-center">
          <h1 className="font-['Coiny'] text-3xl text-[#1A1A2E]">How was your visit?</h1>
          <p className="text-[14px] text-[#8E8EA8] font-medium mt-1">Tap to let us know</p>
        </div>

        <div className="w-full flex flex-col gap-4">
          <button
            onClick={() => handleRating('wow')}
            disabled={!!submitting}
            className="w-full rounded-2xl px-6 py-5 flex items-center gap-5 transition-opacity active:opacity-80 disabled:opacity-60"
            style={{ backgroundColor: '#2A7D34' }}
          >
            <span className="text-5xl">😍</span>
            <div className="flex flex-col items-start">
              <span className="font-['Coiny'] text-2xl text-white leading-tight">WOW</span>
              <span className="text-[13px] font-semibold text-white/75">Great experience!</span>
            </div>
            {submitting === 'wow' && (
              <span className="ml-auto w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
          </button>

          <button
            onClick={() => handleRating('meh')}
            disabled={!!submitting}
            className="w-full rounded-2xl px-6 py-5 flex items-center gap-5 transition-opacity active:opacity-80 disabled:opacity-60"
            style={{ backgroundColor: '#FFB217' }}
          >
            <span className="text-5xl">😐</span>
            <div className="flex flex-col items-start">
              <span className="font-['Coiny'] text-2xl text-[#1A1A2E] leading-tight">MEH</span>
              <span className="text-[13px] font-semibold text-[#1A1A2E]/60">It was okay</span>
            </div>
            {submitting === 'meh' && (
              <span className="ml-auto w-5 h-5 border-2 border-[#1A1A2E]/20 border-t-[#1A1A2E] rounded-full animate-spin" />
            )}
          </button>

          <button
            onClick={() => handleRating('bad')}
            disabled={!!submitting}
            className="w-full rounded-2xl px-6 py-5 flex items-center gap-5 transition-opacity active:opacity-80 disabled:opacity-60"
            style={{ backgroundColor: '#DA1212' }}
          >
            <span className="text-5xl">😤</span>
            <div className="flex flex-col items-start">
              <span className="font-['Coiny'] text-2xl text-white leading-tight">BAD</span>
              <span className="text-[13px] font-semibold text-white/75">Not great</span>
            </div>
            {submitting === 'bad' && (
              <span className="ml-auto w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
          </button>
        </div>
      </main>
    </div>
  )
}
