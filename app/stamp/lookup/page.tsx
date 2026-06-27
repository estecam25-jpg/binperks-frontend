'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import StoreHeader from '@/components/stamp/StoreHeader'
import TierBadge from '@/components/stamp/TierBadge'
import {
  cashierSession,
  storeSession,
  foundMemberSession,
  recentLookups,
  signOutCashier,
  type FoundMember,
  type RecentLookup,
} from '@/lib/stamp-session'
import { getTier } from '@/lib/tiers'

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length === 0) return ''
  if (digits.length <= 3) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

function normalizePhone(formatted: string): string {
  return formatted.replace(/\D/g, '')
}

type LookupState = 'idle' | 'loading' | 'found' | 'not_found' | 'inactive'

export default function LookupPage() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [phone, setPhone] = useState('')
  const [lookupState, setLookupState] = useState<LookupState>('idle')
  const [foundMember, setFoundMember] = useState<FoundMember | null>(null)
  const [recent, setRecent] = useState<RecentLookup[]>([])
  const [store, setStore] = useState({ name: 'BinPerks', brandColor: '#4A4B98', logoUrl: null as string | null })
  const [cashier, setCashier] = useState({ name: '', role: 'cashier' as 'owner' | 'cashier' })

  useEffect(() => {
    const c = cashierSession.get()
    if (!c) { router.replace('/stamp'); return }
    setCashier({ name: c.name, role: c.role })
    const s = storeSession.get()
    if (s) setStore({ name: s.name, brandColor: s.brandColor, logoUrl: s.logoUrl })
    setRecent(recentLookups.get())
    inputRef.current?.focus()
  }, [router])

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatPhone(e.target.value)
    setPhone(formatted)
    setLookupState('idle')
    setFoundMember(null)
  }

  function handleClear() {
    setPhone('')
    setLookupState('idle')
    setFoundMember(null)
    inputRef.current?.focus()
  }

  const digits = normalizePhone(phone)
  const canSearch = digits.length === 10

  async function handleFind() {
    if (!canSearch) return
    setLookupState('loading')
    setFoundMember(null)

    const c = cashierSession.get()
    if (!c) { router.replace('/stamp'); return }

    const supabase = createClient()

    const { data: member } = await supabase
      .from('members')
      .select('id, first_name, last_name, phone, total_stamps, subscription_status, coupon_due, is_blacklisted')
      .eq('phone', digits)
      .eq('merchant_id', c.merchantId)
      .single()

    if (!member) { setLookupState('not_found'); return }
    if (member.is_blacklisted) { setLookupState('inactive'); return }

    const today = new Date().toISOString().split('T')[0]
    const { data: todayVisit } = await supabase
      .from('visits')
      .select('id')
      .eq('member_id', member.id)
      .eq('store_id', c.storeId)
      .eq('date', today)
      .single()

    const tier = getTier(member.total_stamps)

    const found: FoundMember = {
      id: member.id,
      firstName: member.first_name,
      lastName: member.last_name,
      phone: digits,
      totalStamps: member.total_stamps,
      subscriptionStatus: member.subscription_status,
      couponDue: member.coupon_due,
      couponValue: tier.couponValue,
      isBlacklisted: false,
      alreadyStampedToday: !!todayVisit,
    }

    setFoundMember(found)
    setLookupState('found')

    recentLookups.add({
      id: found.id,
      firstName: found.firstName,
      lastName: found.lastName,
      formattedPhone: phone,
    })
    setRecent(recentLookups.get())
  }

  function handleProceed() {
    if (!foundMember) return
    foundMemberSession.set(foundMember)
    router.push('/stamp/member')
  }

  function handleRecentTap(entry: RecentLookup) {
    setPhone(entry.formattedPhone)
    setLookupState('idle')
    setFoundMember(null)
    setTimeout(handleFind, 50)
  }

  function handleSwitchCashier() {
    signOutCashier()
    router.replace('/stamp')
  }

  const isLoading = lookupState === 'loading'

  const inputBorderColor =
    lookupState === 'found' ? 'border-[#2A7D34]' :
    lookupState === 'not_found' || lookupState === 'inactive' ? 'border-[#DA1212]' :
    'border-transparent focus-within:border-[#4A4B98]'

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">
      <StoreHeader storeName={store.name} brandColor={store.brandColor} logoUrl={store.logoUrl} />

      <div className="flex items-center justify-between px-5 py-2.5 bg-white border-b border-[#EBEBF2]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[#4A4B98] flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
            {cashier.name.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="text-[12px] font-semibold text-[#1A1A2E]">{cashier.name}</div>
            <div className="text-[11px] text-[#8E8EA8] font-medium capitalize">{cashier.role}</div>
          </div>
        </div>
        <button
          onClick={handleSwitchCashier}
          className="text-[12px] font-semibold text-[#4A4B98] border border-[#4A4B98] rounded-lg px-3 py-1.5 active:bg-[#4A4B98] active:text-white transition-colors"
        >
          Switch
        </button>
      </div>

      <main className="flex-1 flex flex-col items-center px-4 py-9 gap-5">
        <div className="bg-white rounded-2xl p-7 w-full max-w-md shadow-sm flex flex-col gap-6">
          <h1 className="font-['Coiny'] text-2xl text-[#1A1A2E]">Find a member</h1>

          <div className="flex flex-col gap-2">
            <label htmlFor="phone" className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#8E8EA8]">
              Phone number
            </label>
            <div className={`relative flex items-center bg-[#F5F5F8] rounded-2xl border-2 transition-colors ${inputBorderColor}`}>
              <input
                ref={inputRef}
                id="phone"
                type="tel"
                inputMode="numeric"
                placeholder="(___) ___-____"
                value={phone}
                onChange={handlePhoneChange}
                onKeyDown={e => { if (e.key === 'Enter') handleFind() }}
                autoComplete="off"
                className="flex-1 bg-transparent px-4 py-4 text-[22px] font-bold text-[#1A1A2E] tracking-wide placeholder:text-[#D1D1DC] placeholder:font-semibold placeholder:text-[20px] outline-none"
              />
              {phone && (
                <button
                  onClick={handleClear}
                  tabIndex={-1}
                  className="mr-3 w-7 h-7 rounded-full bg-[#D1D1DC] flex items-center justify-center text-[14px] text-[#8E8EA8]"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {lookupState === 'not_found' && (
            <div className="flex items-start gap-3.5 bg-gray-50 border border-[#D1D1DC] rounded-2xl p-4">
              <span className="text-2xl">🔍</span>
              <div>
                <p className="text-[14px] font-bold text-[#1A1A2E] mb-0.5">Member not found</p>
                <p className="text-[12px] text-[#8E8EA8] font-medium leading-relaxed">
                  No member with that number at this location.<br />
                  Ask them to scan the QR code to sign up.
                </p>
              </div>
            </div>
          )}

          {lookupState === 'inactive' && (
            <div className="flex items-start gap-3.5 bg-gray-50 border border-[#D1D1DC] rounded-2xl p-4">
              <span className="text-2xl">⛔</span>
              <div>
                <p className="text-[14px] font-bold text-[#1A1A2E] mb-0.5">Account unavailable</p>
                <p className="text-[12px] text-[#8E8EA8] font-medium">
                  This account can't be stamped right now.
                </p>
              </div>
            </div>
          )}

          {lookupState === 'found' && foundMember && (
            <button
              onClick={handleProceed}
              className="flex flex-col gap-4 bg-green-50 border border-green-200 rounded-2xl p-4 w-full text-left active:bg-green-100 transition-colors"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-full bg-[#4A4B98] flex items-center justify-center font-['Coiny'] text-xl text-white flex-shrink-0">
                  {foundMember.firstName[0]}{foundMember.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[17px] font-bold text-[#1A1A2E] truncate">
                    {foundMember.firstName} {foundMember.lastName}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <TierBadge totalStamps={foundMember.totalStamps} />
                    <span className="text-[12px] font-semibold text-[#8E8EA8]">
                      {foundMember.totalStamps} stamps
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-green-200">
                <span className="text-[13px] font-semibold text-[#2A7D34]">Tap to continue</span>
                <span className="text-[18px] text-[#2A7D34]">→</span>
              </div>
            </button>
          )}

          {lookupState === 'found' ? (
            <button
              onClick={handleFind}
              disabled={!canSearch || isLoading}
              className="self-center text-[13px] font-semibold text-[#8E8EA8] underline underline-offset-2 disabled:opacity-40"
            >
              {isLoading ? 'Looking up…' : 'Find a different member'}
            </button>
          ) : (
            <button
              onClick={handleFind}
              disabled={!canSearch || isLoading}
              className="w-full py-[18px] rounded-2xl font-bold text-[17px] text-white font-['Montserrat'] tracking-wide bg-[#4A4B98] disabled:opacity-35 disabled:cursor-not-allowed active:scale-[0.97] transition-all flex items-center justify-center gap-2"
            >
              {isLoading && (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              )}
              {isLoading ? 'Looking up…' : 'Find Member'}
            </button>
          )}
        </div>

        {recent.length > 0 && (
          <div className="w-full max-w-md">
            <p className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#8E8EA8] mb-2.5 px-1">
              Recent this shift
            </p>
            <div className="flex flex-col gap-1.5">
              {recent.map(entry => (
                <button
                  key={entry.id}
                  onClick={() => handleRecentTap(entry)}
                  className="bg-white rounded-xl px-4 py-3 flex items-center gap-3 text-left border-2 border-transparent active:border-[#4A4B98] transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-[#EBEBF2] flex items-center justify-center font-['Coiny'] text-sm text-[#8E8EA8] flex-shrink-0">
                    {entry.firstName[0]}{entry.lastName[0]}
                  </div>
                  <span className="flex-1 text-[14px] font-semibold text-[#1A1A2E]">
                    {entry.firstName} {entry.lastName}
                  </span>
                  <span className="text-[12px] text-[#8E8EA8] font-medium">{entry.formattedPhone}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}