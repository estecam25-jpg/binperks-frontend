'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

interface StoreInfo {
  brandName: string
  brandColor: string
  logoUrl: string | null
}

export default function FeedbackFormPage() {
  const router = useRouter()
  const [store, setStore] = useState<StoreInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [rating, setRating] = useState<'meh' | 'bad' | null>(null)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const r = params.get('rating')
    if (r === 'meh' || r === 'bad') setRating(r)

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) { setError('Please share what happened.'); return }
    if (submitting) return
    setSubmitting(true)
    setError('')
    const dbRating = rating === 'bad' ? 'mad' : (rating ?? 'meh')
    const res = await fetch('/api/member/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: dbRating, notes: message.trim() }),
    })
    if (res.ok) {
      router.push('/member/feedback/thankyou')
    } else {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  const brandColor = store?.brandColor ?? '#4A4B98'
  const brandName = store?.brandName ?? 'BinPerks'
  const ratingEmoji = rating === 'bad' ? '😤' : '😐'
  const ratingLabel = rating === 'bad' ? 'BAD' : 'MEH'

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

      <main className="flex-1 flex flex-col items-center px-4 py-10 gap-6 max-w-md mx-auto w-full">
        <div className="text-center">
          <p className="text-[13px] font-bold tracking-[0.08em] uppercase text-[#8E8EA8] mb-2">You rated your visit</p>
          <span className="font-['Coiny'] text-2xl text-[#1A1A2E]">{ratingEmoji} {ratingLabel}</span>
          <h1 className="font-['Coiny'] text-2xl text-[#1A1A2E] mt-3">Tell us more</h1>
          <p className="text-[14px] text-[#8E8EA8] font-medium mt-1 leading-relaxed">
            Your feedback helps us improve. We read every message.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
          <textarea
            value={message}
            onChange={e => { setMessage(e.target.value); setError('') }}
            placeholder="What happened during your visit?"
            rows={5}
            className="w-full rounded-2xl px-5 py-4 bg-white text-[15px] text-[#1A1A2E] font-medium placeholder-[#C0C0D0] resize-none outline-none border-2 border-transparent focus:border-[#4A4B98] transition-colors leading-relaxed"
          />
          {error && (
            <p className="text-[13px] text-[#DA1212] font-semibold px-1">{error}</p>
          )}
          <button
            type="submit"
            disabled={submitting || !message.trim()}
            className="w-full py-4 rounded-2xl font-bold text-[16px] text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: brandColor }}
          >
            {submitting ? 'Sending…' : 'Send Feedback'}
          </button>
        </form>
      </main>
    </div>
  )
}
