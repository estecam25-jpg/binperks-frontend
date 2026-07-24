'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const ADMIN_EMAIL = 'enina@estecam.com'

// ── Types ─────────────────────────────────────────────────────────────────

interface Stats {
  starterMembers: number; totalVip: number; totalStamps: number
  couponsIssued: number; couponsRedeemed: number; activeMerchantCount: number
  merchantMrr: number; memberMrr: number; totalMrr: number
  newMembersThisMonth: number; newMerchantsThisMonth: number
  mrrGrowthThisMonth: number; vipConversionRate: number; referralConversionRate: number
}
interface Merchant {
  id: string; name: string; owner_email: string; company_name: string
  billing_status: string; subscription_status: string; location_count: number
  created_at: string; stampsThisWeek: number; totalMembers: number
  vipMembers: number; vipConversionPct: number
  w9: { merchant_id: string; status: string; submitted_at: string | null; reviewed_at: string | null } | null
  onboardingComplete: number
  abandonedCheckout: boolean
}
interface Store {
  id: string; brand_name: string; canonical_key: string; is_active: boolean
  merchantName: string; binCount: number | null; totalMembers: number; vipMembers: number
  vipConversionPct: number; stampsThisWeek: number
  uniqueVisitorsLast30Days: number; engagementRate: number
}
interface Member {
  id: string; first_name: string; last_name: string; phone: string; email: string
  subscription_status: string; total_stamps: number; is_blacklisted: boolean
  created_at: string; storeName: string
}
interface AlertItem { id: string; message: string; detail?: string }
interface Alerts { critical: AlertItem[]; warning: AlertItem[]; good: AlertItem[] }
type TabId = 'overview' | 'merchants' | 'stores' | 'members' | 'alerts'

// ── Module-level helper components ────────────────────────────────────────

function StatCard({ label, value, sub, accent }: {
  label: string; value: string | number; sub?: string; accent?: boolean
}) {
  return (
    <div className={`rounded-2xl px-4 py-4 shadow-sm flex flex-col gap-1 ${accent ? 'bg-[#1A1A2E]' : 'bg-white'}`}>
      <p className={`text-[10px] font-bold tracking-[0.1em] uppercase ${accent ? 'text-white/50' : 'text-[#8E8EA8]'}`}>{label}</p>
      <p className={`font-['Coiny'] text-3xl leading-none ${accent ? 'text-[#FFB217]' : 'text-[#1A1A2E]'}`}>{value}</p>
      {sub && <p className={`text-[11px] font-medium ${accent ? 'text-white/60' : 'text-[#8E8EA8]'}`}>{sub}</p>}
    </div>
  )
}

