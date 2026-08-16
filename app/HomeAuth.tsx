'use client'

import { useState, useEffect, useRef, useMemo } from 'react'

/**
 * Combined member sign-in / join flow on app.binperks.com (V3 Change 1).
 *
 * One phone field is the whole front door. Whether the number is already a
 * member decides the branch, so the member never has to know which button
 * they were supposed to press:
 *
 *   phone → /api/member/login
 *     200 ok               → code screen          (returning member)
 *     200 multiple_accounts→ account picker → code screen
 *     404 not_found        → signup form → code screen
 *
 *   code  → /api/member/verify-code → /member/dashboard
 *
 * There is NO store picker. A member never chooses their Origin Store: showing
 * a merchant list during signup both invited a wrong choice and put a
 * merchant's name on a BinPerks page. Origin comes from ?store= or ?ref= in the
 * URL, and otherwise defaults to the BinPerks house origin, which earns no
 * merchant commission (lib/binperks-origin).
 *
 * The QR path (/member/join/[storeKey]/signup) is untouched.
 *
 * Merchants are not offered here — /merchant/login only.
 */


/** Resend cooldown, seconds. The server allows 5 sends per phone per 15 min;
 *  this keeps a member from spending that budget by reflex. */
const RESEND_COOLDOWN = 30


type Step = 'phone' | 'accounts' | 'signup' | 'exists' | 'code'
type Status = 'idle' | 'busy'

interface Account {
  memberId: string
  storeName: string
  brandName: string
  brandColor: string
}

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 10)
  if (d.length === 0) return ''
  if (d.length <= 3) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

const digitsOnly = (v: string) => v.replace(/\D/g, '')
const zipValid = (v: string) => /^\d{5}$/.test(v.trim())
const emailValid = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

