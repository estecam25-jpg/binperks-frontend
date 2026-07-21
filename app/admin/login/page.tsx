'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function AdminLoginPage() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [email, setEmail] = useState('enina@estecam.com')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  useEffect(() => {
    createClient().auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/admin/dashboard')
    })
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.includes('@')) return
    setStatus('sending')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: email.toLowerCase().trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/admin/dashboard`,
      },
    })
    setStatus(error ? 'error' : 'sent')
  }

  const canSubmit = email.includes('@') && status !== 'sending'

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-[#1A1A2E] px-4">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="text-center">
          <div className="font-['Coiny'] text-5xl text-white tracking-wide">BinPerks</div>
          <div className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#FFB217] mt-1">
            ⚡ God Mode
          </div>
        </div>

        <div className="bg-white rounded-3xl px-6 pt-6 pb-7 flex flex-col gap-5 shadow-2xl">
          {status !== 'sent' ? (
            <>
              <div>
                <h1 className="font-['Coiny'] text-2xl text-[#1A1A2E]">Admin sign in</h1>
                <p className="text-[13px] text-[#8E8EA8] font-medium mt-0.5">
                  Magic link will be sent to your email.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
                <input
                  ref={inputRef}
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@binperks.com"
                  className="w-full px-4 py-4 rounded-2xl border-2 border-transparent bg-[#F5F5F8] font-['Montserrat'] text-[16px] font-semibold text-[#1A1A2E] placeholder:text-[#D1D1DC] outline-none focus:bg-white focus:border-[#1A1A2E] transition-colors"
                />
                {status === 'error' && (
                  <p className="text-[12px] font-semibold text-[#DA1212]">Something went wrong. Try again.</p>
                )}
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full py-4 rounded-2xl font-bold text-[16px] text-white font-['Montserrat'] bg-[#1A1A2E] disabled:opacity-40 transition-opacity flex items-center justify-center gap-2"
                >
                  {status === 'sending' && (
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  )}
                  {status === 'sending' ? 'Sending…' : 'Send Sign-In Link'}
                </button>
              </form>
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 py-2 text-center">
              <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center text-2xl">📧</div>
              <div>
                <h2 className="font-['Coiny'] text-2xl text-[#1A1A2E] mb-1">Check your email</h2>
                <p className="text-[13px] text-[#8E8EA8] font-medium leading-relaxed">
                  Sign-in link sent to <strong className="text-[#1A1A2E]">{email}</strong>
                </p>
              </div>
              <button onClick={() => setStatus('idle')} className="text-[12px] font-semibold text-[#8E8EA8] underline">
                Use a different email
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
