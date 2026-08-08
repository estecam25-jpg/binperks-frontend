'use client'

/**
 * Admin sign-in — two steps, mirroring /merchant/login.
 *
 *   1. Email entry  → POST /api/admin/login       (mints and emails the code)
 *   2. Code entry   → POST /api/admin/verify-code (redeems it, sets the session)
 *
 * Previously this called supabase.auth.signInWithOtp() directly and sent a
 * Supabase magic link. The code is ours now, so the whole exchange goes
 * through our own routes and the token never reaches the browser.
 *
 * Email is the only channel — there is no admin phone anywhere in the schema,
 * so the copy says "your email" rather than the merchant flow's conditional
 * email-or-phone wording.
 */

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

/** Seconds the Resend button stays disabled. The server allows 5 sends per
 *  email per 15 minutes; this keeps an admin from burning that on taps. */
const RESEND_COOLDOWN = 30

export default function AdminLoginPage() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  // Blank, not prefilled — the old default (enina@estecam.com) is no longer on
  // the allow-list.
  const [email, setEmail] = useState('')
  const [confirmCode, setConfirmCode] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'verifying' | 'code_error' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [cooldown, setCooldown] = useState(0)

  // Resend runs from the code screen, which is selected by `status`. Setting
  // status to 'sending' there would route back to the email step mid-resend,
  // so resend tracks its own in-flight flag and leaves status alone.
  const [resending, setResending] = useState(false)

  useEffect(() => {
    createClient().auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/admin/dashboard')
    })
    inputRef.current?.focus()
  }, [router])

  useEffect(() => {
    if (status === 'sent') codeRef.current?.focus()
  }, [status])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  /**
   * Request a code. Used by the email form and by Resend.
   *
   * `isResend` keeps the caller on the code screen: it reports progress via
   * `resending` and reports failure as 'code_error', where the email form uses
   * 'sending' / 'error'.
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
      res = await fetch('/api/admin/login', {
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
        res.status === 403
          ? 'That email is not an admin account.'
          : res.status === 429
            ? (data.error ?? 'Too many requests. Please wait 15 minutes and try again.')
            : "We couldn't send your code. Please try again.",
      )
      setResending(false)
      return
    }

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
      res = await fetch('/api/admin/verify-code', {
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
      // Full-page navigation so cookies set by the server are picked up.
      window.location.href = data.redirectUrl ?? '/admin/dashboard'
      return
    }

    const data = await res.json().catch(() => ({}))
    setStatus('code_error')
    setConfirmCode('')
    codeRef.current?.focus()
    setErrorMsg(
      data.error === 'not_admin'
        ? 'That email is not an admin account.'
        : data.error === 'account_conflict'
          ? 'Your code was correct, but it opened an account we can’t use for admin.'
          : data.error === 'expired'
            ? 'That code has expired. Tap "Resend code" to get a new one.'
            : data.error === 'too_many_attempts'
              ? 'Too many incorrect tries. Tap "Resend code" to get a new one.'
              : 'That code is incorrect. Check your email and try again.',
    )
  }

  const canSubmit = email.includes('@') && status !== 'sending'
  const onCodeStep = status === 'sent' || status === 'verifying' || status === 'code_error'

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-[#1A1A2E] px-4">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="text-center">
          <div className="font-['Coiny'] text-5xl text-white tracking-wide">BinPerks</div>
          <div className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#FFB217] mt-1">
            Admin Dashboard
          </div>
        </div>

        <div className="bg-white rounded-3xl px-6 pt-6 pb-7 flex flex-col gap-5 shadow-2xl">
          {!onCodeStep ? (
            <>
              <div>
                <h1 className="font-['Coiny'] text-2xl text-[#1A1A2E]">Admin sign in</h1>
                <p className="text-[13px] text-[#8E8EA8] font-medium mt-0.5">
                  Enter your email and we&apos;ll send an 8-digit code.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
                <input
                  ref={inputRef}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setStatus('idle'); setErrorMsg('') }}
                  placeholder="admin@binperks.com"
                  className="w-full px-4 py-4 rounded-2xl border-2 border-transparent bg-[#F5F5F8] font-['Montserrat'] text-[16px] font-semibold text-[#1A1A2E] placeholder:text-[#D1D1DC] placeholder:font-normal outline-none focus:bg-white focus:border-[#1A1A2E] transition-colors"
                />

                {status === 'error' && (
                  <p className="text-[12px] font-semibold text-[#DA1212] leading-snug">
                    {errorMsg || 'Something went wrong. Try again.'}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full py-4 rounded-2xl font-bold text-[16px] text-white font-['Montserrat'] bg-[#1A1A2E] disabled:opacity-40 transition-opacity flex items-center justify-center gap-2"
                >
                  {status === 'sending' && (
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  )}
                  {status === 'sending' ? 'Sending…' : 'Send Sign-In Code'}
                </button>
              </form>
            </>
          ) : (
            /* Code entry step */
            <div className="flex flex-col gap-5">
              <div className="flex flex-col items-center gap-3 pt-1 text-center">
                <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center text-2xl">
                  📧
                </div>
                <div>
                  <h1 className="font-['Coiny'] text-2xl text-[#1A1A2E] mb-1">Enter your code</h1>
                  <p className="text-[13px] text-[#8E8EA8] font-medium leading-relaxed">
                    We sent an 8-digit code to{' '}
                    <strong className="text-[#1A1A2E]">{email}</strong>.
                  </p>
                  <p className="text-[12px] text-[#8E8EA8] font-medium mt-1">
                    Code sent to your email
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
                  autoComplete="one-time-code"
                  placeholder="12345678"
                  value={confirmCode}
                  onChange={e => {
                    setConfirmCode(e.target.value.replace(/\D/g, ''))
                    if (status === 'code_error') setStatus('sent')
                  }}
                  className="w-full px-4 py-4 rounded-2xl border-2 border-transparent bg-[#F5F5F8] font-['Montserrat'] text-[24px] font-bold text-[#1A1A2E] tracking-[0.3em] text-center placeholder:text-[#D1D1DC] placeholder:font-normal placeholder:tracking-normal outline-none focus:bg-white focus:border-[#1A1A2E] transition-colors"
                />

                {status === 'code_error' && errorMsg && (
                  <p className="text-[12px] font-semibold text-[#DA1212] text-center leading-snug">
                    {errorMsg}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={confirmCode.length < 8 || status === 'verifying'}
                  className="w-full py-4 rounded-2xl font-bold text-[16px] text-white font-['Montserrat'] bg-[#1A1A2E] disabled:opacity-40 transition-opacity flex items-center justify-center gap-2"
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
                  className="text-[13px] font-bold text-[#1A1A2E] underline disabled:opacity-40 disabled:no-underline"
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
      </div>
    </div>
  )
}