export default function HomeAuth() {
  const [step, setStep]     = useState<Step>('phone')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError]   = useState<string | null>(null)

  const [phone, setPhone]       = useState('')
  const [phoneTouched, setPhoneTouched] = useState(false)

  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedMemberId, setSelectedMemberId] = useState<string | undefined>()

  const [zip, setZip]               = useState('')

  /**
   * Origin, read silently from the URL. Never rendered — the member sees clean
   * BinPerks branding whichever link brought them here.
   *   ?store=<uuid>     a store QR or direct store link
   *   ?ref=<memberId>   a member referral (set by /join/[code])
   * Absent → the server falls back to the BinPerks house origin.
   */
  const origin = useMemo(() => {
    if (typeof window === 'undefined') return {} as { storeId?: string; merchantId?: string; referrerMemberId?: string }
    const q = new URLSearchParams(window.location.search)
    return {
      storeId:          q.get('store')    ?? undefined,
      merchantId:       q.get('merchant') ?? undefined,
      referrerMemberId: q.get('referrer') ?? q.get('ref') ?? undefined,
    }
  }, [])

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName]   = useState('')
  const [email, setEmail]         = useState('')
  const [smsOptIn, setSmsOptIn]   = useState(false)
  const [signupTouched, setSignupTouched] = useState(false)

  const [code, setCode]         = useState('')
  const [cooldown, setCooldown] = useState(0)

  const codeRef = useRef<HTMLInputElement>(null)

  const digits = digitsOnly(phone)
  const phoneValid = digits.length === 10

  useEffect(() => { if (step === 'code') codeRef.current?.focus() }, [step])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  /* --------------------------------------------------------------- actions */

  /** Ask for a code. Doubles as the "is this phone a member?" probe. */
  async function requestCode(memberId?: string) {
    setStatus('busy')
    setError(null)

    let res: Response
    try {
      res = await fetch('/api/member/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: digits, memberId }),
      })
    } catch {
      setStatus('idle'); setError('Something went wrong. Please try again.'); return
    }

    // Not a member yet — send them down the join branch.
    if (res.status === 404) {
      setStatus('idle')
      setStep('signup')
      return
    }

    if (res.status === 429) {
      const d = await res.json().catch(() => ({}))
      setStatus('idle')
      setError(d.error ?? 'Too many requests. Please wait 15 minutes and try again.')
      return
    }

    if (!res.ok) {
      setStatus('idle'); setError('Something went wrong. Please try again.'); return
    }

    const data = await res.json()

    if (data.error === 'multiple_accounts') {
      setAccounts(data.accounts ?? [])
      setStatus('idle')
      setStep('accounts')
      return
    }

    if (!data.ok) {
      setStatus('idle'); setError('Something went wrong. Please try again.'); return
    }

    setSelectedMemberId(memberId)
    setCode('')
    setStatus('idle')
    setStep('code')
    setCooldown(RESEND_COOLDOWN)
  }

  function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPhoneTouched(true)
    if (!phoneValid) return
    requestCode()
  }

  async function handleSignupSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSignupTouched(true)
    if (!firstName.trim() || !lastName.trim() || !emailValid(email) || !zipValid(zip) || !smsOptIn) return

    setStatus('busy')
    setError(null)

    let res: Response
    try {
      res = await fetch('/api/join/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Omitted entirely when the URL carried no store, which is what
          // tells the server to use the BinPerks house origin.
          ...(origin.storeId ? { storeId: origin.storeId, merchantId: origin.merchantId } : {}),
          ...(origin.referrerMemberId ? { referrerMemberId: origin.referrerMemberId } : {}),
          firstName:  firstName.trim(),
          lastName:   lastName.trim(),
          phone:      digits,
          email:      email.trim().toLowerCase(),
          zipCode:    zip.trim(),
          smsOptIn,
        }),
      })
    } catch {
      setStatus('idle'); setError('Something went wrong. Please try again.'); return
    }

    const data = await res.json().catch(() => ({}))

    if (res.status === 409) {
      setStatus('idle')

      // An email clash is fixable in place — a different address works — so it
      // stays an inline error on the form.
      if (data.error === 'email_exists') {
        setError('That email is already registered with BinPerks. Try another, or sign in with the phone on that account.')
        return
      }

      // A phone clash is NOT fixable on this form: one phone is one BinPerks
      // account network-wide, so the answer is to sign in, not to try again.
      // Its own screen rather than an inline error, because the next action is
      // somewhere else.
      setError(null)
      setStep('exists')
      return
    }

    if (!res.ok) {
      setStatus('idle')
      setError('We couldn’t create your account. Please try again or email support@binperks.com.')
      return
    }

    setStatus('idle')

    // Account exists but the SMS never went out — don't strand them on a code
    // screen for a code that was never sent.
    if (data.otpSent === false) {
      setError('Your account is ready, but we couldn’t text your code. Tap "Resend code" to try again.')
    }

    setCode('')
    setStep('code')
    setCooldown(RESEND_COOLDOWN)
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (code.length !== 8) return
    setStatus('busy')
    setError(null)

    let res: Response
    try {
      res = await fetch('/api/member/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: digits, code }),
      })
    } catch {
      setStatus('idle'); setError('Something went wrong. Please try again.'); return
    }

    if (res.ok) {
      const data = await res.json()
      // Full-page navigation so the server-set cookies are picked up.
      window.location.href = data.redirectUrl ?? '/member/dashboard'
      return
    }

    const data = await res.json().catch(() => ({}))
    setStatus('idle')
    setCode('')
    codeRef.current?.focus()

    // account_conflict means the code was right but signed in an identity with
    // no membership behind it. Retrying lands in the same place, so say so
    // rather than inviting another attempt.
    setError(
      data.error === 'account_conflict'
        ? 'Your code was correct, but this number is linked to an account we can’t open. Email support@binperks.com and we’ll fix it.'
        : data.error === 'expired'
          ? 'That code has expired. Tap "Resend code" to get a new one.'
          : data.error === 'too_many_attempts'
            ? 'Too many incorrect tries. Tap "Resend code" to get a new one.'
            : 'That code is incorrect. Check your texts and try again.'
    )
  }

  function startOver() {
    setStep('phone'); setStatus('idle'); setError(null)
    setCode(''); setZip('')
    setFirstName(''); setLastName(''); setEmail(''); setSmsOptIn(false)
    setSignupTouched(false); setSelectedMemberId(undefined)
  }

  /* ------------------------------------------------------------------- UI */

  const card = 'w-full bg-white rounded-3xl shadow-xl px-6 pt-6 pb-7 flex flex-col gap-5'
  const field = `
    w-full px-4 py-4 rounded-2xl border-2 border-transparent bg-[#F5F5F8]
    font-['Montserrat'] text-[16px] font-semibold text-[#1A1A2E] outline-none
    placeholder:text-[#D1D1DC] placeholder:font-medium
    focus:bg-white focus:border-[#4A4B98] transition-colors
  `
  const primaryBtn = `
    w-full py-[18px] rounded-2xl font-bold text-[17px] text-white font-['Montserrat']
    bg-[#4A4B98] disabled:opacity-35 active:scale-[0.97] transition-all
    flex items-center justify-center gap-2
  `
  const spinner = <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />

  const errorBox = error && (
    <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
      <p className="text-[12px] font-semibold text-[#DA1212] leading-snug">{error}</p>
    </div>
  )

  /* --------------------------------------------------------------- code */

  if (step === 'code') {
    return (
      <div className={card}>
        <div className="flex flex-col items-center gap-3 text-center pt-1">
          <div className="w-16 h-16 rounded-full bg-[#4A4B98]/10 flex items-center justify-center text-3xl">
            📱
          </div>
          <div>
            <h2 className="font-['Coiny'] text-2xl text-[#1A1A2E] mb-1">Check your texts</h2>
            <p className="text-[13px] text-[#8E8EA8] font-medium leading-relaxed">
              We sent an 8-digit code to{' '}
              <strong className="text-[#1A1A2E]">{formatPhone(phone)}</strong>.
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
            value={code}
            onChange={e => { setCode(digitsOnly(e.target.value).slice(0, 8)); setError(null) }}
            autoComplete="one-time-code"
            aria-label="8-digit sign-in code"
            className={`
              w-full px-4 py-4 rounded-2xl border-2 bg-[#F5F5F8] font-['Montserrat']
              text-[24px] font-bold text-[#1A1A2E] tracking-[0.3em] text-center outline-none
              placeholder:text-[#D1D1DC] placeholder:font-normal placeholder:tracking-normal
              focus:bg-white transition-colors
              ${error ? 'border-[#DA1212] bg-red-50' : 'border-transparent'}
            `}
          />

          {errorBox}

          <button type="submit" disabled={code.length !== 8 || status === 'busy'} className={primaryBtn}>
            {status === 'busy' && spinner}
            {status === 'busy' ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div className="bg-[#F5F5F8] rounded-xl px-4 py-3">
          <p className="text-[12px] text-[#8E8EA8] font-medium text-center">
            The code expires in 10 minutes.
          </p>
        </div>

        <div className="flex flex-col items-center gap-2">
          <button
            onClick={() => requestCode(selectedMemberId)}
            disabled={cooldown > 0 || status === 'busy'}
            className="text-[13px] font-bold text-[#4A4B98] underline disabled:opacity-40 disabled:no-underline"
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </button>
          <button onClick={startOver} className="text-[13px] font-semibold text-[#8E8EA8] underline">
            Use a different number
          </button>
        </div>
      </div>
    )
  }

  /* ------------------------------------------------------------- accounts */

  if (step === 'accounts') {
    return (
      <div className={card}>
        <div className="text-center">
          <h2 className="font-['Coiny'] text-2xl text-[#1A1A2E] mb-1">Which store?</h2>
          <p className="text-[13px] text-[#8E8EA8] font-medium">
            This number is linked to more than one rewards account.
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          {accounts.map(a => (
            <button
              key={a.memberId}
              onClick={() => requestCode(a.memberId)}
              disabled={status === 'busy'}
              className="w-full flex items-center gap-3 bg-[#F5F5F8] rounded-2xl px-4 py-4 active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: a.brandColor }} />
              <span className="text-[14px] font-bold text-[#1A1A2E]">{a.storeName}</span>
            </button>
          ))}
        </div>

        {errorBox}

        <button onClick={startOver} className="text-[13px] font-semibold text-[#8E8EA8] underline self-center">
          Back
        </button>
      </div>
    )
  }

  /* ------------------------------------------------------- already a member */

  if (step === 'exists') {
    return (
      <div className={card}>
        <div className="text-center">
          <h2 className="font-['Coiny'] text-2xl text-[#1A1A2E] mb-1">
            You already have a BinPerks account
          </h2>
          <p className="text-[13px] text-[#8E8EA8] font-medium">
            Sign in instead — your stamps and rewards are waiting.
          </p>
        </div>

        {/* Back to the phone step with the number kept, which IS the sign-in
            flow on this page: submitting it sends a code. */}
        <button
          onClick={() => { setStep('phone'); setError(null); setStatus('idle') }}
          className="w-full py-[18px] rounded-2xl font-bold text-[17px] text-white font-['Montserrat'] bg-[#4A4B98] active:scale-[0.97] transition-all"
        >
          Sign in instead
        </button>

        <p className="text-[12px] text-[#8E8EA8] font-medium text-center leading-relaxed">
          Trouble signing in? Email{' '}
          <a href="mailto:support@binperks.com" className="underline">support@binperks.com</a>.
        </p>
      </div>
    )
  }

  /* --------------------------------------------------------------- signup */

  if (step === 'signup') {
    const nameError  = signupTouched && (!firstName.trim() || !lastName.trim())
    const mailError  = signupTouched && !emailValid(email)
    const zipError   = signupTouched && !zipValid(zip)
    const optInError = signupTouched && !smsOptIn
    const canSubmit  =
      firstName.trim() && lastName.trim() && emailValid(email) && zipValid(zip)
      && smsOptIn && status !== 'busy'

    return (
      <div className={card}>
        <div>
          <h2 className="font-['Coiny'] text-2xl text-[#1A1A2E] mb-1">Almost there</h2>
          <p className="text-[13px] text-[#8E8EA8] font-medium">
            Join BinPerks and start earning rewards at every participating store.
          </p>
        </div>

        <form onSubmit={handleSignupSubmit} noValidate className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="First name"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              autoComplete="given-name"
              aria-label="First name"
              className={field}
            />
            <input
              type="text"
              placeholder="Last name"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              autoComplete="family-name"
              aria-label="Last name"
              className={field}
            />
          </div>
          {nameError && (
            <p className="text-[11px] text-[#DA1212] font-semibold -mt-1 ml-1">
              Enter your first and last name
            </p>
          )}

          <input
            type="email"
            inputMode="email"
            placeholder="Email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
            aria-label="Email address"
            className={field}
          />
          {mailError && (
            <p className="text-[11px] text-[#DA1212] font-semibold -mt-1 ml-1">
              Enter a valid email address
            </p>
          )}

          {/* Zip code — numeric keypad on mobile; 5 digits, required. Stored
              as-is; city/state are not derived from it yet. */}
          <input
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={5}
            placeholder="Zip Code"
            aria-label="Zip Code"
            value={zip}
            onChange={e => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
            className={field}
          />
          {zipError && (
            <p className="text-[11px] text-[#DA1212] font-semibold -mt-1 ml-1">
              Enter a 5-digit zip code
            </p>
          )}

          {/* Phone is already known from step 1 — shown, not re-asked. */}
          <div className="bg-[#F5F5F8] rounded-2xl px-4 py-3 flex items-center gap-2">
            <span className="text-[12px] font-semibold text-[#8E8EA8]">Phone</span>
            <span className="text-[14px] font-bold text-[#1A1A2E] ml-auto">{formatPhone(phone)}</span>
          </div>

          {/* SMS consent — required before we text anyone. */}
          <div
            onClick={() => setSmsOptIn(v => !v)}
            className={`
              flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-colors
              ${smsOptIn
                ? 'bg-indigo-50 border-[#4A4B98]'
                : optInError ? 'bg-red-50 border-[#DA1212]' : 'bg-[#F5F5F8] border-transparent'}
            `}
          >
            <div className={`
              w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors
              ${smsOptIn ? 'bg-[#4A4B98] border-[#4A4B98]' : 'border-[#D1D1DC] bg-white'}
            `}>
              {smsOptIn && <span className="text-white text-[12px] font-black">✓</span>}
            </div>
            <p className="text-[12px] font-medium text-[#1A1A2E] leading-relaxed">
              I agree to receive SMS messages about my rewards, coupons, and account updates
              from BinPerks. Message &amp; data rates may apply.
              Reply STOP to opt out anytime.
            </p>
          </div>
          {optInError && (
            <p className="text-[11px] text-[#DA1212] font-semibold -mt-1 ml-1">
              SMS consent is required — your sign-in code is sent by text
            </p>
          )}

          {errorBox}

          <p className="text-[11px] text-[#8E8EA8] font-medium text-center leading-relaxed">
            By joining you agree to our{' '}
            <a href="/terms/member" target="_blank" rel="noopener noreferrer" className="text-[#4A4B98] font-semibold underline">Terms</a>
            {' '}and{' '}
            <a href="/terms/privacy" target="_blank" rel="noopener noreferrer" className="text-[#4A4B98] font-semibold underline">Privacy Policy</a>.
          </p>

          <button type="submit" disabled={!canSubmit} className={primaryBtn}>
            {status === 'busy' && spinner}
            {status === 'busy' ? 'Creating your account…' : 'Join BinPerks'}
          </button>
        </form>

        <button
          onClick={() => { setStep('phone'); setError(null) }}
          className="text-[13px] font-semibold text-[#8E8EA8] underline self-center"
        >
          Use a different number
        </button>
      </div>
    )
  }

  /* ---------------------------------------------------------------- phone */

  return (
    <div className={card}>
      <div>
        <h2 className="font-['Coiny'] text-2xl text-[#1A1A2E] mb-0.5">Sign in or join</h2>
        <p className="text-[13px] text-[#8E8EA8] font-medium">
          Enter your phone number. New or returning, this is the same door.
        </p>
      </div>

      <form onSubmit={handlePhoneSubmit} noValidate className="flex flex-col gap-3">
        <input
          type="tel"
          inputMode="numeric"
          placeholder="(___) ___-____"
          value={phone}
          onChange={e => setPhone(formatPhone(e.target.value))}
          onBlur={() => setPhoneTouched(true)}
          autoComplete="tel"
          aria-label="Phone number"
          autoFocus
          className={`${field} ${phoneTouched && !phoneValid ? 'border-[#DA1212] bg-red-50' : ''}`}
        />
        {phoneTouched && !phoneValid && (
          <p className="text-[11px] text-[#DA1212] font-semibold -mt-1 ml-1">
            Enter a valid 10-digit US phone number
          </p>
        )}

        {errorBox}

        <button type="submit" disabled={status === 'busy'} className={primaryBtn}>
          {status === 'busy' && spinner}
          {status === 'busy' ? 'Checking…' : 'Sign In / Join'}
        </button>
      </form>

      <p className="text-[11px] text-[#8E8EA8] text-center font-medium leading-relaxed">
        We&apos;ll text you a code. No passwords, no app.
      </p>
    </div>
  )
}