function TierBadge({ status, stamps }: { status: string; stamps: number }) {
  const t =
    status !== 'vip'    ? { label: '🪸 Starter', bg: 'bg-gray-100 text-gray-600' } :
    stamps >= 2000      ? { label: '💎 Diamond', bg: 'bg-purple-100 text-purple-700' } :
    stamps >= 750       ? { label: '🥇 Gold',    bg: 'bg-yellow-100 text-yellow-700' } :
    stamps >= 200       ? { label: '🥈 Silver',  bg: 'bg-slate-100 text-slate-600' }  :
                          { label: '🥉 Bronze',  bg: 'bg-orange-100 text-orange-700' }
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.bg}`}>{t.label}</span>
}

function Spinner() {
  return <div className="flex justify-center py-12"><span className="w-8 h-8 border-[3px] border-[#EBEBF2] border-t-[#4A4B98] rounded-full animate-spin" /></div>
}

function MerchantCard({
  m, onAction, actionLoading, onW9Action, onW9Reject,
}: {
  m: Merchant
  onAction: (id: string, action: 'activate' | 'deactivate') => Promise<void>
  actionLoading: string | null
  onW9Action: (id: string, action: 'approve_w9') => void
  onW9Reject: (id: string) => void
}) {
  const atRisk   = m.billing_status === 'active' && m.stampsThisWeek === 0 && m.totalMembers > 0
  const pending  = !m.billing_status || m.billing_status === 'pending'
  const failed   = m.billing_status === 'payment_failed'
  const abandoned = m.abandonedCheckout
  const border   = atRisk || failed ? 'border-l-[3px] border-l-[#DA1212]' : pending ? 'border-l-[3px] border-l-[#FFB217]' : ''
  return (
    <div className={`bg-white rounded-2xl px-4 py-4 shadow-sm flex flex-col gap-3 ${border}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-[14px] font-bold text-[#1A1A2E] truncate">{m.company_name || m.name}</p>
            {atRisk    && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">At Risk</span>}
            {abandoned && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">🔴 Abandoned Checkout</span>}
            {pending && !abandoned && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700">Pending</span>}
            {failed    && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Failed Payment</span>}
          </div>
          <p className="text-[11px] text-[#8E8EA8] font-medium truncate">{m.owner_email}</p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
          m.billing_status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
        }`}>{m.billing_status ?? 'pending'}</span>
      </div>
      <div className="grid grid-cols-4 gap-1 text-center">
        {[
          { v: String(m.location_count ?? 1), l: 'stores' },
          { v: String(m.totalMembers),         l: 'members' },
          { v: String(m.stampsThisWeek),       l: 'stamps/wk' },
          { v: m.vipConversionPct + '%',       l: 'VIP rate' },
        ].map(({ v, l }) => (
          <div key={l}>
            <p className="text-[12px] font-bold text-[#1A1A2E]">{v}</p>
            <p className="text-[9px] text-[#8E8EA8] font-medium">{l}</p>
          </div>
        ))}
      </div>
      {/* W-9 status */}
      <div className="border border-[#EBEBF2] rounded-xl px-3 py-2.5 flex flex-col gap-2">
        {!m.w9?.status && (
          <p className="text-[12px] font-semibold text-[#8E8EA8]">⬜ W-9 not submitted</p>
        )}
        {m.w9?.status === 'approved' && (
          <p className="text-[12px] font-semibold text-green-700">✅ W-9 Approved</p>
        )}
        {m.w9?.status === 'rejected' && (
          <p className="text-[12px] font-semibold text-red-700">❌ W-9 Rejected</p>
        )}
        {m.w9?.status === 'pending' && (
          <>
            <p className="text-[12px] font-bold text-[#FFB217]">📋 W-9 Pending Review</p>
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={async () => {
                  const res = await fetch('/api/admin/merchants?action=w9_url&merchantId=' + m.id)
                  if (res.ok) { const d = await res.json(); window.open(d.url, '_blank') }
                }}
                className="flex-1 py-1.5 rounded-lg text-[11px] font-bold bg-[#1A1A2E] text-white min-w-[80px]"
              >
                📄 View W-9
              </button>
              <button
                onClick={() => onW9Action(m.id, 'approve_w9')}
                disabled={!!actionLoading}
                className="flex-1 py-1.5 rounded-lg text-[11px] font-bold bg-green-600 text-white disabled:opacity-40 min-w-[80px]"
              >
                {actionLoading === m.id + 'approve_w9' ? '…' : 'Approve'}
              </button>
              <button
                onClick={() => onW9Reject(m.id)}
                disabled={!!actionLoading}
                className="flex-1 py-1.5 rounded-lg text-[11px] font-bold bg-[#DA1212] text-white disabled:opacity-40 min-w-[80px]"
              >
                Reject
              </button>
            </div>
          </>
        )}
      </div>

      {/* Onboarding progress */}
      {m.onboardingComplete < 100 && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-[#8E8EA8] uppercase tracking-wide">Onboarding</p>
            <p className="text-[10px] font-bold text-[#8E8EA8]">{m.onboardingComplete}%</p>
          </div>
          <div className="w-full h-1.5 bg-[#F5F5F8] rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-[#FFB217]" style={{ width: m.onboardingComplete + '%' }} />
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={() => onAction(m.id, 'activate')}
          disabled={!!actionLoading || m.billing_status === 'active'}
          className="flex-1 py-2 rounded-xl text-[12px] font-bold bg-[#2A7D34] text-white disabled:opacity-40">
          {actionLoading === m.id + 'activate' ? '…' : 'Activate'}
        </button>
        <button onClick={() => onAction(m.id, 'deactivate')}
          disabled={!!actionLoading || m.billing_status === 'deactivated'}
          className="flex-1 py-2 rounded-xl text-[12px] font-bold bg-[#DA1212] text-white disabled:opacity-40">
          {actionLoading === m.id + 'deactivate' ? '…' : 'Deactivate'}
        </button>
      </div>
      <p className="text-[10px] text-[#C0C0D0] font-medium">Joined {new Date(m.created_at).toLocaleDateString()}</p>
    </div>
  )
}

function StoreCard({ s }: { s: Store }) {
  const eng = s.engagementRate
  const engColor = eng >= 50 ? 'text-green-700' : eng >= 20 ? 'text-yellow-700' : 'text-red-700'
  const engBg    = eng >= 50 ? 'bg-green-50'   : eng >= 20 ? 'bg-yellow-50'   : 'bg-red-50'
  const engEmoji = eng >= 50 ? '🟢' : eng >= 20 ? '🟡' : '🔴'
  return (
    <div className={`bg-white rounded-2xl px-4 py-4 shadow-sm flex flex-col gap-3 ${!s.is_active ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-[#1A1A2E]">{s.brand_name}</p>
          <p className="text-[10px] font-mono text-[#8E8EA8]">{s.canonical_key}</p>
          <p className="text-[11px] text-[#8E8EA8] font-medium">{s.merchantName}{s.binCount != null ? ` · ${s.binCount} bins` : ''}</p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {s.is_active ? 'active' : 'inactive'}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1 text-center">
        <div>
          <p className="text-[13px] font-bold text-[#1A1A2E]">{s.totalMembers}</p>
          <p className="text-[9px] text-[#8E8EA8] font-medium">members</p>
        </div>
        <div>
          <p className="text-[13px] font-bold text-[#4A4B98]">{s.vipConversionPct}%</p>
          <p className="text-[9px] text-[#8E8EA8] font-medium">VIP rate</p>
        </div>
        <div>
          <p className="text-[13px] font-bold text-[#1A1A2E]">{s.stampsThisWeek}</p>
          <p className="text-[9px] text-[#8E8EA8] font-medium">stamps/wk</p>
        </div>
        <div className={`rounded-lg py-1 ${engBg}`}>
          <p className={`text-[12px] font-bold ${engColor}`}>{engEmoji} {eng}%</p>
          <p className="text-[9px] text-[#8E8EA8] font-medium">engage</p>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const router = useRouter()
  const [authed,      setAuthed]     = useState(false)
  const [tab,         setTab]        = useState<TabId>('overview')
  const [loadedTabs,  setLoadedTabs] = useState<Set<TabId>>(new Set())
  const [tabLoading,  setTabLoading] = useState<TabId | null>('overview')

  const [stats,     setStats]     = useState<Stats | null>(null)
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [stores,    setStores]    = useState<Store[]>([])
  const [members,   setMembers]   = useState<Member[]>([])
  const [alerts,    setAlerts]    = useState<Alerts | null>(null)

  const [merchantSearch, setMerchantSearch] = useState('')
  const [merchantStatus, setMerchantStatus] = useState<'all' | 'active' | 'deactivated'>('all')
  const [merchantW9Filter, setMerchantW9Filter] = useState<'all' | 'pending' | 'none' | 'approved' | 'rejected'>('all')
  const [memberSearch,   setMemberSearch]   = useState('')
  const [memberSearching, setMemberSearching] = useState(false)

  const [actionLoading,   setActionLoading]   = useState<string | null>(null)
  const [blacklistTarget, setBlacklistTarget] = useState<Member | null>(null)
  const [blacklistReason, setBlacklistReason] = useState('')
  const [w9RejectTarget,  setW9RejectTarget]  = useState<string | null>(null)  // merchantId
  const [w9RejectNotes,   setW9RejectNotes]   = useState('')

  // Auth check
  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (!user || user.email !== ADMIN_EMAIL) { router.replace('/admin/login'); return }
      setAuthed(true)
    })
  }, [router])

  // Lazy load per tab
  const loadOverview  = useCallback(async () => {
    setTabLoading('overview')
    const res = await fetch('/api/admin/stats')
    if (res.ok) setStats(await res.json())
    setTabLoading(null); setLoadedTabs(p => new Set([...p, 'overview']))
  }, [])

  const loadMerchants = useCallback(async () => {
    setTabLoading('merchants')
    const res = await fetch('/api/admin/merchants')
    if (res.ok) { const d = await res.json(); setMerchants(d.merchants ?? []) }
    setTabLoading(null); setLoadedTabs(p => new Set([...p, 'merchants']))
  }, [])

  const loadStores = useCallback(async () => {
    setTabLoading('stores')
    const res = await fetch('/api/admin/stores')
    if (res.ok) { const d = await res.json(); setStores(d.stores ?? []) }
    setTabLoading(null); setLoadedTabs(p => new Set([...p, 'stores']))
  }, [])

  const loadAlerts = useCallback(async () => {
    setTabLoading('alerts')
    const res = await fetch('/api/admin/alerts')
    if (res.ok) setAlerts(await res.json())
    setTabLoading(null); setLoadedTabs(p => new Set([...p, 'alerts']))
  }, [])

  useEffect(() => {
    if (!authed) return
    if (tab === 'overview'  && !loadedTabs.has('overview'))  loadOverview()
    if (tab === 'merchants' && !loadedTabs.has('merchants')) loadMerchants()
    if (tab === 'stores'    && !loadedTabs.has('stores'))    loadStores()
    if (tab === 'alerts'    && !loadedTabs.has('alerts'))    loadAlerts()
  }, [tab, authed, loadedTabs, loadOverview, loadMerchants, loadStores, loadAlerts])

  const filteredMerchants = useMemo(() => merchants.filter(m => {
    const q = merchantSearch.trim().toLowerCase()
    const w9s = m.w9?.status ?? null
    const w9ok =
      merchantW9Filter === 'all'      ? true :
      merchantW9Filter === 'pending'  ? w9s === 'pending' :
      merchantW9Filter === 'none'     ? !w9s :
      merchantW9Filter === 'approved' ? w9s === 'approved' :
      merchantW9Filter === 'rejected' ? w9s === 'rejected' : true
    return (!q || (m.company_name ?? '').toLowerCase().includes(q) || (m.owner_email ?? '').toLowerCase().includes(q))
        && (merchantStatus === 'all' || m.billing_status === merchantStatus)
        && w9ok
  }).sort((a, b) => {
    // Abandoned checkouts float to top
    if (a.abandonedCheckout && !b.abandonedCheckout) return -1
    if (!a.abandonedCheckout && b.abandonedCheckout) return 1
    return 0
  }), [merchants, merchantSearch, merchantStatus, merchantW9Filter])

  async function handleMerchantAction(id: string, action: 'activate' | 'deactivate') {
    setActionLoading(id + action)
    await fetch('/api/admin/merchants', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchantId: id, action }),
    })
    await loadMerchants()
    setActionLoading(null)
  }

  async function handleW9Action(merchantId: string, action: 'approve_w9' | 'reject_w9', notes?: string) {
    setActionLoading(merchantId + action)
    await fetch('/api/admin/merchants', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchantId, action, notes }),
    })
    await loadMerchants()
    setActionLoading(null)
  }

  async function handleMemberSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!memberSearch.trim()) return
    setMemberSearching(true)
    const res = await fetch('/api/admin/members?search=' + encodeURIComponent(memberSearch.trim()))
    if (res.ok) { const d = await res.json(); setMembers(d.members ?? []) }
    setMemberSearching(false)
  }

  async function handleBlacklist() {
    if (!blacklistTarget || !blacklistReason.trim()) return
    setActionLoading('blacklist')
    await fetch('/api/admin/members', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: blacklistTarget.id, reason: blacklistReason.trim() }),
    })
    setMembers(prev => prev.map(m => m.id === blacklistTarget.id ? { ...m, is_blacklisted: true } : m))
    setBlacklistTarget(null); setBlacklistReason(''); setActionLoading(null)
  }

  // ── Tab renders ──────────────────────────────────────────────────────────

  function renderOverview() {
    if (tabLoading === 'overview') return <Spinner />
    const s = stats
    return (
      <div className="flex flex-col gap-4">
        <StatCard label="Total MRR" accent
          value={s ? '$' + (s.totalMrr).toFixed(2) : '—'}
          sub="merchant + member subscriptions combined" />
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Merchant MRR" value={s ? '$' + s.merchantMrr.toFixed(2) : '—'} sub="store subscriptions" />
          <StatCard label="Member MRR"   value={s ? '$' + s.memberMrr.toFixed(2)   : '—'} sub="VIP memberships" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Active" value={s?.activeMerchantCount ?? '—'} sub="merchants" />
          <StatCard label="Starter" value={s?.starterMembers ?? '—'} sub="free tier" />
          <StatCard label="VIP" value={s?.totalVip ?? '—'} sub="paid tier" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="New Members" value={s?.newMembersThisMonth ?? '—'} sub="this month" />
          <StatCard label="New Merchants" value={s?.newMerchantsThisMonth ?? '—'} sub="this month" />
          <StatCard label="VIP Rate" value={s ? s.vipConversionRate.toFixed(1) + '%' : '—'} sub="of all members" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="MRR Growth" value={s ? '+$' + s.mrrGrowthThisMonth.toFixed(2) : '—'} sub="new this month" />
          <StatCard label="Coupons" value={s ? s.couponsIssued + ' / ' + s.couponsRedeemed : '—'} sub="issued / redeemed" />
        </div>
      </div>
    )
  }

  function renderMerchants() {
    if (tabLoading === 'merchants') return <Spinner />
    const statusTabs: { v: 'all'|'active'|'deactivated'; l: string }[] = [
      { v: 'all', l: 'All' }, { v: 'active', l: 'Active' }, { v: 'deactivated', l: 'Deactivated' },
    ]
    const w9Tabs: { v: 'all'|'pending'|'none'|'approved'|'rejected'; l: string }[] = [
      { v: 'all', l: 'All W-9s' }, { v: 'pending', l: '⏳ Pending' },
      { v: 'none', l: '⬜ Not submitted' }, { v: 'approved', l: '✅ Approved' }, { v: 'rejected', l: '❌ Rejected' },
    ]
    const tabCls = (active: boolean) =>
      'px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors ' +
      (active ? 'bg-[#4A4B98] text-white' : 'bg-white text-[#8E8EA8]')
    return (
      <div className="flex flex-col gap-3">
        {/* Search */}
        <input value={merchantSearch} onChange={e => setMerchantSearch(e.target.value)}
          placeholder="Search name or email"
          className="px-4 py-3 rounded-xl bg-white border-2 border-transparent focus:border-[#4A4B98] outline-none text-[14px] font-semibold text-[#1A1A2E] placeholder:text-[#C0C0D0]" />
        {/* Status filter */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {statusTabs.map(t => (
            <button key={t.v} onClick={() => setMerchantStatus(t.v)} className={tabCls(merchantStatus === t.v)}>{t.l}</button>
          ))}
        </div>
        {/* W-9 filter */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {w9Tabs.map(t => (
            <button key={t.v} onClick={() => setMerchantW9Filter(t.v)} className={tabCls(merchantW9Filter === t.v)}>{t.l}</button>
          ))}
        </div>
        {filteredMerchants.length === 0 && (
          <p className="text-[13px] text-[#8E8EA8] font-medium px-1">
            {merchants.length === 0 ? 'No merchants yet.' : 'No merchants match your filters.'}
          </p>
        )}
        {filteredMerchants.map(m => (
          <MerchantCard key={m.id} m={m} onAction={handleMerchantAction} actionLoading={actionLoading}
            onW9Action={handleW9Action}
            onW9Reject={(id) => { setW9RejectTarget(id); setW9RejectNotes('') }} />
        ))}
      </div>
    )
  }

  function renderStores() {
    if (tabLoading === 'stores') return <Spinner />
    return (
      <div className="flex flex-col gap-3">
        {stores.length === 0 && <p className="text-[13px] text-[#8E8EA8] font-medium">No stores found.</p>}
        {stores.map(s => <StoreCard key={s.id} s={s} />)}
      </div>
    )
  }

  function renderMembers() {
    return (
      <div className="flex flex-col gap-3">
        <form onSubmit={handleMemberSearch} className="flex gap-2">
          <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)}
            placeholder="Phone or email"
            className="flex-1 px-4 py-3 rounded-xl bg-white border-2 border-transparent focus:border-[#4A4B98] outline-none text-[14px] font-semibold text-[#1A1A2E] placeholder:text-[#C0C0D0]" />
          <button type="submit" disabled={memberSearching || !memberSearch.trim()}
            className="px-5 py-3 rounded-xl font-bold text-[14px] text-white bg-[#1A1A2E] disabled:opacity-40">
            {memberSearching ? '…' : 'Search'}
          </button>
        </form>
        {members.length === 0 && (
          <p className="text-[13px] text-[#8E8EA8] font-medium text-center py-8">Search by phone or email to find a member.</p>
        )}
        {members.map(m => (
          <div key={m.id} className={`bg-white rounded-2xl px-4 py-4 shadow-sm flex flex-col gap-2 ${m.is_blacklisted ? 'opacity-60 border-2 border-[#DA1212]' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold text-[#1A1A2E]">{m.first_name} {m.last_name}</p>
                <p className="text-[11px] text-[#8E8EA8] font-medium">{m.phone} · {m.email}</p>
                <p className="text-[11px] text-[#8E8EA8] font-medium mt-0.5">{m.total_stamps} stamps · {m.storeName}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <TierBadge status={m.subscription_status} stamps={m.total_stamps} />
                {m.is_blacklisted && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">blacklisted</span>}
              </div>
            </div>
            {!m.is_blacklisted && (
              <button onClick={() => setBlacklistTarget(m)}
                className="w-full py-2 rounded-xl text-[12px] font-bold text-[#DA1212] border-2 border-[#DA1212]">
                Blacklist member
              </button>
            )}
            <p className="text-[10px] text-[#C0C0D0] font-medium">Joined {new Date(m.created_at).toLocaleDateString()}</p>
          </div>
        ))}
      </div>
    )
  }

  function renderAlerts() {
    if (tabLoading === 'alerts') return <Spinner />
    if (!alerts) return <p className="text-[13px] text-[#8E8EA8]">No data.</p>
    const sections = [
      { key: 'critical', title: '🔴 Critical',  items: alerts.critical, hBg: 'bg-red-50',    hText: 'text-red-700',    border: 'border-red-100' },
      { key: 'warning',  title: '🟡 Warning',   items: alerts.warning,  hBg: 'bg-yellow-50', hText: 'text-yellow-700', border: 'border-yellow-100' },
      { key: 'good',     title: '🟢 Good News', items: alerts.good,     hBg: 'bg-green-50',  hText: 'text-green-700',  border: 'border-green-100' },
    ]
    return (
      <div className="flex flex-col gap-4">
        {sections.map(sec => (
          <div key={sec.key} className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className={`px-4 py-3 border-b ${sec.hBg} ${sec.border}`}>
              <h3 className={`font-bold text-[13px] ${sec.hText}`}>{sec.title} ({sec.items.length})</h3>
            </div>
            {sec.items.length === 0 ? (
              <p className="text-[12px] text-[#8E8EA8] font-medium px-4 py-3">None right now.</p>
            ) : (
              <div className="flex flex-col divide-y divide-[#EBEBF2]">
                {sec.items.map(a => (
                  <div key={a.id} className="px-4 py-3">
                    <p className="text-[13px] font-semibold text-[#1A1A2E]">{a.message}</p>
                    {a.detail && <p className="text-[11px] text-[#8E8EA8] font-medium mt-0.5">{a.detail}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  // ── Render guard + layout ────────────────────────────────────────────────

  if (!authed) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#1A1A2E]">
        <span className="w-8 h-8 border-[3px] border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  const TABS: { id: TabId; label: string }[] = [
    { id: 'overview',  label: 'Overview' },
    { id: 'merchants', label: 'Merchants' },
    { id: 'stores',    label: 'Stores' },
    { id: 'members',   label: 'Members' },
    { id: 'alerts',    label: 'Alerts' },
  ]

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">
      {/* Header */}
      <div className="bg-[#1A1A2E] px-5 py-4 flex items-center justify-between">
        <div>
          <span className="font-['Coiny'] text-2xl text-white tracking-wide">BinPerks</span>
          <span className="ml-2 text-[11px] font-bold tracking-widest uppercase text-[#FFB217]">Admin</span>
        </div>
        <button onClick={() => createClient().auth.signOut().then(() => router.replace('/admin/login'))}
          className="text-[12px] font-semibold text-white/50 hover:text-white/80 transition-colors">
          Sign out
        </button>
      </div>

      {/* Tab nav */}
      <div className="bg-white border-b border-[#EBEBF2] px-2">
        <div className="flex overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={'px-4 py-3 text-[13px] font-bold whitespace-nowrap border-b-2 transition-colors ' + (
                tab === t.id
                  ? 'border-[#4A4B98] text-[#4A4B98]'
                  : 'border-transparent text-[#8E8EA8] hover:text-[#1A1A2E]'
              )}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full pb-16">
        {tab === 'overview'  && renderOverview()}
        {tab === 'merchants' && renderMerchants()}
        {tab === 'stores'    && renderStores()}
        {tab === 'members'   && renderMembers()}
        {tab === 'alerts'    && renderAlerts()}
      </main>

      {/* W-9 Reject modal */}
      {w9RejectTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center px-4 z-50">
          <div className="bg-white rounded-3xl px-6 py-6 w-full max-w-sm flex flex-col gap-4 shadow-2xl">
            <h3 className="font-['Coiny'] text-xl text-[#1A1A2E]">Reject W-9?</h3>
            <p className="text-[13px] text-[#8E8EA8] font-medium leading-relaxed">
              The merchant will be asked to re-upload their W-9. Add a reason below (optional but recommended).
            </p>
            <textarea
              value={w9RejectNotes}
              onChange={e => setW9RejectNotes(e.target.value)}
              placeholder="e.g. Signature missing, wrong form version…"
              rows={3}
              className="w-full rounded-xl border-2 border-[#EBEBF2] px-4 py-3 text-[14px] font-medium text-[#1A1A2E] placeholder-[#C5C5D5] resize-none outline-none focus:border-[#DA1212]"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setW9RejectTarget(null); setW9RejectNotes('') }}
                className="flex-1 py-3 rounded-xl text-[14px] font-bold text-[#8E8EA8] border-2 border-[#EBEBF2]"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await handleW9Action(w9RejectTarget, 'reject_w9', w9RejectNotes || undefined)
                  setW9RejectTarget(null); setW9RejectNotes('')
                }}
                disabled={actionLoading === w9RejectTarget + 'reject_w9'}
                className="flex-1 py-3 rounded-xl text-[14px] font-bold text-white bg-[#DA1212] disabled:opacity-40"
              >
                {actionLoading === w9RejectTarget + 'reject_w9' ? '…' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Blacklist modal */}
      {blacklistTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center px-4 z-50">
          <div className="bg-white rounded-3xl px-6 py-6 w-full max-w-sm flex flex-col gap-4 shadow-2xl">
            <h3 className="font-['Coiny'] text-xl text-[#1A1A2E]">
              Blacklist {blacklistTarget.first_name} {blacklistTarget.last_name}?
            </h3>
            <p className="text-[13px] text-[#8E8EA8] font-medium leading-relaxed">
              This blocks the member from BinPerks. A reason is required.
            </p>
            <textarea value={blacklistReason} onChange={e => setBlacklistReason(e.target.value)}
              placeholder="Reason for blacklisting…" rows={3}
              className="w-full rounded-xl border-2 border-[#EBEBF2] px-4 py-3 text-[14px] font-medium text-[#1A1A2E] placeholder-[#C5C5D5] resize-none outline-none focus:border-[#DA1212]"
            />
            <div className="flex gap-2">
              <button onClick={() => { setBlacklistTarget(null); setBlacklistReason('') }}
                className="flex-1 py-3 rounded-xl text-[14px] font-bold text-[#8E8EA8] border-2 border-[#EBEBF2]">
                Cancel
              </button>
              <button onClick={handleBlacklist} disabled={!blacklistReason.trim() || actionLoading === 'blacklist'}
                className="flex-1 py-3 rounded-xl text-[14px] font-bold text-white bg-[#DA1212] disabled:opacity-40">
                {actionLoading === 'blacklist' ? '…' : 'Blacklist'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}