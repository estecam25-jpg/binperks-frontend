'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

interface StoreInfo {
  brandName: string
  brandColor: string
  logoUrl: string | null
}

export default function FeedbackThankyouPage() {
  const router = useRouter()
  const [store, setStore] = useState<StoreInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [reviewUrl, setReviewUrl] = useState<string | null>(null)
  const [reviewClicked, setReviewClicked] = useState(false)

  useEffect(() => {
    // Read reviewUrl from URL params — must use window.location.search in Next.js 16
    const params = new URLSearchParams(window.location.search)
    const url = params.get('reviewUrl')
    if (url) setReviewUrl(url)
  }, [])

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

  async function handleReviewClick() {
    if (reviewClicked || !reviewUrl) return
    setReviewClicked(true)
    // Track click (fire and forget)
    fetch('/api/member/feedback/review-click', { method: 'POST' }).catch(() => {})
    window.open(reviewUrl, '_blank', 'noopener,noreferrer')
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

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-10 gap-6 max-w-md mx-auto w-full text-center">
        <span className="text-6xl">🙏</span>

        <div>
          <h1 className="font-['Coiny'] text-3xl text-[#1A1A2E]">Thank you!</h1>
          <p className="text-[15px] text-[#8E8EA8] font-medium mt-2 leading-relaxed">
            We appreciate you sharing your feedback.<br />It helps us do better.
          </p>
        </div>

        {reviewUrl && (
          <button
            onClick={handleReviewClick}
            className="w-full py-4 rounded-2xl font-bold text-[16px] text-white text-center transition-opacity active:opacity-80"
            style={{ backgroundColor: '#2A7D34' }}
          >
            ⭐ Leave a Review
          </button>
        )}

        <Link
          href="/member/dashboard"
          className="w-full py-4 rounded-2xl font-bold text-[16px] text-center border-2 transition-opacity active:opacity-80"
          style={{ borderColor: brandColor, color: brandColor }}
        >
          Back to dashboard
        </Link>
      </main>
    </div>
  )
}
