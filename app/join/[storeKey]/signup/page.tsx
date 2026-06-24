'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import {
  signupStore, signupRef, signupForm, signupMember,
  type SignupStore, type SignupRef, type SignupFormData
} from '@/lib/signup-session'

// ── Phone formatting ──────────────────────────────────────────────────────

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 10)
  if (d.length === 0) return ''
  if (d.length <= 3) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0,3)}) ${d.slice(3)}`
  return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
}

function normalizePhone(v: string): string { return v.replace(/\D/g,'') }

// ── Validation ────────────────────────────────────────────────────────────

interface FormErrors {
  firstName?: string
  lastName?: string
  phone?: string
  email?: string
  smsOptIn?: string
}

function validate(fields: {
  firstName: string; lastName: string; phone: string; email: string; smsOptIn: boolean
}): FormErrors {
  const errors: FormErrors = {}
  if (!fields.firstName.trim()) errors.firstName = 'First name is required'
  if (!fields.lastName.trim())  errors.lastName  = 'Last name is required'
  const digits = normalizePhone(fields.phone)
  if (digits.length !== 10)    errors.phone     = 'Enter a valid 10-digit US phone number'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) errors.email = 'Enter a valid email address'
  if (!fields.smsOptIn)        errors.smsOptIn  = 'SMS consent is required to receive your rewards'
  return errors
}

export default function JoinSignupPage() {
  const router = useRouter()
  const params = useParams()
  const storeKey = params.storeKey as string

  const [store, setStore] = useState<SignupStore | null>(null)
  const [ref, setRef] = useState<SignupRef | null>(null)

  const [firstName, setFirstName]   = useState('')
  const [lastName, setLastName]     = useState('')
  const [phone, setPhone]           = useState('')
  const [email, setEmail]           = useState('')
  const [smsOptIn, setSmsOptIn]     = useState(false)

  const [errors, setErrors]         = useState<FormErrors>({})
  const [submitState, setSubmitState] = useState<'idle' | 'loading' | 'phone_exists' | 'email_exists' | 'error'>('idle')
  const [touched, setTouched]       = useState<Set<string>>(new Set())

  useEffect(() => {
    const s = signupStore.get()
    if (!s) { router.replace(`/join/${storeKey}`); return }
    setStore(s)
    const r = signupRef.get()
    if (r) setRef(r)

    // Restore form if user navigated back
    const saved = signupForm.get()
    if (saved) {
      setFirstName(saved.firstName)
      setLastName(saved.lastName)
      setPhone(formatPhone(saved.phone))
      setEmail(saved.email)
      setSmsOptIn(saved.smsOptIn)
    }
  }, [router, storeKey])

  function touch(field: string) {
    setTouched(prev => new Set([...prev, field]))
  }

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPhone(formatPhone(e.target.value))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setTouched(new Set(['firstName','lastName','phone','email','smsOptIn']))

    const fields = { firstName, lastName, phone, email, smsOptIn }
    const errs = validate(fields)
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    if (!store) return
    setSubmitState('loading')

    // Save form in case of error (so user doesn't retype)
    signupForm.set({ firstName, lastName, phone: normalizePhone(phone), email, smsOptIn })

    const res = await fetch('/api/join/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId:           store.id,
        merchantId:        store.merchantId,
        firstName:         firstName.trim(),
        lastName:          lastName.trim(),
        phone:             normalizePhone(phone),
        email:             email.trim().toLowerCase(),
        smsOptIn,
        referrerMemberId:  ref?.referrerMemberId ?? null,
      }),
    })

    const data = await res.json()

    if (res.status === 409) {
      setSubmitState(data.error === 'email_exists' ? 'email_exists' : 'phone_exists')
      return
    }
    if (!res.ok) {
      setSubmitState('error')
      return
    }

    signupMember.set({
      id:                 data.memberId,
      referralCode:       data.referralCode,
      referralUrl:        data.referralUrl,
      subscriptionStatus: 'free',
    })

    router.push(`/join/${storeKey}/vip`)
  }

  if (!store) return null

  const fieldClass = (field: string) => `
    w-full px-4 py-4 rounded-2xl border-2 font-['Montserrat'] text-[16px] font-semibold
    text-[#1A1A2E] bg-[#F5F5F8] outline-none transition-colors
    placeholder:text-[#D1D1DC] placeholder:font-medium
    focus:bg-white focus:border-[#4A4B98]
    ${touched.has(field) && errors[field as keyof FormErrors]
      ? 'border-[#DA1212] bg-red-50'
      : 'border-transparent'
    }
  `

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">

      {/* Mini white-label header */}
      <div
        className="px-5 py-3 flex items-center gap-2.5"
        style={{ backgroundColor: store.brandColor }}
      >
        <span
          className="font-['Coiny'] text-xl leading-none text-white"
        >
          {store.brandName}
        </span>
        <span className="text-white/50 text-[10px] font-semibold tracking-widest uppercase ml-auto">
          Powered by BinPerks
        </span>
      </div>

      {/* Referral context strip */}
      {ref && (
        <div className="bg-green-50 border-b border-green-200 px-5 py-2.5 flex items-center gap-2">
          <span className="text-base">🎁</span>
          <p className="text-[12px] font-semibold text-[#2A7D34]">
            Referred by <strong>{ref.referrerFirstName}</strong> — they'll earn 2 bonus stamps when you join!
          </p>
        </div>
      )}

      <main className="flex-1 flex flex-col items-center px-4 py-8 gap-5">
        <div className="w-full max-w-md">
          <h1 className="font-['Coiny'] text-3xl text-[#1A1A2E] mb-1">Create your account</h1>
          <p className="text-[13px] text-[#8E8EA8] font-medium">
            Takes 30 seconds. No passwords, no app.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="w-full max-w-md flex flex-col gap-4">

          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <input
                type="text"
                placeholder="First name"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                onBlur={() => touch('firstName')}
                autoComplete="given-name"
                className={fieldClass('firstName')}
              />
              {touched.has('firstName') && errors.firstName && (
                <p className="text-[11px] text-[#DA1212] font-semibold mt-1 ml-1">{errors.firstName}</p>
              )}
            </div>
            <div>
              <input
                type="text"
                placeholder="Last name"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                onBlur={() => touch('lastName')}
                autoComplete="family-name"
                className={fieldClass('lastName')}
              />
              {touched.has('lastName') && errors.lastName && (
                <p className="text-[11px] text-[#DA1212] font-semibold mt-1 ml-1">{errors.lastName}</p>
              )}
            </div>
          </div>

          {/* Phone */}
          <div>
            <input
              type="tel"
              inputMode="numeric"
              placeholder="(___) ___-____"
              value={phone}
              onChange={handlePhoneChange}
              onBlur={() => touch('phone')}
              autoComplete="tel"
              className={fieldClass('phone')}
            />
            {touched.has('phone') && errors.phone && (
              <p className="text-[11px] text-[#DA1212] font-semibold mt-1 ml-1">{errors.phone}</p>
            )}
            {submitState === 'phone_exists' && (
              <div className="mt-2 p-3 bg-orange-50 border border-orange-200 rounded-xl">
                <p className="text-[12px] font-semibold text-orange-800">
                  That number is already registered at {store.brandName}.{' '}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => router.push(`/member/login?store=${store.id}`)}
                  >
                    Sign in to your account
                  </button>
                </p>
              </div>
            )}
          </div>

          {/* Email */}
          <div>
            <input
              type="email"
              inputMode="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onBlur={() => touch('email')}
              autoComplete="email"
              className={fieldClass('email')}
            />
            {touched.has('email') && errors.email && (
              <p className="text-[11px] text-[#DA1212] font-semibold mt-1 ml-1">{errors.email}</p>
            )}
            {submitState === 'email_exists' && (
              <div className="mt-2 p-3 bg-orange-50 border border-orange-200 rounded-xl">
                <p className="text-[12px] font-semibold text-orange-800">
                  This email is already registered with BinPerks. Try a different email address,
                  or{' '}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => router.push('/member/login')}
                  >
                    sign in to your account
                  </button>.
                </p>
              </div>
            )}
          </div>

          {/* SMS consent */}
          <div
            className={`
              flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-colors
              ${smsOptIn
                ? 'bg-indigo-50 border-[#4A4B98]'
                : touched.has('smsOptIn') && errors.smsOptIn
                  ? 'bg-red-50 border-[#DA1212]'
                  : 'bg-[#F5F5F8] border-transparent'
              }
            `}
            onClick={() => { setSmsOptIn(v => !v); touch('smsOptIn') }}
          >
            <div
              className={`
                w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5
                transition-colors
                ${smsOptIn ? 'bg-[#4A4B98] border-[#4A4B98]' : 'border-[#D1D1DC] bg-white'}
              `}
            >
              {smsOptIn && <span className="text-white text-[12px] font-black">✓</span>}
            </div>
            <p className="text-[12px] font-medium text-[#1A1A2E] leading-relaxed">
              I agree to receive SMS messages about my rewards, coupons, and account updates
              from {store.brandName} via BinPerks. Message & data rates may apply.
              Reply STOP to opt out anytime.
            </p>
          </div>
          {touched.has('smsOptIn') && errors.smsOptIn && (
            <p className="text-[11px] text-[#DA1212] font-semibold -mt-2 ml-1">{errors.smsOptIn}</p>
          )}

          {/* reCAPTCHA placeholder */}
          {/*
            TODO: Add Google reCAPTCHA v3
            Install: npm install react-google-recaptcha-v3
            Wrap app in GoogleReCaptchaProvider with siteKey
            Use useGoogleReCaptcha() hook here to get token
            Send token to /api/join/create for server-side verification
          */}
          <div className="bg-[#F5F5F8] border border-[#D1D1DC] rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="w-6 h-6 rounded border-2 border-[#D1D1DC] bg-white flex-shrink-0" />
            <p className="text-[12px] text-[#8E8EA8] font-medium">reCAPTCHA verification (add before launch)</p>
            <div className="ml-auto">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <rect width="32" height="32" rx="4" fill="#F5F5F8"/>
                <path d="M16 4C9.373 4 4 9.373 4 16s5.373 12 12 12 12-5.373 12-12S22.627 4 16 4z" fill="#4A4B98" opacity=".15"/>
              </svg>
            </div>
          </div>

          {/* Generic error */}
          {submitState === 'error' && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-[12px] font-semibold text-[#DA1212]">
                Something went wrong. Please try again or email support@binperks.com.
              </p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitState === 'loading'}
            className="w-full py-5 rounded-2xl font-bold text-[17px] text-white font-['Montserrat'] tracking-wide bg-[#4A4B98] disabled:opacity-50 active:scale-[0.97] transition-all flex items-center justify-center gap-2 mt-1"
          >
            {submitState === 'loading' && (
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {submitState === 'loading' ? 'Creating your account…' : 'Create Account'}
          </button>

          <p className="text-[11px] text-[#8E8EA8] text-center font-medium">
            Already a member?{' '}
            <button
              type="button"
              className="underline text-[#4A4B98] font-semibold"
              onClick={() => router.push('/member/login')}
            >
              Sign in
            </button>
          </p>
        </form>
      </main>
    </div>
  )
}
