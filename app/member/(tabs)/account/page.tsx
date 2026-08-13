'use client'

/**
 * Member settings.
 *
 * A BinPerks surface, not a store surface — BinPerks colors and wording only.
 * The membership is with the network; the store a member enrolled through is
 * an attribution fact and does not get to brand this page.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import GetTheApp from '@/components/member/GetTheApp'
import AppHeader from '@/components/member/AppHeader'

/** The only brand color on this page. */
const BINPERKS_BLUE = '#4A4B98'

interface MeResponse {
  member: {
    firstName: string; phone: string; email: string; smsOptIn: boolean
    subscriptionStatus?: 'free' | 'vip'
  }
}

interface VipStatus {
  vip: boolean
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: string | null
  cancelsAt: string | null
  /** VIP whose Stripe subscription we can't act on — no stored id, or the
   *  subscription is gone. They have to go through support. */
  unmanageable: boolean
}

/** "September 8, 2026". Empty for a missing or unparseable date. */
function formatLongDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
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

  // VIP membership management. Loaded separately from /me because it reads
  // live from Stripe and only this page needs it.
  const [vip, setVip] = useState<VipStatus | null>(null)
  const [confirmingCancelVip, setConfirmingCancelVip] = useState(false)
  const [cancellingVip, setCancellingVip] = useState(false)
  const [vipError, setVipError] = useState('')

  useEffect(() => {
    fetch('/api/member/me').then(res => {
      // Home page, not /member/login — that route is a store picker, and
      // sending a signed-out member there makes them choose a store before
      // they can even type a phone number.
      if (res.status === 401) { router.replace('/'); return null }
      return res.ok ? res.json() : null
    }).then(d => {
      if (d) {
        setData(d)
        setSmsOptIn(d.member.smsOptIn)
      }
      setLoading(false)
    })

    fetch('/api/member/cancel-vip')
      .then(res => res.ok ? res.json() : null)
      .then(d => { if (d) setVip(d) })
      .catch(() => { /* Settings still works without the VIP block. */ })
  }, [router])

  async function handleCancelVip() {
    setCancellingVip(true); setVipError('')
    const res = await fetch('/api/member/cancel-vip', { method: 'POST' })
    const d = await res.json().catch(() => null)
    if (res.ok) {
      // Reflect the new schedule without a reload. Still VIP — only the
      // renewal is off.
      setVip(prev => prev
        ? { ...prev, cancelAtPeriodEnd: true, cancelsAt: d?.cancelsAt ?? prev.currentPeriodEnd }
        : prev)
      setConfirmingCancelVip(false)
    } else {
      setVipError(
        d?.error === 'no_active_subscription'
          ? "We couldn't find an active subscription. Email support@binperks.com and we'll sort it out."
          : "Something went wrong. Please try again, or email support@binperks.com.",
      )
    }
    setCancellingVip(false)
  }

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
      router.replace('/')
    } else {
      setDeactivating(false)
    }
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#F5F5F8]">
        <span className="w-8 h-8 border-[3px] border-[#EBEBF2] border-t-[#4A4B98] rounded-full animate-spin" />
      </div>
    )
  }

  if (!data) return null

  function formatPhone(digits: string): string {
    if (digits.length !== 10) return digits
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
  }

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">
      <AppHeader />

      <main className="flex-1 flex flex-col items-center px-4 py-8 gap-4 max-w-md mx-auto w-full">
        <h1 className="font-['Coiny'] text-[26px] text-[#1A1A2E] self-start leading-tight">Account</h1>

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


        {/* ── Membership: Starter ──
            The VIP block below covers members who have one; this covers those
            who don't, so the section is never simply absent. */}
        {vip && !vip.vip && (
          <div className="w-full bg-white rounded-2xl px-5 py-5 shadow-sm flex flex-col gap-3">
            <p className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#8E8EA8]">
              Membership
            </p>
            <p className="text-[14px] font-bold text-[#1A1A2E]">🪨 Starter Membership — Free</p>
            <p className="text-[12px] text-[#8E8EA8] font-medium leading-relaxed">
              Starter members earn one lifetime reward. Upgrade to VIP to keep earning.
            </p>
            <Link
              href="/member/upgrade"
              className="w-full py-3.5 rounded-xl font-bold text-[15px] text-white text-center active:opacity-80 transition-opacity"
              style={{ backgroundColor: BINPERKS_BLUE }}
            >
              Upgrade to VIP
            </Link>
          </div>
        )}

        {/* ── VIP membership ──
            Only for members who actually have one. Cancelling is a downgrade
            to Starter, entirely separate from deactivating the account. */}
        {vip?.vip && (
          <div className="w-full bg-white rounded-2xl px-5 py-5 shadow-sm flex flex-col gap-3">
            <p className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#8E8EA8]">
              Manage VIP membership
            </p>

            {vip.unmanageable ? (
              <>
                <p className="text-[14px] font-bold text-[#1A1A2E]">💎 VIP member</p>
                <p className="text-[12px] text-[#8E8EA8] font-medium leading-relaxed">
                  To change or cancel your membership, email{' '}
                  <a href="mailto:support@binperks.com" className="underline text-[#4A4B98] font-semibold">
                    support@binperks.com
                  </a>{' '}
                  and we&apos;ll take care of it.
                </p>
              </>
            ) : vip.cancelAtPeriodEnd ? (
              <>
                <p className="text-[14px] font-bold text-[#8A6A00]">
                  Your VIP membership will end on {formatLongDate(vip.cancelsAt)}
                </p>
                <p className="text-[12px] text-[#8E8EA8] font-medium leading-relaxed">
                  You keep every VIP benefit until then. After that you&apos;ll move to Starter.
                  Your stamps and coupon history are never deleted.
                </p>
              </>
            ) : (
              <>
                <p className="text-[14px] font-bold text-[#1A1A2E]">💎 VIP member — $29.99/month</p>
                {vip.currentPeriodEnd && (
                  <p className="text-[12px] text-[#8E8EA8] font-medium">
                    Renews {formatLongDate(vip.currentPeriodEnd)}
                  </p>
                )}

                {!confirmingCancelVip ? (
                  <button
                    onClick={() => { setConfirmingCancelVip(true); setVipError('') }}
                    className="self-start text-[12px] font-semibold text-[#DA1212] underline"
                  >
                    Cancel VIP Membership
                  </button>
                ) : (
                  <div className="bg-[#F5F5F8] rounded-2xl px-4 py-4 flex flex-col gap-2.5">
                    <p className="text-[12px] font-semibold text-[#1A1A2E] leading-relaxed">
                      Your VIP membership will remain active until{' '}
                      {formatLongDate(vip.currentPeriodEnd) || 'the end of your billing period'}.
                      After that you&apos;ll be downgraded to Starter. Your stamps and coupon
                      history are never deleted.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmingCancelVip(false)}
                        className="flex-1 py-2.5 rounded-xl font-semibold text-[13px] text-[#1A1A2E] bg-white border-2 border-[#EBEBF2]"
                      >
                        Keep VIP
                      </button>
                      <button
                        onClick={handleCancelVip}
                        disabled={cancellingVip}
                        className="flex-1 py-2.5 rounded-xl font-bold text-[13px] text-white bg-[#DA1212] disabled:opacity-50"
                      >
                        {cancellingVip ? 'Cancelling…' : 'Confirm'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {vipError && (
              <p className="text-[12px] font-semibold text-[#DA1212] leading-snug">{vipError}</p>
            )}
          </div>
        )}

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

        {/* Reference section — always visible, never dismissable, unlike the
            one-time banner on the dashboard. */}
        <GetTheApp />

        {/* No quick links here by design. Data export is gone — BinPerks owns
            member data, and access requests go through support per the Privacy
            Policy. Feedback is gone too: members get a GHL SMS invite an hour
            after a stamp, which is when they have something to say. */}

        {/* ── Account actions ──
            Set apart from everything above: these end a session or a
            membership, and should not sit flush against a settings toggle. */}
        <div className="w-full mt-4 pt-5 border-t-2 border-[#EBEBF2] flex flex-col gap-3">
          <p className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#8E8EA8] px-1">
            Account actions
          </p>

          <button
            onClick={handleSignOut}
            className="w-full py-4 rounded-2xl font-semibold text-[14px] font-['Montserrat'] text-[#8E8EA8] border-2 border-[#EBEBF2] active:border-[#1A1A2E] active:text-[#1A1A2E] transition-colors"
          >
            Sign out
          </button>

        <div className="w-full flex flex-col items-center gap-2">
          {!confirmingDeactivate ? (
            <button onClick={() => setConfirmingDeactivate(true)} className="text-[12px] font-semibold text-[#DA1212]">
              Deactivate my account
            </button>
          ) : (
            <div className="w-full bg-red-50 border border-red-200 rounded-2xl px-4 py-4 flex flex-col gap-2.5">
              <p className="text-[12px] font-semibold text-[#DA1212]">
                This deactivates your BinPerks membership across the whole network, not just
                one store. Your stamp and coupon history is kept, never deleted — contact
                support if you change your mind.
              </p>
              {/* Says so explicitly because the old flow silently kept billing. */}
              {vip?.vip && !vip.cancelAtPeriodEnd && (
                <p className="text-[12px] font-semibold text-[#DA1212]">
                  Deactivating your account will also cancel any active VIP subscription at the
                  end of your current billing period.
                </p>
              )}
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
        </div>
      </main>
    </div>
  )
}
