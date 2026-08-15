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
import { resolveTier } from '@/lib/tiers'

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

function maskPhone(formatted: string): string {
  const digits = formatted.replace(/\D/g, '')
  if (digits.length !== 10) return formatted
  return `(${digits.slice(0, 3)}) ***-${digits.slice(6)}`
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
    if (!c) { router.replace(`/stamptool/${storeSession.get()?.storeKey ?? ''}`); return }
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
    if (!c) { router.replace(`/stamptool/${storeSession.get()?.storeKey ?? ''}`); return }

    const supabase = createClient()

    // Phone and active status ONLY — deliberately not scoped to this merchant.
    //
    // A BinPerks membership belongs to the network, not to the store that
    // happened to enrol the member. Origin Store decides who receives the
    // commission and nothing else; it has no bearing on where stamps can be
    // earned. Filtering by merchant_id here made every member invisible to
    // every store except their own, which is the opposite of a network.
    //
    // Not .single(): the uniqueness index on members is (phone, merchant_id),
    // so the same phone can legitimately exist under two merchants today.
    // .single() errors on more than one row, and the cashier would be told
    // "not found" about a member who in fact exists twice. Take the earliest
    // enrolment — the one whose Origin Store attribution is the real one — and
    // log the collision so the duplicate can be merged.
    const { data: matches } = await supabase
      .from('members')
      .select('id, first_name, last_name, phone, total_stamps, subscription_status, coupon_due, is_blacklisted')
      .eq('phone', digits)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(2)

    const member = matches?.[0]
    if (!member) { setLookupState('not_found'); return }

    if (matches!.length > 1) {
      console.warn(
        `[stamptool] phone ${digits} matches more than one active member — ` +
        'stamping the earliest enrolment. These memberships need merging.',
      )
    }

    if (member.is_blacklisted) { setLookupState('inactive'); return }

    const today = new Date().toISOString().split('T')[0]
    const { data: todayVisit } = await supabase
      .from('visits')
      .select('id')
      .eq('member_id', member.id)
      .eq('store_id', c.storeId)
      .eq('date', today)
      .single()

    // resolveTier, not getTier: a free member is Starter with a $5 coupon no
    // matter how many stamps they have. getTier would say Bronze/$7.
    const tier = resolveTier(member.total_stamps, member.subscription_status)

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
    router.push('/stamptool/member')
  }

  function handleRecentTap(entry: RecentLookup) {
    setPhone(entry.formattedPhone)
    setLookupState('idle')
    setFoundMember(null)
    setTimeout(handleFind, 50)
  }

  function handleSwitchCashier() {
    signOutCashier()
    router.replace(`/stamptool/${storeSession.get()?.storeKey ?? ''}`)
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
          Switch Cashier
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
                  {/* Not "at this location" — the lookup now searches the whole
                      BinPerks network, so that wording would tell a cashier to
                      re-enrol a member who already exists at another store. */}
                  No BinPerks member with that number.<br />
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
            <>
              {/* The card is now a plain panel, not a button. The tap target is
                  the Continue button below it, styled to match the big blue
                  primary button used everywhere else in this tool — a button
                  cannot be nested inside a button. */}
              <div className="flex flex-col gap-4 bg-green-50 border border-green-200 rounded-2xl p-4 w-full text-left">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-full bg-[#4A4B98] flex items-center justify-center font-['Coiny'] text-xl text-white flex-shrink-0">
                    {foundMember.firstName[0]}{foundMember.lastName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[17px] font-bold text-[#1A1A2E] truncate">
                      {foundMember.firstName} {foundMember.lastName}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <TierBadge totalStamps={foundMember.totalStamps} subscriptionStatus={foundMember.subscriptionStatus} />
                      <span className="text-[12px] font-semibold text-[#8E8EA8]">
                        {foundMember.totalStamps} stamps
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={handleProceed}
                className="w-full py-[18px] rounded-2xl font-bold text-[17px] text-white font-['Montserrat'] tracking-wide bg-[#4A4B98] disabled:opacity-35 disabled:cursor-not-allowed active:scale-[0.97] transition-all flex items-center justify-center gap-2"
              >
                Continue
              </button>
            </>
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
                  <span className="text-[12px] text-[#8E8EA8] font-medium">{maskPhone(entry.formattedPhone)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}