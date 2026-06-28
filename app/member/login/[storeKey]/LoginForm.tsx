'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

interface Account {
  memberId: string
  storeName: string
  brandName: string
  brandColor: string
}

interface Props {
  brandColor: string
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

type ViewState = 'idle' | 'loading' | 'sent' | 'not_found' | 'multiple_accounts' | 'error'

function LoginFormContent({ brandColor, storeKey }: Props) {
  const searchParams = useSearchParams()
  const [phone, setPhone] = useState('')
  const [touched, setTouched] = useState(false)
  const [view, setView] = useState<ViewState>('idle')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [authError, setAuthError] = useState(false)

  useEffect(() => {
    if (searchParams.get('error') === 'auth') setAuthError(true)
  }, [searchParams])

  const digits = normalizePhone(phone)
  const phoneValid = digits.length === 10

  async function submitLogin(memberId?: string) {
    setView('loading')
    const res = await fetch('/api/member/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: digits, memberId }),
    })

    if (res.status === 404) { setView('not_found'); return }
    if (!res.ok) { setView('error'); return }

    const data = await res.json()
    if (data.error === 'multiple_accounts') {
      setAccounts(data.accounts ?? [])
      setView('multiple_accounts')
      return
    }
    if (!data.ok) { setView('error'); return }

    setView('sent')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!phoneValid) return
    submitLogin()
  }

  if (view === 'sent') {
    return (
      <div className="w-full flex flex-col items-center text-center gap-4 pt-6">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
          style={{ backgroundColor: `${brandColor}15` }}
        >
          📱
        </div>
        <h1 className="font-['Coiny'] text-2xl text-[#1A1A2E]">Check your texts</h1>
        <p className="text-[14px] text-[#8E8EA8] font-medium leading-relaxed">
          We sent a sign-in link to {formatPhone(phone)}. Tap it to open your rewards dashboard.
          No password needed.
        </p>
        <button
          onClick={() => setView('idle')}
          className="text-[13px] font-semibold underline mt-2"
          style={{ color: brandColor }}
        >
          Use a different number
        </button>
      </div>
    )
  }

  if (view === 'multiple_accounts') {
    return (
      <div className="w-full flex flex-col gap-4">
        <div className="text-center">
          <h1 className="font-['Coiny'] text-2xl text-[#1A1A2E] mb-1">Which store?</h1>
          <p className="text-[13px] text-[#8E8EA8] font-medium">
            This number is linked to more than one rewards account.
          </p>
        </div>
        <div className="flex flex-col gap-2.5">
          {accounts.map(acc => (
            <button
              key={acc.memberId}
              onClick={() => submitLogin(acc.memberId)}
              className="w-full flex items-center gap-3 bg-white rounded-2xl px-4 py-4 shadow-sm active:scale-[0.98] transition-transform"
            >
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: acc.brandColor }} />
              <span className="text-[14px] font-bold text-[#1A1A2E]">{acc.storeName}</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setView('idle')}
          className="text-[13px] font-semibold text-[#8E8EA8] underline self-center mt-1"
        >
          Back
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="w-full text-center">
        <h1 className="font-['Coiny'] text-3xl text-[#1A1A2E] mb-1">Welcome back</h1>
        <p className="text-[14px] text-[#8E8EA8] font-medium">
          Enter your phone number and we'll text you a sign-in link.
        </p>
      </div>

      {authError && (
        <div className="w-full p-3.5 bg-orange-50 border border-orange-200 rounded-xl">
          <p className="text-[13px] font-semibold text-orange-800 leading-snug">
            That sign-in link expired or was already used. Enter your number below to get a new one.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="w-full flex flex-col gap-4">
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

        {view === 'not_found' && (
          <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl">
            <p className="text-[12px] font-semibold text-orange-800">
              We couldn't find an account for that number.{' '}
              <a
                href={`/member/join/${storeKey}`}
                className="underline font-bold"
                style={{ color: brandColor }}
              >
                Join this store →
              </a>
            </p>
          </div>
        )}

        {view === 'error' && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-[12px] font-semibold text-[#DA1212]">
              Something went wrong. Please try again.
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={view === 'loading'}
          className="w-full py-5 rounded-2xl font-bold text-[17px] text-white font-['Montserrat'] tracking-wide disabled:opacity-50 active:scale-[0.97] transition-all flex items-center justify-center gap-2"
          style={{ backgroundColor: brandColor }}
        >
          {view === 'loading' && (
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          )}
          {view === 'loading' ? 'Sending link…' : 'Send Sign-In Link'}
        </button>
      </form>

      <p className="text-[13px] text-[#8E8EA8] text-center font-medium">
        New here?{' '}
        <a
          href={`/member/join/${storeKey}`}
          className="font-bold underline"
          style={{ color: brandColor }}
        >
          Join this store →
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
export default function LoginForm({ brandColor, storeKey }: Props) {
  return (
    <Suspense>
      <LoginFormContent brandColor={brandColor} storeKey={storeKey} />
    </Suspense>
  )
}
