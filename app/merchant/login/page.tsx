'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

/** Seconds the Resend button stays disabled. The server allows 5 sends per
 *  email per 15 minutes; this keeps a merchant from burning that on taps. */
const RESEND_COOLDOWN = 30

function MerchantLoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const inputRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)
  const [email, setEmail] = useState('')
  const [confirmCode, setConfirmCode] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'verifying' | 'code_error' | 'error'>('idle')
  const [authError, setAuthError] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [cooldown, setCooldown] = useState(0)

  // Resend runs from the code screen, which is selected by `status`. Setting
  // status to 'sending' there would route back to the email step mid-resend,
  // so resend tracks its own in-flight flag and leaves status alone.
  const [resending, setResending] = useState(false)

  // Which channels the server actually reached. Merchants without a phone on
  // file get email only, and the copy has to say so rather than promise a text
  // that was never sent.
  const [sentSms, setSentSms] = useState(false)

  useEffect(() => {
    // Skip login if already authenticated
    createClient().auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/merchant/dashboard')
    })
    inputRef.current?.focus()
    // ?error=auth = sign-in code was expired or already used
    if (searchParams.get('error') === 'auth') setAuthError(true)
  }, [router, searchParams])

  // Focus code input when code entry step appears
  useEffect(() => {
    if (status === 'sent') codeRef.current?.focus()
  }, [status])

  // Resend cooldown ticker
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  /**
   * Request a code. Used by the email form and by Resend.
   *
   * `isResend` keeps the caller on the code screen: it reports progress via
   * `resending` and reports failure as 'code_error', where the email form
   * uses 'sending' / 'error'.
   */
  async function requestCode(isResend = false) {
    if (isResend) setResending(true)
    else setStatus('sending')
    setErrorMsg('')

    const failWith = (msg: string) => {
      setErrorMsg(msg)
      setStatus(isResend ? 'code_error' : 'error')
    }

    let res: Response
    try {
      res = await fetch('/api/merchant/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      })
    } catch {
      failWith('Something went wrong. Please try again.')
      setResending(false)
      return
    }

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      failWith(
        res.status === 404
          ? "We couldn't find a merchant account for that email."
          : res.status === 429
            ? (data.error ?? 'Too many requests. Please wait 15 minutes and try again.')
            : "We couldn't send your code. Please try again or email support@binperks.com.",
      )
      setResending(false)
      return
    }

    setSentSms(Boolean(data.sentSms))
    setConfirmCode('')
    setStatus('sent')
    setCooldown(RESEND_COOLDOWN)
    setResending(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.includes('@')) return
    requestCode()
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    const code = confirmCode.replace(/\D/g, '')
    if (code.length !== 8) return
    setStatus('verifying')
    setErrorMsg('')

    let res: Response
    try {
      res = await fetch('/api/merchant/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase().trim(), code }),
      })
    } catch {
      setStatus('code_error')
      setErrorMsg('Something went wrong. Please try again.')
      return
    }

    if (res.ok) {
      const data = await res.json().catch(() => ({}))
      // Full-page navigation so cookies set by the server are picked up
      window.location.href = data.redirectUrl ?? '/merchant/dashboard'
      return
    }

    const data = await res.json().catch(() => ({}))
    setStatus('code_error')
    setConfirmCode('')
    codeRef.current?.focus()
    setErrorMsg(
      data.error === 'account_conflict'
        ? 'Your code was correct, but this email is linked to an account we can’t open. Email support@binperks.com.'
        : data.error === 'expired'
          ? 'That code has expired. Tap "Resend code" to get a new one.'
          : data.error === 'too_many_attempts'
            ? 'Too many incorrect tries. Tap "Resend code" to get a new one.'
            : 'That code is incorrect. Check your email and try again.',
    )
  }

  const canSubmit = email.includes('@') && status !== 'sending'

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">

      {/* Hero */}
      <div className="bg-[#1A1A2E] px-6 pt-14 pb-20 flex flex-col items-center gap-3 text-center">
        <span className="text-4xl">🏷️</span>
        <h1 className="font-['Coiny'] text-5xl text-white tracking-wide leading-none">BinPerks</h1>
        <p className="text-[13px] font-bold tracking-widest uppercase text-[#FFB217]">
          Merchant sign in
        </p>
      </div>

      <div className="flex-1 flex flex-col items-center px-4 -mt-8 pb-12">
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl px-6 pt-6 pb-7 flex flex-col gap-5">

          {status !== 'sent' && status !== 'verifying' && status !== 'code_error' ? (
            <>
              <div>
                <h2 className="font-['Coiny'] text-2xl text-[#1A1A2E] mb-0.5">Sign in to your dashboard</h2>
                <p className="text-[13px] text-[#8E8EA8] font-medium">
                  Enter your email and we&apos;ll send a sign-in code.
                </p>
              </div>

              {authError && (
                <div className="p-3.5 bg-orange-50 border border-orange-200 rounded-xl">
                  <p className="text-[13px] font-semibold text-orange-800 leading-snug">
                    That sign-in code expired or was already used. Enter your email below to get a new one.
                  </p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
                <input
                  ref={inputRef}
                  type="email"
                  inputMode="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setStatus('idle'); setErrorMsg('') }}
                  autoComplete="email"
                  className="w-full px-4 py-4 rounded-2xl border-2 border-transparent bg-[#F5F5F8] font-['Montserrat'] text-[17px] font-semibold text-[#1A1A2E] placeholder:text-[#D1D1DC] placeholder:font-normal outline-none focus:bg-white focus:border-[#4A4B98] transition-colors"
                />

                {status === 'error' && (
                  <p className="text-[12px] font-semibold text-[#DA1212] leading-snug">
                    {errorMsg || 'Something went wrong. Please try again.'}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full py-[18px] rounded-2xl font-bold text-[17px] text-white font-['Montserrat'] bg-[#4A4B98] disabled:opacity-35 active:scale-[0.97] transition-all flex items-center justify-center gap-2"
                >
                  {status === 'sending' && (
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  )}
                  {status === 'sending' ? 'Sending code…' : 'Send Sign-In Code'}
                </button>
              </form>

              <p className="text-[11px] text-[#8E8EA8] text-center font-medium">
                Not a merchant yet?{' '}
                <button
                  onClick={() => router.push('/merchant/signup')}
                  className="underline text-[#4A4B98] font-semibold"
                >
                  Apply to join BinPerks
                </button>
              </p>
            </>
          ) : (
            /* Code entry step */
            <div className="flex flex-col gap-5">
              <div className="flex flex-col items-center gap-3 pt-2 text-center">
                <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center text-3xl">
                  📧
                </div>
                <div>
                  <h2 className="font-['Coiny'] text-2xl text-[#1A1A2E] mb-1">
                    {sentSms ? 'Check your email or texts' : 'Check your email'}
                  </h2>
                  <p className="text-[13px] text-[#8E8EA8] font-medium leading-relaxed">
                    We sent an 8-digit code to{' '}
                    <strong className="text-[#1A1A2E]">{email}</strong>.
                  </p>
                  {/* Only claims the SMS channel when the server actually
                      reached it — most merchants have no phone on file. */}
                  <p className="text-[12px] text-[#8E8EA8] font-medium mt-1">
                    {sentSms ? 'Code sent to your email and phone' : 'Code sent to your email'}
                  </p>
                </div>
              </div>

              <form onSubmit={handleCodeSubmit} className="flex flex-col gap-3">
                <input
                  ref={codeRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  placeholder="12345678"
                  value={confirmCode}
                  onChange={e => {
                    setConfirmCode(e.target.value.replace(/\D/g, ''))
                    if (status === 'code_error') setStatus('sent')
                  }}
                  className="w-full px-4 py-4 rounded-2xl border-2 border-transparent bg-[#F5F5F8] font-['Montserrat'] text-[24px] font-bold text-[#1A1A2E] tracking-[0.3em] text-center placeholder:text-[#D1D1DC] placeholder:font-normal placeholder:tracking-normal outline-none focus:bg-white focus:border-[#4A4B98] transition-colors"
                />

                {status === 'code_error' && errorMsg && (
                  <p className="text-[12px] font-semibold text-[#DA1212] text-center leading-snug">
                    {errorMsg}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={confirmCode.length < 8 || status === 'verifying'}
                  className="w-full py-[18px] rounded-2xl font-bold text-[17px] text-white font-['Montserrat'] bg-[#4A4B98] disabled:opacity-35 active:scale-[0.97] transition-all flex items-center justify-center gap-2"
                >
                  {status === 'verifying' && (
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  )}
                  {status === 'verifying' ? 'Signing in…' : 'Sign In'}
                </button>
              </form>

              <div className="bg-[#F5F5F8] rounded-xl px-4 py-3">
                <p className="text-[12px] text-[#8E8EA8] font-medium text-center">
                  Don&apos;t see it? Check your spam folder. The code expires in 10 minutes.
                </p>
              </div>

              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={() => requestCode(true)}
                  disabled={cooldown > 0 || resending}
                  className="text-[13px] font-bold text-[#4A4B98] underline disabled:opacity-40 disabled:no-underline"
                >
                  {resending
                    ? 'Sending…'
                    : cooldown > 0
                      ? `Resend code in ${cooldown}s`
                      : 'Resend code'}
                </button>
                <button
                  onClick={() => {
                    setStatus('idle'); setConfirmCode(''); setErrorMsg(''); setCooldown(0)
                  }}
                  className="text-[13px] font-semibold text-[#8E8EA8] underline"
                >
                  Use a different email
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-[11px] text-[#8E8EA8] text-center font-medium mt-5">
          Need help?{' '}
          <a href="mailto:support@binperks.com" className="underline text-[#4A4B98] font-semibold">
            support@binperks.com
          </a>
        </p>
      </div>
    </div>
  )
}

// Suspense wrapper required because useSearchParams() opts the component into
// dynamic rendering — Next.js requires this at the page boundary.
export default function MerchantLoginPage() {
  return (
    <Suspense>
      <MerchantLoginContent />
    </Suspense>
  )
}
