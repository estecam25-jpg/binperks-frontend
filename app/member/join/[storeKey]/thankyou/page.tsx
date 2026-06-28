'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { signupStore, signupMember, signupForm, type SignupStore, type SignupMember } from '@/lib/signup-session'

export default function ThankYouPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const storeKey = params.storeKey as string
  const plan = searchParams.get('plan') ?? 'free'      // 'free' | 'vip'

  const [store, setStore] = useState<SignupStore | null>(null)
  const [member, setMember] = useState<SignupMember | null>(null)
  const [firstName, setFirstName] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const s = signupStore.get()
    if (!s) { router.replace(`/member/join/${storeKey}`); return }
    setStore(s)

    const m = signupMember.get()
    if (!m) { router.replace(`/member/join/${storeKey}`); return }
    setMember(m)

    const f = signupForm.get()
    if (f) setFirstName(f.firstName)
  }, [router, storeKey])

  async function handleCopyReferral() {
    if (!member) return
    try {
      await navigator.clipboard.writeText(member.referralUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback for older browsers
      const el = document.createElement('textarea')
      el.value = member.referralUrl
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  if (!store || !member) return null

  const isVip = plan === 'vip'

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">

      {/* Mini header */}
      <div
        className="px-5 py-3 flex items-center gap-2.5"
        style={{ backgroundColor: store.brandColor }}
      >
        <span className="font-['Coiny'] text-xl leading-none text-white">{store.brandName}</span>
        <span className="text-white/50 text-[10px] font-semibold tracking-widest uppercase ml-auto">
          Powered by BinPerks
        </span>
      </div>

      <main className="flex-1 flex flex-col items-center px-4 py-10 gap-6 max-w-md mx-auto w-full">

        {/* ── Hero confirmation ── */}
        <div className="flex flex-col items-center text-center gap-3">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-4xl"
            style={{ backgroundColor: `${store.brandColor}18` }}
          >
            🎉
          </div>
          <h1 className="font-['Coiny'] text-3xl text-[#1A1A2E]">
            {firstName ? `Welcome, ${firstName}!` : 'You\'re in!'}
          </h1>
          <p className="text-[14px] text-[#8E8EA8] font-medium leading-relaxed">
            {isVip
              ? `Your VIP membership is active. Check your phone for a link to your rewards dashboard.`
              : `Your account is set up. Check your phone for a link to your rewards dashboard.`
            }
          </p>
        </div>

        {/* Magic link card */}
        <div className="w-full bg-white rounded-2xl px-5 py-5 shadow-sm flex items-start gap-4">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
            style={{ backgroundColor: `${store.brandColor}15` }}
          >
            📱
          </div>
          <div>
            <p className="text-[14px] font-bold text-[#1A1A2E] mb-1">Check your texts</p>
            <p className="text-[13px] text-[#8E8EA8] font-medium leading-relaxed">
              We sent a sign-in link to your phone. Tap it to open your rewards dashboard anytime.
              No password needed — ever.
            </p>
          </div>
        </div>

        {/* VIP confirmation card */}
        {isVip && (
          <div
            className="w-full rounded-2xl px-5 py-4 flex items-center gap-4"
            style={{ backgroundColor: `${store.brandColor}12`, border: `2px solid ${store.brandColor}30` }}
          >
            <span className="text-2xl flex-shrink-0">⭐</span>
            <div>
              <p className="text-[14px] font-bold text-[#1A1A2E] mb-0.5">VIP activated</p>
              <p className="text-[12px] text-[#8E8EA8] font-medium leading-relaxed">
                You're earning faster and unlocking bigger coupons from your very first visit.
              </p>
            </div>
          </div>
        )}

        {/* ── Referral section ── */}
        <div className="w-full flex flex-col gap-3">
          <div className="flex flex-col items-center text-center gap-1">
            <p className="font-['Coiny'] text-xl text-[#1A1A2E]">Share &amp; both earn bonus stamps</p>
            <p className="text-[12px] text-[#8E8EA8] font-medium">
              When a friend joins using your link, you earn 2 bonus stamps.
            </p>
          </div>

          {/* Referral URL display */}
          <div className="bg-white rounded-2xl border-2 border-[#EBEBF2] px-4 py-3 flex items-center gap-3">
            <p className="flex-1 text-[12px] font-semibold text-[#8E8EA8] truncate">
              {member.referralUrl}
            </p>
            <button
              onClick={handleCopyReferral}
              className="flex-shrink-0 text-[12px] font-bold px-3 py-1.5 rounded-lg transition-colors"
              style={{
                backgroundColor: copied ? '#2A7D34' : `${store.brandColor}15`,
                color: copied ? 'white' : store.brandColor,
              }}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>

        </div>

        {/* Sign-in notice — dashboard is only accessible after magic link click */}
        <div className="w-full bg-white rounded-2xl border-2 border-[#EBEBF2] px-5 py-4 text-center">
          <p className="text-[14px] font-semibold text-[#1A1A2E]">
            Your sign-in link is on its way via text message.
          </p>
        </div>

        {/* Footer */}
        <p className="text-[11px] text-[#8E8EA8] text-center font-medium">
          Questions? <a href="mailto:support@binperks.com" className="underline">support@binperks.com</a>
        </p>

      </main>
    </div>
  )
}
