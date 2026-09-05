'use client'

/**
 * /member/join/[storeKey]/thankyou — confirmation + sign-in code entry.
 *
 * This is also the OTP screen a new member reaches during signup: the code was
 * already texted by /api/join/create, so they finish here rather than being
 * bounced to the login page.
 *
 * ALWAYS BINPERKS BRANDED. Every accent on this page used to be the store's
 * brand colour — the header, the confetti circle, the phone tile, the
 * "Open my dashboard" button, the VIP card and the copy button.
 *
 * THE REFERRAL LINK is the short /join/XXXXXX form. If what came back is not
 * that shape the block is hidden rather than showing the old long URL, which
 * is a link the member would then share.
 */

import { useEffect, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import EntryBrand from '@/components/EntryBrand'
import { signupStore, signupMember, signupForm, type SignupStore, type SignupMember } from '@/lib/signup-session'

const BINPERKS_BLUE = '#4A4B98'

/** app.binperks.com/join/XXXXXX — the only shape we are willing to display. */
const SHORT_REFERRAL_RE = /^https?:\/\/[^/]+\/join\/[0-9A-Z]{6}$/i

export default function ThankYouPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const storeKey = params.storeKey as string
  const plan = searchParams.get('plan') ?? 'free'      // 'free' | 'vip'

  const [store, setStore] = useState<SignupStore | null>(null)
  const [member, setMember] = useState<SignupMember | null>(null)
  const [firstName, setFirstName] = useState('')
  const [phone, setPhone] = useState('')
  const [copied, setCopied] = useState(false)

  // Sign-in code entry. Signup already texted a code (see /api/join/create),
  // so the member finishes here rather than being sent to the login page.
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [resending, setResending] = useState(false)

  useEffect(() => {
    const s = signupStore.get()
    if (!s) { router.replace(`/member/join/${storeKey}`); return }
    setStore(s)

    const m = signupMember.get()
    if (!m) { router.replace(`/member/join/${storeKey}`); return }
    setMember(m)

    const f = signupForm.get()
    if (f) { setFirstName(f.firstName); setPhone(f.phone) }
  }, [router, storeKey])

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (code.length !== 8 || !phone) return
    setVerifying(true)
    setCodeError(null)

    try {
      const res = await fetch('/api/member/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      })

      if (res.ok) {
        const data = await res.json()
        // Full-page navigation so the server-set session cookies are picked up.
        window.location.href = data.redirectUrl ?? '/member/dashboard'
        return
      }

      const data = await res.json().catch(() => ({}))
      setCode('')
      setCodeError(
        data.error === 'account_conflict'
          ? 'Your code was correct, but this number is linked to an account we can’t open. Email support@binperks.com.'
          : data.error === 'expired'
            ? 'That code has expired. Tap "Resend code" below.'
            : data.error === 'too_many_attempts'
              ? 'Too many incorrect tries. Tap "Resend code" below.'
              : 'That code is incorrect. Check your texts and try again.'
      )
    } catch {
      setCodeError('Something went wrong. Please try again.')
    } finally {
      setVerifying(false)
    }
  }

  async function handleResend() {
    if (!phone) return
    setResending(true)
    setCodeError(null)
    try {
      const res = await fetch('/api/member/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setCodeError(
          res.status === 429
            ? (d.error ?? 'Too many requests. Please wait 15 minutes.')
            : 'We couldn’t resend your code. Please try again.'
        )
      }
    } catch {
      setCodeError('We couldn’t resend your code. Please try again.')
    } finally {
      setResending(false)
    }
  }

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

  // A short code is generated for every member at signup, so this should always
  // hold. If it somehow does not, showing nothing beats handing the member a
  // link in a format we have retired.
  const showReferral = SHORT_REFERRAL_RE.test(member.referralUrl ?? '')

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">

      {/* The BinPerks door, same as every other entry surface. */}
      <EntryBrand />

      <main className="flex-1 flex flex-col items-center px-4 py-10 gap-6 max-w-md mx-auto w-full">

        {/* ── Hero confirmation ── */}
        <div className="flex flex-col items-center text-center gap-3">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-4xl"
            style={{ backgroundColor: `${BINPERKS_BLUE}18` }}
          >
            🎉
          </div>
          <h1 className="font-['Coiny'] text-3xl text-[#1A1A2E]">
            {firstName ? `Welcome, ${firstName}!` : 'You\'re in!'}
          </h1>
          <p className="text-[14px] text-[#8E8EA8] font-medium leading-relaxed">
            {isVip
              ? `Your VIP membership is active. Enter the code we just texted you to open your dashboard.`
              : `Your account is set up. Enter the code we just texted you to open your dashboard.`
            }
          </p>
        </div>

        {/* Sign-in code entry — the code was sent when the account was created. */}
        <div className="w-full bg-white rounded-2xl px-5 py-5 shadow-sm flex flex-col gap-3">
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
              style={{ backgroundColor: `${BINPERKS_BLUE}15` }}
            >
              📱
            </div>
            <div>
              <p className="text-[14px] font-bold text-[#1A1A2E] mb-1">Check your texts</p>
              <p className="text-[13px] text-[#8E8EA8] font-medium leading-relaxed">
                We sent an 8-digit sign-in code to your phone. It expires in 10 minutes.
                No password needed — ever.
              </p>
            </div>
          </div>

          <form onSubmit={handleVerify} className="flex flex-col gap-3">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              placeholder="12345678"
              value={code}
              onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 8)); setCodeError(null) }}
              autoComplete="one-time-code"
              aria-label="8-digit sign-in code"
              className={`
                w-full px-4 py-4 rounded-2xl border-2 bg-[#F5F5F8] font-['Montserrat']
                text-[24px] font-bold text-[#1A1A2E] tracking-[0.3em] text-center outline-none
                placeholder:text-[#D1D1DC] placeholder:font-normal placeholder:tracking-normal
                focus:bg-white transition-colors
                ${codeError ? 'border-[#DA1212] bg-red-50' : 'border-transparent'}
              `}
            />

            {codeError && (
              <p className="text-[12px] font-semibold text-[#DA1212] text-center">{codeError}</p>
            )}

            <button
              type="submit"
              disabled={code.length !== 8 || verifying}
              className="w-full py-4 rounded-2xl font-bold text-[16px] text-white font-['Montserrat'] disabled:opacity-35 active:scale-[0.97] transition-all flex items-center justify-center gap-2"
              style={{ backgroundColor: BINPERKS_BLUE }}
            >
              {verifying && (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              )}
              {verifying ? 'Signing in…' : 'Open my dashboard'}
            </button>

            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="text-[13px] font-semibold text-[#8E8EA8] underline disabled:opacity-40"
            >
              {resending ? 'Sending…' : 'Resend code'}
            </button>
          </form>
        </div>

        {/* VIP confirmation card */}
        {isVip && (
          <div
            className="w-full rounded-2xl px-5 py-4 flex items-center gap-4"
            style={{ backgroundColor: `${BINPERKS_BLUE}12`, border: `2px solid ${BINPERKS_BLUE}30` }}
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

        {/* ── Referral section ──
            Hidden entirely when the URL is not the short form, rather than
            falling back to the old long link the member would then share. */}
        {showReferral && (
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
                backgroundColor: copied ? '#2A7D34' : `${BINPERKS_BLUE}15`,
                color: copied ? 'white' : BINPERKS_BLUE,
              }}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>

        </div>
        )}

        {/* Footer */}
        <p className="text-[11px] text-[#8E8EA8] text-center font-medium">
          Questions? <a href="mailto:support@binperks.com" className="underline">support@binperks.com</a>
        </p>

      </main>
    </div>
  )
}
