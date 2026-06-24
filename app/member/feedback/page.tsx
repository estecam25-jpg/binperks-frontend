'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Rating = 'wow' | 'meh' | 'mad'

interface StoreInfo {
  brandName: string
  brandColor: string
  googleReviewUrl: string | null
  facebookReviewUrl: string | null
}

const RATINGS: { value: Rating; emoji: string; label: string }[] = [
  { value: 'wow', emoji: '🤩', label: 'Wow!' },
  { value: 'meh', emoji: '😐', label: 'It was okay' },
  { value: 'mad', emoji: '😠', label: 'Not great' },
]

export default function MemberFeedbackPage() {
  const router = useRouter()
  const [store, setStore] = useState<StoreInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [rating, setRating] = useState<Rating | null>(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    fetch('/api/member/me').then(res => {
      if (res.status === 401) { router.replace('/member/login'); return null }
      return res.ok ? res.json() : null
    }).then(data => {
      if (data?.store) setStore(data.store)
      setLoading(false)
    })
  }, [router])

  async function handleSubmit() {
    if (!rating || submitting) return
    setSubmitting(true)
    const res = await fetch('/api/member/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating, notes: notes.trim() || undefined }),
    })
    setSubmitting(false)
    if (res.ok) setSubmitted(true)
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
        <span className="font-['Coiny'] text-xl leading-none text-white">{brandName}</span>
        <span className="text-white/50 text-[10px] font-semibold tracking-widest uppercase ml-auto">
          Powered by BinPerks
        </span>
      </div>

      <main className="flex-1 flex flex-col items-center px-4 py-10 gap-6 max-w-md mx-auto w-full">

        {submitted ? (
          <div className="w-full flex flex-col items-center text-center gap-4 pt-6">
            <span className="text-4xl">{rating === 'wow' ? '🎉' : '🙏'}</span>
            <h1 className="font-['Coiny'] text-2xl text-[#1A1A2E]">Thanks for letting us know</h1>

            {rating === 'wow' && (store?.googleReviewUrl || store?.facebookReviewUrl) ? (
              <>
                <p className="text-[13px] text-[#8E8EA8] font-medium leading-relaxed">
                  Glad you had a great visit! Mind sharing it with a quick review?
                </p>
                <div className="flex flex-col gap-2.5 w-full">
                  {store.googleReviewUrl && (
                    <a href={store.googleReviewUrl} target="_blank" rel="noopener noreferrer"
                      className="w-full py-4 rounded-2xl font-bold text-[15px] text-white font-['Montserrat'] text-center active:scale-[0.97] transition-all"
                      style={{ backgroundColor: brandColor }}>
                      Leave a Google review
                    </a>
                  )}
                  {store.facebookReviewUrl && (
                    <a href={store.facebookReviewUrl} target="_blank" rel="noopener noreferrer"
                      className="w-full py-4 rounded-2xl font-semibold text-[14px] text-[#1A1A2E] font-['Montserrat'] text-center border-2 border-[#EBEBF2] active:border-[#1A1A2E] transition-colors">
                      Leave a Facebook review
                    </a>
                  )}
                </div>
              </>
            ) : rating === 'mad' ? (
              <p className="text-[13px] text-[#8E8EA8] font-medium leading-relaxed">
                Your note was sent to {brandName} privately — they'll follow up if needed.
              </p>
            ) : (
              <p className="text-[13px] text-[#8E8EA8] font-medium leading-relaxed">
                We'll pass this along to {brandName}.
              </p>
            )}

            <button onClick={() => router.push('/member/dashboard')} className="text-[13px] font-semibold text-[#4A4B98] underline mt-2">
              Back to dashboard
            </button>
          </div>
        ) : (
          <>
            <div className="w-full text-center">
              <h1 className="font-['Coiny'] text-3xl text-[#1A1A2E] mb-1">How was your visit?</h1>
              <p className="text-[14px] text-[#8E8EA8] font-medium">Your feedback goes straight to {brandName}.</p>
            </div>

            <div className="w-full grid grid-cols-3 gap-2.5">
              {RATINGS.map(r => (
                <button
                  key={r.value}
                  onClick={() => setRating(r.value)}
                  className={`
                    flex flex-col items-center gap-1.5 py-5 rounded-2xl border-2 transition-all
                    ${rating === r.value ? 'border-[#4A4B98] bg-indigo-50' : 'border-transparent bg-white'}
                  `}
                >
                  <span className="text-3xl">{r.emoji}</span>
                  <span className="text-[11px] font-bold text-[#1A1A2E]">{r.label}</span>
                </button>
              ))}
            </div>

            <textarea
              rows={3}
              placeholder="Anything you'd like to add? (optional)"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              maxLength={500}
              className="w-full px-4 py-3.5 rounded-2xl border-2 border-transparent bg-white outline-none focus:border-[#4A4B98] transition-colors text-[14px] font-medium text-[#1A1A2E] placeholder:text-[#D1D1DC] resize-none"
            />

            <button
              onClick={handleSubmit}
              disabled={!rating || submitting}
              className="w-full py-5 rounded-2xl font-bold text-[17px] text-white font-['Montserrat'] tracking-wide bg-[#4A4B98] disabled:opacity-40 active:scale-[0.97] transition-all flex items-center justify-center gap-2"
            >
              {submitting && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              {submitting ? 'Sending…' : 'Send Feedback'}
            </button>
          </>
        )}
      </main>
    </div>
  )
}
