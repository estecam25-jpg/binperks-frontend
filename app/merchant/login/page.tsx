'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

function MerchantLoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const inputRef = useRef<HTMLInputElement>(null)
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'not_found' | 'error'>('idle')
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.includes('@')) return
    setStatus('sending')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: email.toLowerCase().trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/merchant/dashboard`,
      },
    })

    // Supabase returns success even if email doesn't exist (security)
    // so we always show "check your email"
    setStatus(error ? 'error' : 'sent')
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

          {status !== 'sent' ? (
            <>
              <div>
                <h2 className="font-['Coiny'] text-2xl text-[#1A1A2E] mb-0.5">Sign in to your dashboard</h2>
                <p className="text-[13px] text-[#8E8EA8] font-medium">
                  Enter your email and we'll send a sign-in link.
                </p>
              </div>

              {authError && (
                <div className="p-3.5 bg-orange-50 border border-orange-200 rounded-xl">
                  <p className="text-[13px] font-semibold text-orange-800 leading-snug">
                    That sign-in link expired or was already used. Enter your email below to get a new one.
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
                  {status === 'sending' ? 'Sending link…' : 'Send Sign-In Link'}
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
            /* Sent state */
            <div className="flex flex-col items-center gap-4 py-3 text-center">
              <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center text-3xl">
                📧
              </div>
              <div>
                <h2 className="font-['Coiny'] text-2xl text-[#1A1A2E] mb-1">Check your email</h2>
                <p className="text-[13px] text-[#8E8EA8] font-medium leading-relaxed">
                  We sent a sign-in link to <strong className="text-[#1A1A2E]">{email}</strong>.
                  Tap it to open your dashboard.
                </p>
              </div>
              <div className="bg-[#F5F5F8] rounded-xl px-4 py-3 w-full">
                <p className="text-[12px] text-[#8E8EA8] font-medium">
                  Don't see it? Check your spam folder.
                  The link expires in 1 hour.
                </p>
              </div>
              <button
                onClick={() => setStatus('idle')}
                className="text-[13px] font-semibold text-[#8E8EA8] underline"
              >
                Use a different email
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
