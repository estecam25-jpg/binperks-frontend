/**
 * /auth/confirm
 *
 * Intermediate sign-in page. The magic link in the SMS points here instead of
 * directly to /auth/callback. This prevents SMS app link-preview bots from
 * consuming the single-use token before the user taps the link.
 *
 * Flow:
 *   SMS link → /auth/confirm?token_hash=XXX&type=magiclink&next=/member/dashboard
 *   User taps "Sign In" button → POST /api/auth/confirm
 *   API calls verifyOtp, sets session cookies, returns { redirectUrl }
 *   Client navigates to redirectUrl (member dashboard)
 */

'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'

function ConfirmForm() {
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const token_hash = searchParams.get('token_hash')
  const type       = searchParams.get('type')
  const next       = searchParams.get('next') ?? '/member/dashboard'

  async function handleSignIn() {
    if (!token_hash || !type) {
      setError('Invalid sign-in link. Please request a new one.')
      return
    }
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/auth/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token_hash, type, next }),
      })

      const data = await res.json()

      if (!res.ok || data.error) {
        setError('This sign-in link has expired or already been used. Please request a new one.')
        setLoading(false)
        return
      }

      // Session cookies were set in the POST response — navigate to dashboard
      window.location.href = data.redirectUrl
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-[#F5F5F8] px-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-8 text-center">

        {/* BinPerks branding */}
        <div>
          <h1 className="font-['Coiny'] text-4xl text-[#4A4B98]">BinPerks</h1>
          <p className="text-[13px] text-[#8E8EA8] font-medium mt-1 font-['Montserrat']">
            Member Portal
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-8 w-full flex flex-col items-center gap-6">
          <div className="w-16 h-16 rounded-full bg-[#4A4B98]/10 flex items-center justify-center text-3xl">
            🔐
          </div>

          <div>
            <h2 className="text-[20px] font-bold text-[#1A1A2E] font-['Montserrat']">
              Ready to sign in?
            </h2>
            <p className="text-[13px] text-[#8E8EA8] font-medium mt-2 leading-relaxed font-['Montserrat']">
              Tap the button below to securely sign in to your BinPerks account.
            </p>
          </div>

          {error ? (
            <div className="w-full bg-red-50 border border-red-200 rounded-xl p-4 text-left">
              <p className="text-[13px] text-red-700 font-medium font-['Montserrat']">{error}</p>
              <a
                href="/member/join"
                className="text-[13px] text-[#4A4B98] font-bold underline mt-2 block font-['Montserrat']"
              >
                Return to store finder →
              </a>
            </div>
          ) : (
            <button
              onClick={handleSignIn}
              disabled={loading || !token_hash}
              className="w-full py-4 rounded-2xl font-bold text-[16px] font-['Montserrat'] shadow-md active:scale-[0.97] transition-transform disabled:opacity-60"
              style={{ backgroundColor: '#4A4B98', color: '#FFFFFF' }}
            >
              {loading ? 'Signing in…' : 'Tap to Sign In'}
            </button>
          )}
        </div>

        <p className="text-[11px] text-[#8E8EA8] font-medium font-['Montserrat']">
          Powered by BinPerks
        </p>
      </div>
    </div>
  )
}

export default function AuthConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh flex items-center justify-center bg-[#F5F5F8]">
          <p className="text-[#8E8EA8] text-[13px] font-medium font-['Montserrat']">Loading…</p>
        </div>
      }
    >
      <ConfirmForm />
    </Suspense>
  )
}
