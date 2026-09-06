'use client'

/**
 * The member sign-in form: phone in, then the 8-digit code texted via GHL.
 *
 * BINPERKS BLUE THROUGHOUT. Every accent here used to be the store's brand
 * colour, passed down from the page. The prop is gone rather than defaulted, so
 * there is nothing for a future edit to thread a store colour back into.
 *
 * THE "WHICH STORE?" ACCOUNT PICKER IS GONE. It existed for a phone linked to
 * more than one rewards account, which V3 does not permit: one phone is one
 * BinPerks account network-wide (CLAUDE.md rule 17), enforced by
 * idx_members_phone_unique, an unconditional UNIQUE index on members.phone.
 * Two rows cannot share a number, so /api/member/login can no longer reach its
 * multiple_accounts branch. It is still handled defensively below, because a
 * silent generic error would be worse than an honest one if that ever changed.
 *
 * storeKey is only used to point the "Join BinPerks" links at
 * /member/join/[storeKey], which keeps Origin Store attribution intact for
 * someone who turns out not to have an account yet.
 */

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

const BINPERKS_BLUE = '#4A4B98'

interface Props {
  storeKey: string
}

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 10)
  if (d.length === 0) return ''
  if (d.length <= 3) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0,3)}) ${d.slice(3)}`
  return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
}

function normalizePhone(v: string): string { return v.replace(/\D/g, '') }

/** Which screen the member is on. */
type Step = 'phone' | 'code'

/** In-flight network state, orthogonal to the step. */
type Status = 'idle' | 'sending' | 'verifying'

/** Seconds the "Resend code" button stays disabled after a send. Keeps members
 *  from burning through the server-side 5-per-15-minutes budget by reflex. */
const RESEND_COOLDOWN = 30

function LoginFormContent({ storeKey }: Props) {
  const searchParams = useSearchParams()
  const codeRef = useRef<HTMLInputElement>(null)

  const [phone, setPhone] = useState('')
  const [touched, setTouched] = useState(false)
  const [step, setStep] = useState<Step>('phone')
  const [status, setStatus] = useState<Status>('idle')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [authError, setAuthError] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (searchParams.get('error') === 'auth') setAuthError(true)
  }, [searchParams])

  // Focus the code box as soon as the code step appears
  useEffect(() => {
    if (step === 'code') codeRef.current?.focus()
  }, [step])

  // Resend cooldown ticker
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const digits = normalizePhone(phone)
  const phoneValid = digits.length === 10

  /** Requests a code. Used by the phone form and by Resend. */
  async function requestCode() {
    setStatus('sending')
    setError(null)
    setNotFound(false)

    let res: Response
    try {
      res = await fetch('/api/member/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: digits }),
      })
    } catch {
      setStatus('idle')
      setError('Something went wrong. Please try again.')
      return
    }

    if (res.status === 404) {
      setStatus('idle')
      setNotFound(true)
      setStep('phone')
      return
    }

    if (res.status === 429) {
      const data = await res.json().catch(() => ({}))
      setStatus('idle')
      setError(data.error ?? 'Too many requests. Please wait 15 minutes before trying again.')
      return
    }

    if (!res.ok) {
      setStatus('idle')
      setError('Something went wrong. Please try again.')
      return
    }

    const data = await res.json()

    // Unreachable while phone is globally unique — see the note at the top.
    // Surfaced as a support message rather than the generic failure below, so
    // that if the constraint ever changed the cause would be obvious.
    if (data.error === 'multiple_accounts') {
      setStatus('idle')
      setError('This number is linked to more than one account. Email support@binperks.com and we’ll sort it out.')
      return
    }

    if (!data.ok) {
      setStatus('idle')
      setError('Something went wrong. Please try again.')
      return
    }

    setCode('')
    setStatus('idle')
    setStep('code')
    setCooldown(RESEND_COOLDOWN)
  }

  function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!phoneValid) return
    requestCode()
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (code.length !== 8) return
    setStatus('verifying')
    setError(null)

    let res: Response
    try {
      res = await fetch('/api/member/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: digits, code }),
      })
    } catch {
      setStatus('idle')
      setError('Something went wrong. Please try again.')
      return
    }

    if (res.ok) {
      const data = await res.json()
      // Full-page navigation so the cookies set by the server are picked up
      window.location.href = data.redirectUrl ?? '/member/dashboard'
      return
    }

    const data = await res.json().catch(() => ({}))
    setStatus('idle')
    setCode('')
    codeRef.current?.focus()

    if (data.error === 'account_conflict') {
      // Right code, wrong identity behind it — retrying cannot help.
      setError('Your code was correct, but this number is linked to an account we can’t open. Email support@binperks.com and we’ll fix it.')
    } else if (data.error === 'expired') {
      setError('That code has expired. Tap "Resend code" to get a new one.')
    } else if (data.error === 'too_many_attempts') {
      setError('Too many incorrect tries. Tap "Resend code" to get a new one.')
    } else {
      setError('That code is incorrect. Check your texts and try again.')
    }
  }

  function backToPhone() {
    setStep('phone')
    setStatus('idle')
    setCode('')
    setError(null)
    setNotFound(false)
  }

  /* ---------------------------------------------------------------- code */

  if (step === 'code') {
    return (
      <div className="w-full flex flex-col gap-5">
        <div className="flex flex-col items-center gap-3 text-center pt-2">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
            style={{ backgroundColor: `${BINPERKS_BLUE}15` }}
          >
            📱
          </div>
          <div>
            <h1 className="font-['Coiny'] text-2xl text-[#1A1A2E] mb-1">Check your texts</h1>
            <p className="text-[14px] text-[#8E8EA8] font-medium leading-relaxed">
              We sent an 8-digit code to{' '}
              <strong className="text-[#1A1A2E]">{formatPhone(phone)}</strong>.
            </p>
          </div>
        </div>

        <form onSubmit={handleCodeSubmit} className="w-full flex flex-col gap-3">
          <input
            ref={codeRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={8}
            placeholder="12345678"
            value={code}
            onChange={e => {
              setCode(e.target.value.replace(/\D/g, '').slice(0, 8))
              setError(null)
            }}
            autoComplete="one-time-code"
            className={`
              w-full px-4 py-4 rounded-2xl border-2 bg-white font-['Montserrat'] text-[24px] font-bold
              text-[#1A1A2E] tracking-[0.3em] text-center outline-none transition-colors
              placeholder:text-[#D1D1DC] placeholder:font-normal placeholder:tracking-normal
              ${error ? 'border-[#DA1212] bg-red-50' : 'border-transparent'}
            `}
          />

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-[12px] font-semibold text-[#DA1212] text-center">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={code.length !== 8 || status === 'verifying'}
            className="w-full py-5 rounded-2xl font-bold text-[17px] text-white font-['Montserrat'] tracking-wide disabled:opacity-40 active:scale-[0.97] transition-all flex items-center justify-center gap-2"
            style={{ backgroundColor: BINPERKS_BLUE }}
          >
            {status === 'verifying' && (
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {status === 'verifying' ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div className="bg-white rounded-xl px-4 py-3">
          <p className="text-[12px] text-[#8E8EA8] font-medium text-center">
            The code expires in 10 minutes.
          </p>
        </div>

        <div className="flex flex-col items-center gap-2">
          <button
            onClick={() => requestCode()}
            disabled={cooldown > 0 || status === 'sending'}
            className="text-[13px] font-bold underline disabled:opacity-40 disabled:no-underline"
            style={{ color: BINPERKS_BLUE }}
          >
            {status === 'sending'
              ? 'Sending…'
              : cooldown > 0
                ? `Resend code in ${cooldown}s`
                : 'Resend code'}
          </button>
          <button
            onClick={backToPhone}
            className="text-[13px] font-semibold text-[#8E8EA8] underline"
          >
            Use a different number
          </button>
        </div>
      </div>
    )
  }

  /* --------------------------------------------------------------- phone */

  return (
    <>
      {/* No logo here: EntryBrand above the form already carries the mark, and
          two BinPerks logos stacked is one too many. */}
      <div className="w-full flex flex-col items-center text-center">
        <h1 className="font-['Coiny'] text-2xl text-[#1A1A2E] mb-1">Sign in</h1>
        <p className="text-[14px] text-[#8E8EA8] font-medium">
          Enter your phone number and we&apos;ll text you a sign-in code.
        </p>
      </div>

      {authError && (
        <div className="w-full p-3.5 bg-orange-50 border border-orange-200 rounded-xl">
          <p className="text-[13px] font-semibold text-orange-800 leading-snug">
            That sign-in code expired or was already used. Enter your number below to get a new one.
          </p>
        </div>
      )}

      <form onSubmit={handlePhoneSubmit} noValidate className="w-full flex flex-col gap-4">
        <div>
          <input
            type="tel"
            inputMode="numeric"
            placeholder="(___) ___-____"
            value={phone}
            onChange={e => setPhone(formatPhone(e.target.value))}
            onBlur={() => setTouched(true)}
            autoComplete="tel"
            autoFocus
            className={`
              w-full px-4 py-4 rounded-2xl border-2 font-['Montserrat'] text-[16px] font-semibold
              text-[#1A1A2E] bg-white outline-none transition-colors
              placeholder:text-[#D1D1DC] placeholder:font-medium
              ${touched && !phoneValid ? 'border-[#DA1212] bg-red-50' : 'border-transparent'}
            `}
          />
          {touched && !phoneValid && (
            <p className="text-[11px] text-[#DA1212] font-semibold mt-1 ml-1">
              Enter a valid 10-digit US phone number
            </p>
          )}
        </div>

        {notFound && (
          <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl">
            <p className="text-[12px] font-semibold text-orange-800">
              We couldn&apos;t find an account for that number.{' '}
              <a
                href={`/member/join/${storeKey}`}
                className="underline font-bold"
                style={{ color: BINPERKS_BLUE }}
              >
                Join BinPerks →
              </a>
            </p>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-[12px] font-semibold text-[#DA1212]">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={status === 'sending'}
          className="w-full py-5 rounded-2xl font-bold text-[17px] text-white font-['Montserrat'] tracking-wide disabled:opacity-50 active:scale-[0.97] transition-all flex items-center justify-center gap-2"
          style={{ backgroundColor: BINPERKS_BLUE }}
        >
          {status === 'sending' && (
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          )}
          {status === 'sending' ? 'Sending code…' : 'Send Sign-In Code'}
        </button>
      </form>

      <p className="text-[13px] text-[#8E8EA8] text-center font-medium">
        New here?{' '}
        <a
          href={`/member/join/${storeKey}`}
          className="font-bold underline"
          style={{ color: BINPERKS_BLUE }}
        >
          Join BinPerks →
        </a>
      </p>

      <p className="text-[11px] text-[#8E8EA8] text-center font-medium">
        Questions? <a href="mailto:support@binperks.com" className="underline">support@binperks.com</a>
      </p>
    </>
  )
}

// Suspense wrapper required because useSearchParams() opts the component into
// dynamic rendering — Next.js requires this at the page boundary.
export default function LoginForm({ storeKey }: Props) {
  return (
    <Suspense>
      <LoginFormContent storeKey={storeKey} />
    </Suspense>
  )
}
