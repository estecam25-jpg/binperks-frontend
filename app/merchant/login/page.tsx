'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

function MerchantLoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const inputRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)
  const [email, setEmail] = useState('')
  const [confirmCode, setConfirmCode] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'verifying' | 'code_error' | 'error'>('idle')
  const [authError, setAuthError] = useState(false)

  useEffect(() => {
    // Skip login if already authenticated
    createClient().auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/merchant/dashboard')
    })
    inputRef.current?.focus()
    // ?error=auth = magic link was expired or already used
    if (searchParams.get('error') === 'auth') setAuthError(true)
  }, [router, searchParams])

  // Focus code input when code entry step appears
  useEffect(() => {
    if (status === 'sent') codeRef.current?.focus()
  }, [status])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.includes('@')) return
    setStatus('sending')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: email.toLowerCase().trim(),
    })

    setStatus(error ? 'error' : 'sent')
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    const code = confirmCode.trim()
    if (code.length < 1) return
    setStatus('verifying')

    const res = await fetch('/api/merchant/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.toLowerCase().trim(), code }),
    })

    if (res.ok) {
      // Full-page navigation so cookies set by the server are picked up
      window.location.href = '/merchant/dashboard'
    } else {
      setStatus('code_error')
      setConfirmCode('')
      codeRef.current?.focus()
    }
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
                  onChange={e => { setEmail(e.target.value); setStatus('idle') }}
                  autoComplete="email"
                  className="w-full px-4 py-4 rounded-2xl border-2 border-transparent bg-[#F5F5F8] font-['Montserrat'] text-[17px] font-semibold text-[#1A1A2E] placeholder:text-[#D1D1DC] placeholder:font-normal outline-none focus:bg-white focus:border-[#4A4B98] transition-colors"
                />

                {status === 'error' && (
                  <p className="text-[12px] font-semibold text-[#DA1212]">
                    Something went wrong. Please try again.
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
                  <h2 className="font-['Coiny'] text-2xl text-[#1A1A2E] mb-1">Check your email</h2>
                  <p className="text-[13px] text-[#8E8EA8] font-medium leading-relaxed">
                    We sent a 6-digit code to{' '}
                    <strong className="text-[#1A1A2E]">{email}</strong>.
                  </p>
                </div>
              </div>

              <form onSubmit={handleCodeSubmit} className="flex flex-col gap-3">
                <input
                  ref={codeRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="123456"
                  value={confirmCode}
                  onChange={e => {
                    setConfirmCode(e.target.value.replace(/\D/g, ''))
                    if (status === 'code_error') setStatus('sent')
                  }}
                  className="w-full px-4 py-4 rounded-2xl border-2 border-transparent bg-[#F5F5F8] font-['Montserrat'] text-[24px] font-bold text-[#1A1A2E] tracking-[0.3em] text-center placeholder:text-[#D1D1DC] placeholder:font-normal placeholder:tracking-normal outline-none focus:bg-white focus:border-[#4A4B98] transition-colors"
                />

                {status === 'code_error' && (
                  <p className="text-[12px] font-semibold text-[#DA1212] text-center">
                    That code is incorrect or expired. Try again or request a new one.
                  </p>
                )}

                <button
                  type="submit"
                  disabled={confirmCode.length < 6 || status === 'verifying'}
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
                  Don&apos;t see it? Check your spam folder. The code expires in 60 minutes.
                </p>
              </div>

              <button
                onClick={() => { setStatus('idle'); setConfirmCode('') }}
                className="text-[13px] font-semibold text-[#8E8EA8] underline text-center"
              >
                Use a different email or resend code
              </button>
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
