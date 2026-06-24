'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

interface MeResponse {
  member: { firstName: string; phone: string; email: string; smsOptIn: boolean }
  store: { brandName: string; brandColor: string } | null
}

export default function MemberSettingsPage() {
  const router = useRouter()
  const [data, setData] = useState<MeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [smsOptIn, setSmsOptIn] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false)
  const [deactivating, setDeactivating] = useState(false)

  useEffect(() => {
    fetch('/api/member/me').then(res => {
      if (res.status === 401) { router.replace('/member/login'); return null }
      return res.ok ? res.json() : null
    }).then(d => {
      if (d) {
        setData(d)
        setSmsOptIn(d.member.smsOptIn)
      }
      setLoading(false)
    })
  }, [router])

  async function handleSmsToggle() {
    const next = !smsOptIn
    setSmsOptIn(next)
    setSaving(true)
    const res = await fetch('/api/member/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ smsOptIn: next }),
    })
    setSaving(false)
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
    else setSmsOptIn(!next) // revert on failure
  }

  async function handleDeactivate() {
    setDeactivating(true)
    const res = await fetch('/api/member/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deactivate: true }),
    })
    if (res.ok) {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.replace('/member/login')
    } else {
      setDeactivating(false)
    }
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/member/login')
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#F5F5F8]">
        <span className="w-8 h-8 border-[3px] border-[#EBEBF2] border-t-[#4A4B98] rounded-full animate-spin" />
      </div>
    )
  }

  if (!data) return null

  const brandColor = data.store?.brandColor ?? '#4A4B98'
  const brandName = data.store?.brandName ?? 'BinPerks'

  function formatPhone(digits: string): string {
    if (digits.length !== 10) return digits
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
  }

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">
      <div className="px-5 py-3 flex items-center gap-2.5" style={{ backgroundColor: brandColor }}>
        <span className="font-['Coiny'] text-xl leading-none text-white">{brandName}</span>
      </div>

      <main className="flex-1 flex flex-col items-center px-4 py-8 gap-4 max-w-md mx-auto w-full">
        <h1 className="font-['Coiny'] text-2xl text-[#1A1A2E] self-start">Settings</h1>

        {/* Profile (read-only) */}
        <div className="w-full bg-white rounded-2xl px-5 py-5 shadow-sm flex flex-col gap-3">
          <p className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#8E8EA8]">Your info</p>
          <div className="flex justify-between text-[14px]">
            <span className="text-[#8E8EA8] font-medium">Name</span>
            <span className="font-bold text-[#1A1A2E]">{data.member.firstName}</span>
          </div>
          <div className="flex justify-between text-[14px]">
            <span className="text-[#8E8EA8] font-medium">Phone</span>
            <span className="font-bold text-[#1A1A2E]">{formatPhone(data.member.phone)}</span>
          </div>
          <div className="flex justify-between text-[14px]">
            <span className="text-[#8E8EA8] font-medium">Email</span>
            <span className="font-bold text-[#1A1A2E]">{data.member.email}</span>
          </div>
          <p className="text-[11px] text-[#8E8EA8] font-medium">
            To change your name, phone, or email, contact support@binperks.com.
          </p>
        </div>

        {/* SMS opt-in */}
        <div className="w-full bg-white rounded-2xl px-5 py-5 shadow-sm flex items-center gap-3">
          <div className="flex-1">
            <p className="text-[14px] font-bold text-[#1A1A2E]">SMS notifications</p>
            <p className="text-[11px] text-[#8E8EA8] font-medium mt-0.5">
              Stamp confirmations, coupon alerts, and rewards updates.
            </p>
          </div>
          <button
            onClick={handleSmsToggle}
            disabled={saving}
            className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 ${smsOptIn ? 'bg-[#4A4B98]' : 'bg-[#D1D1DC]'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${smsOptIn ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
        {saved && <p className="text-[12px] font-semibold text-[#2A7D34] self-start">✓ Saved</p>}

        {/* Quick links */}
        <div className="w-full flex flex-col gap-2">
          <a href="/member/export" className="w-full bg-white rounded-2xl px-5 py-4 shadow-sm flex items-center justify-between">
            <span className="text-[14px] font-bold text-[#1A1A2E]">Export my data</span>
            <span className="text-[#8E8EA8]">→</span>
          </a>
          <a href="/member/feedback" className="w-full bg-white rounded-2xl px-5 py-4 shadow-sm flex items-center justify-between">
            <span className="text-[14px] font-bold text-[#1A1A2E]">Leave feedback</span>
            <span className="text-[#8E8EA8]">→</span>
          </a>
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="w-full py-4 rounded-2xl font-semibold text-[14px] font-['Montserrat'] text-[#8E8EA8] border-2 border-[#EBEBF2] active:border-[#1A1A2E] active:text-[#1A1A2E] transition-colors mt-2"
        >
          Sign out
        </button>

        {/* Deactivate */}
        <div className="w-full pt-4 border-t border-[#EBEBF2] flex flex-col items-center gap-2">
          {!confirmingDeactivate ? (
            <button onClick={() => setConfirmingDeactivate(true)} className="text-[12px] font-semibold text-[#DA1212]">
              Deactivate my account
            </button>
          ) : (
            <div className="w-full bg-red-50 border border-red-200 rounded-2xl px-4 py-4 flex flex-col gap-2.5">
              <p className="text-[12px] font-semibold text-[#DA1212]">
                This deactivates your account at {brandName}. Your stamp and coupon history is kept,
                never deleted — contact support if you change your mind.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmingDeactivate(false)}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-[13px] text-[#1A1A2E] bg-white border-2 border-[#EBEBF2]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeactivate}
                  disabled={deactivating}
                  className="flex-1 py-2.5 rounded-xl font-bold text-[13px] text-white bg-[#DA1212] disabled:opacity-50"
                >
                  {deactivating ? 'Deactivating…' : 'Confirm'}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
