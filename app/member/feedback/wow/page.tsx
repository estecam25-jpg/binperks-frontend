'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

interface StoreInfo {
  brandName: string
  brandColor: string
  logoUrl: string | null
  googleReviewUrl: string | null
}

export default function FeedbackWowPage() {
  const router = useRouter()
  const [store, setStore] = useState<StoreInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/member/me').then(res => {
      if (res.status === 401) { router.replace('/member/login'); return null }
      return res.ok ? res.json() : null
    }).then(data => {
      if (data?.store) setStore({
        brandName: data.store.brandName,
        brandColor: data.store.brandColor,
        logoUrl: data.store.logoUrl ?? null,
        googleReviewUrl: data.store.googleReviewUrl ?? null,
      })
      setLoading(false)
    })
  }, [router])

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
        <span className="text-6xl">🎉</span>

        <div>
          <h1 className="font-['Coiny'] text-3xl text-[#1A1A2E]">Thanks for the love!</h1>
          <p className="text-[15px] text-[#8E8EA8] font-medium mt-2 leading-relaxed">
            We&apos;re so glad you had a great experience at {brandName}.
          </p>
        </div>

        {store?.googleReviewUrl && (
          <a
            href={store.googleReviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full rounded-2xl px-6 py-4 flex items-center justify-center gap-2 font-bold text-white text-[16px] transition-opacity active:opacity-80"
            style={{ backgroundColor: brandColor }}
          >
            ⭐ Leave us a Google Review
          </a>
        )}

        <Link
          href="/member/dashboard"
          className="text-[14px] font-semibold text-[#8E8EA8] underline-offset-2 hover:underline mt-2"
        >
          Back to dashboard
        </Link>
      </main>
    </div>
  )
}
