'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const ADMIN_EMAIL = 'enina@estecam.com'

interface Stats {
  totalMembers: number; totalVip: number; totalStamps: number
  couponsIssued: number; couponsRedeemed: number; activeMerchantCount: number; mrr: number
}
interface Merchant {
  id: string; name: string; owner_email: string; company_name: string
  billing_status: string; subscription_status: string; location_count: number; created_at: string
}
interface Member {
  id: string; first_name: string; last_name: string; phone: string; email: string
  subscription_status: string; total_stamps: number; is_blacklisted: boolean; created_at: string
  stores: { brand_name: string }[] | null
}

function tierLabel(m: Member) {
  if (m.subscription_status !== 'vip') return '🪨 Starter'
  if (m.total_stamps >= 2000) return '💎 Diamond'
  if (m.total_stamps >= 750)  return '🥇 Gold'
  if (m.total_stamps >= 200)  return '🥈 Silver'
  return '🥉 Bronze'
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl px-4 py-4 shadow-sm flex flex-col gap-1">
      <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#8E8EA8]">{label}</p>
      <p className="font-['Coiny'] text-3xl text-[#1A1A2E] leading-none">{value}</p>
      {sub && <p className="text-[11px] text-[#8E8EA8] font-medium">{sub}</p>}
    </div>
  )
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const [authed, setAuthed] = useState(false)
  const [stats, setStats] = useState<Stats | null>(null)
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [search, setSearch] = useState('')
  const [searching, setSearching] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [blacklistTarget, setBlacklistTarget] = useState<Member | null>(null)
  const [blacklistReason, setBlacklistReason] = useState('')

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (!user || user.email !== ADMIN_EMAIL) {
        router.replace('/admin/login')
        return
      }
      setAuthed(true)
    })
  }, [router])

  const loadData = useCallback(async () => {
    const [statsRes, merchantsRes] = await Promise.all([
      fetch('/api/admin/stats'),
      fetch('/api/admin/merchants'),
    ])
    if (statsRes.ok) setStats(await statsRes.json())
    if (merchantsRes.ok) {
      const d = await merchantsRes.json()
      setMerchants(d.merchants ?? [])
    }
  }, [])

  useEffect(() => {
    if (authed) loadData()
  }, [authed, loadData])

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!search.trim()) return
    setSearching(true)
    const res = await fetch(`/api/admin/members?search=${encodeURIComponent(search.trim())}`)
    if (res.ok) {
      const d = await res.json()
      setMembers(d.members ?? [])
    }
    setSearching(false)
  }

  async function handleMerchantAction(merchantId: string, action: 'activate' | 'deactivate') {
    setActionLoading(merchantId + action)
    await fetch('/api/admin/merchants', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchantId, action }),
    })
    await loadData()
    setActionLoading(null)
  }

  async function handleBlacklist() {
    if (!blacklistTarget || !blacklistReason.trim()) return
    setActionLoading('blacklist')
    await fetch('/api/admin/members', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: blacklistTarget.id, reason: blacklistReason.trim() }),
    })
    setMembers(prev => prev.map(m => m.id === blacklistTarget.id ? { ...m, is_blacklisted: true } : m))
    setBlacklistTarget(null)
    setBlacklistReason('')
    setActionLoading(null)
  }

  if (!authed) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#1A1A2E]">
        <span className="w-8 h-8 border-[3px] border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">
      {/* Header */}
      <div className="bg-[#1A1A2E] px-5 py-4 flex items-center justify-between">
        <div>
          <span className="font-['Coiny'] text-2xl text-white tracking-wide">BinPerks</span>
          <span className="ml-2 text-[11px] font-bold tracking-widest uppercase text-[#FFB217]">⚡ God Mode</span>
        </div>
        <button
          onClick={() => createClient().auth.signOut().then(() => router.replace('/admin/login'))}
          className="text-[12px] font-semibold text-white/50 hover:text-white/80 transition-colors"
        >
          Sign out
        </button>
      </div>

      <main className="flex-1 flex flex-col gap-6 px-4 py-6 max-w-2xl mx-auto w-full pb-16">

        {/* Overview cards */}
        <section>
          <h2 className="font-['Coiny'] text-xl text-[#1A1A2E] mb-3">Overview</h2>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Active Merchants" value={stats?.activeMerchantCount ?? '—'} />
            <StatCard label="Total Members" value={stats?.totalMembers ?? '—'} />
            <StatCard label="VIP Members" value={stats?.totalVip ?? '—'} />
            <StatCard label="Total Stamps" value={stats ? stats.totalStamps.toLocaleString() : '—'} />
            <StatCard
              label="Coupons"
              value={stats ? `${stats.couponsIssued} / ${stats.couponsRedeemed}` : '—'}
              sub="issued / redeemed"
            />
            <StatCard
              label="MRR"
              value={stats ? `$${stats.mrr.toFixed(2)}` : '—'}
              sub="active subscriptions"
            />
          </div>
        </section>

        {/* Merchant list */}
        <section>
          <h2 className="font-['Coiny'] text-xl text-[#1A1A2E] mb-3">Merchants</h2>
          <div className="flex flex-col gap-2">
            {merchants.length === 0 && (
              <p className="text-[13px] text-[#8E8EA8] font-medium px-1">No merchants yet.</p>
            )}
            {merchants.map(m => (
              <div key={m.id} className="bg-white rounded-2xl px-4 py-4 shadow-sm flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold text-[#1A1A2E] truncate">{m.company_name || m.name}</p>
                    <p className="text-[11px] text-[#8E8EA8] font-medium truncate">{m.owner_email}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      m.billing_status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {m.billing_status ?? 'pending'}
                    </span>
                    <span className="text-[10px] text-[#8E8EA8] font-medium">{m.location_count ?? 1} loc</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleMerchantAction(m.id, 'activate')}
                    disabled={!!actionLoading || m.billing_status === 'active'}
                    className="flex-1 py-2 rounded-xl text-[12px] font-bold bg-[#2A7D34] text-white disabled:opacity-40 transition-opacity"
                  >
                    {actionLoading === m.id + 'activate' ? '…' : 'Activate'}
                  </button>
                  <button
                    onClick={() => handleMerchantAction(m.id, 'deactivate')}
                    disabled={!!actionLoading || m.billing_status === 'deactivated'}
                    className="flex-1 py-2 rounded-xl text-[12px] font-bold bg-[#DA1212] text-white disabled:opacity-40 transition-opacity"
                  >
                    {actionLoading === m.id + 'deactivate' ? '…' : 'Deactivate'}
                  </button>
                </div>
                <p className="text-[10px] text-[#C0C0D0] font-medium">
                  Joined {new Date(m.created_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Member search */}
        <section>
          <h2 className="font-['Coiny'] text-xl text-[#1A1A2E] mb-3">Member search</h2>
          <form onSubmit={handleSearch} className="flex gap-2 mb-3">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Phone or email"
              className="flex-1 px-4 py-3 rounded-xl bg-white border-2 border-transparent focus:border-[#4A4B98] outline-none text-[14px] font-semibold text-[#1A1A2E] placeholder:text-[#C0C0D0] transition-colors"
            />
            <button
              type="submit"
              disabled={searching || !search.trim()}
              className="px-5 py-3 rounded-xl font-bold text-[14px] text-white bg-[#1A1A2E] disabled:opacity-40 transition-opacity"
            >
              {searching ? '…' : 'Search'}
            </button>
          </form>

          <div className="flex flex-col gap-2">
            {members.map(m => (
              <div key={m.id} className={`bg-white rounded-2xl px-4 py-4 shadow-sm flex flex-col gap-2 ${m.is_blacklisted ? 'opacity-60 border-2 border-[#DA1212]' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold text-[#1A1A2E]">{m.first_name} {m.last_name}</p>
                    <p className="text-[11px] text-[#8E8EA8] font-medium">{m.phone} · {m.email}</p>
                    <p className="text-[11px] text-[#8E8EA8] font-medium mt-0.5">
                      {tierLabel(m)} · {m.total_stamps} stamps · {Array.isArray(m.stores) && m.stores.length > 0 ? m.stores[0].brand_name : 'No store'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      m.subscription_status === 'vip' ? 'bg-[#4A4B98] text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {m.subscription_status}
                    </span>
                    {m.is_blacklisted && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">blacklisted</span>
                    )}
                  </div>
                </div>
                {!m.is_blacklisted && (
                  <button
                    onClick={() => setBlacklistTarget(m)}
                    className="w-full py-2 rounded-xl text-[12px] font-bold text-[#DA1212] border-2 border-[#DA1212] transition-opacity active:opacity-70"
                  >
                    Blacklist member
                  </button>
                )}
                <p className="text-[10px] text-[#C0C0D0] font-medium">
                  Joined {new Date(m.created_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Blacklist modal */}
      {blacklistTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center px-4 z-50">
          <div className="bg-white rounded-3xl px-6 py-6 w-full max-w-sm flex flex-col gap-4 shadow-2xl">
            <h3 className="font-['Coiny'] text-xl text-[#1A1A2E]">
              Blacklist {blacklistTarget.first_name} {blacklistTarget.last_name}?
            </h3>
            <p className="text-[13px] text-[#8E8EA8] font-medium leading-relaxed">
              This will block the member from using BinPerks. A reason is required.
            </p>
            <textarea
              value={blacklistReason}
              onChange={e => setBlacklistReason(e.target.value)}
              placeholder="Reason for blacklisting…"
              rows={3}
              className="w-full rounded-xl border-2 border-[#EBEBF2] px-4 py-3 text-[14px] font-medium text-[#1A1A2E] placeholder-[#C5C5D5] resize-none outline-none focus:border-[#DA1212] transition-colors"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setBlacklistTarget(null); setBlacklistReason('') }}
                className="flex-1 py-3 rounded-xl text-[14px] font-bold text-[#8E8EA8] border-2 border-[#EBEBF2]"
              >
                Cancel
              </button>
              <button
                onClick={handleBlacklist}
                disabled={!blacklistReason.trim() || actionLoading === 'blacklist'}
                className="flex-1 py-3 rounded-xl text-[14px] font-bold text-white bg-[#DA1212] disabled:opacity-40"
              >
                {actionLoading === 'blacklist' ? '…' : 'Blacklist'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
