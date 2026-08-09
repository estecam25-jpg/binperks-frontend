'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { isAdminEmail } from '@/lib/admin-emails'

// ── Types ─────────────────────────────────────────────────────────────────

interface Stats {
  starterMembers: number; totalVip: number; totalStamps: number
  couponsIssued: number; couponsRedeemed: number; activeMerchantCount: number
  merchantMrr: number; memberMrr: number; totalMrr: number
  newMembersThisMonth: number; newMerchantsThisMonth: number
  mrrGrowthThisMonth: number; vipConversionRate: number; referralConversionRate: number
  // V3 network stats
  originatedMembers: number; commissionEligibleMerchants: number
  binperksRetainedThisMonth: number; settlementPeriod: string
}
interface Merchant {
  id: string; name: string; owner_email: string; company_name: string
  billing_status: string; subscription_status: string; location_count: number
  created_at: string; stampsThisWeek: number; totalMembers: number
  vipMembers: number; vipConversionPct: number
  w9: { merchant_id: string; status: string; submitted_at: string | null; reviewed_at: string | null } | null
  onboardingComplete: number
  abandonedCheckout: boolean
  // V3 fields
  commissionEligible: boolean
  participantType: string | null
  participantTypeLabel: string | null
  negativeBalance: number
  adminSuspended: boolean
  adminSuspensionReason: string | null
}
interface EligibilityEvent {
  id: string; eventType: string; effectiveAt: string
  triggeredBy: string | null; reason: string | null; commissionEligible: boolean | null
}
interface Store {
  id: string; brand_name: string; canonical_key: string; is_active: boolean
  merchantName: string; binCount: number | null; totalMembers: number; vipMembers: number
  vipConversionPct: number; stampsThisWeek: number
  uniqueVisitorsLast30Days: number; engagementRate: number
  // V3 independent store statuses (first three admin-toggleable)
  isOpenForShopping: boolean
  networkVisible: boolean
  enrollmentEnabled: boolean
  commissionEligible: boolean   // merchant-level, read-only here
}
// The three store status columns an admin may flip from this screen.
type StoreToggleField = 'is_open_for_shopping' | 'network_visible' | 'enrollment_enabled'
interface Member {
  id: string; first_name: string; last_name: string; phone: string; email: string
  subscription_status: string; total_stamps: number; is_blacklisted: boolean
  created_at: string; storeName: string
}
interface AlertItem { id: string; message: string; detail?: string }
interface Alerts { critical: AlertItem[]; warning: AlertItem[]; good: AlertItem[] }
interface SettlementBatch {
  id: string; settlementPeriod: string; status: string
  membershipRevenue: number; commissionCredits: number; binperksRetained: number
  couponDebits: number; couponCredits: number; binperksCouponFund: number
  refundAdjustments: number; negativeBalances: number; merchantDistributions: number
  merchantCount: number
  approvedBy: string | null; approvedAt: string | null
  transfersInitiatedAt: string | null; lockedAt: string | null; createdAt: string
}
interface SettlementStatement {
  id: string; merchantId: string; merchantName: string
  originCommissionCredits: number; couponDebits: number; couponCredits: number
  refundAdjustments: number; chargebackAdjustments: number
  priorNegativeBalance: number; grossDistribution: number
  netDistribution: number; closingNegativeBalance: number
  statementStatus: string | null; transferStatus: string | null
}
interface ScannerChoiceStat { count: number; pct: number }
interface ScannerProduct {
  product: string; category: string | null; scans: number
  cartPct: number; binsPct: number
}
interface ScannerImageService {
  catalogSize: number
  catalogHit: ScannerChoiceStat
  imageSearchRequests: ScannerChoiceStat
  lowConfidenceSkips: ScannerChoiceStat
  specificitySkips: ScannerChoiceStat
  searchFailed: number
  braveCallsThisMonth: number
}
interface ScannerStats {
  totalScans: number; scansThisMonth: number
  choices: {
    shoppingCart: ScannerChoiceStat
    backToBins:   ScannerChoiceStat
    noChoice:     ScannerChoiceStat
  }
  topProducts: ScannerProduct[]
  /** Absent on a response from before the Product Image Service shipped. */
  imageService?: ScannerImageService
}
type TabId = 'overview' | 'merchants' | 'stores' | 'members' | 'settlement' | 'scanner' | 'alerts'

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

/** Small static pill used for V3 status chips. */
function Pill({ label, tone }: { label: string; tone: 'green' | 'red' | 'gray' | 'amber' | 'blue' }) {
  const tones = {
    green: 'bg-green-100 text-green-700',
    red:   'bg-red-100 text-red-700',
    gray:  'bg-gray-100 text-gray-500',
    amber: 'bg-yellow-100 text-yellow-700',
    blue:  'bg-indigo-100 text-indigo-700',
  }
  return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${tones[tone]}`}>{label}</span>
}

/** Clickable status pill for the three admin-toggleable store fields. */
function TogglePill({ label, on, busy, onClick }: {
  label: string; on: boolean; busy: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`text-[10px] font-bold px-2.5 py-1 rounded-full transition-colors disabled:opacity-40 ${
        on ? 'bg-green-100 text-green-700 active:bg-green-200'
           : 'bg-gray-200 text-gray-500 active:bg-gray-300'
      }`}
    >
      {busy ? '…' : `${on ? '✓' : '✕'} ${label}`}
    </button>
  )
}

function formatEventType(t: string) {
  return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function money(n: number) {
  return '$' + n.toFixed(2)
}

/** "2026-07" → "July 2026"; unexpected formats pass through unchanged. */
function formatPeriod(period: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(period)
  if (!m) return period
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1)
  return Number.isNaN(d.getTime())
    ? period
    : d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

const BATCH_STATUS_TONE: Record<string, 'green' | 'red' | 'gray' | 'amber' | 'blue'> = {
  draft:            'gray',
  calculated:       'amber',
  pending_approval: 'amber',
  approved:         'blue',
  processing:       'blue',
  completed:        'green',
  locked:           'green',
}

function MerchantCard({
  m, onAction, actionLoading, onW9Action, onW9Reject,
  expanded, onToggleExpand, history, historyLoading,
}: {
  m: Merchant
  onAction: (id: string, action: 'activate' | 'deactivate') => Promise<void>
  actionLoading: string | null
  onW9Action: (id: string, action: 'approve_w9') => void
  onW9Reject: (id: string) => void
  expanded: boolean
  onToggleExpand: () => void
  history: EligibilityEvent[] | undefined
  historyLoading: boolean
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

      {/* V3 status row — commission eligibility, participant type, balance, suspension */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Pill
          label={m.commissionEligible ? '💰 Commission eligible' : '⛔ Commissions paused'}
          tone={m.commissionEligible ? 'green' : 'red'}
        />
        {m.participantTypeLabel && <Pill label={m.participantTypeLabel} tone="blue" />}
        {/* Negative balance is hidden entirely at zero — only a real debt shows. */}
        {m.negativeBalance > 0 && (
          <Pill label={`Owes $${m.negativeBalance.toFixed(2)}`} tone="red" />
        )}
        {m.adminSuspended && <Pill label="⚠️ Admin suspended" tone="amber" />}
      </div>
      {m.adminSuspended && m.adminSuspensionReason && (
        <p className="text-[11px] font-medium text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-lg px-2.5 py-1.5">
          Suspension reason: {m.adminSuspensionReason}
        </p>
      )}

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

      {/* Commission eligibility audit trail — lazy-loaded on first expand */}
      <button
        onClick={onToggleExpand}
        className="w-full text-left text-[11px] font-bold text-[#4A4B98] flex items-center gap-1.5 pt-0.5"
      >
        <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>▸</span>
        Eligibility history
      </button>

      {expanded && (
        <div className="border border-[#EBEBF2] rounded-xl overflow-hidden">
          {historyLoading ? (
            <p className="text-[11px] text-[#8E8EA8] font-medium px-3 py-3">Loading…</p>
          ) : !history || history.length === 0 ? (
            <p className="text-[11px] text-[#8E8EA8] font-medium px-3 py-3">
              No eligibility changes recorded for this merchant yet.
            </p>
          ) : (
            <div className="divide-y divide-[#EBEBF2]">
              {history.map(h => (
                <div key={h.id} className="px-3 py-2.5 flex flex-col gap-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[12px] font-bold text-[#1A1A2E]">{formatEventType(h.eventType)}</p>
                    {h.commissionEligible !== null && (
                      <Pill
                        label={h.commissionEligible ? 'eligible' : 'ineligible'}
                        tone={h.commissionEligible ? 'green' : 'red'}
                      />
                    )}
                  </div>
                  <p className="text-[10px] text-[#8E8EA8] font-medium">
                    {new Date(h.effectiveAt).toLocaleString()}
                    {h.triggeredBy ? ` · ${h.triggeredBy}` : ''}
                  </p>
                  {h.reason && (
                    <p className="text-[11px] text-[#1A1A2E] font-medium mt-0.5">{h.reason}</p>
                  )}
                </div>
              ))}
              {history.length === 10 && (
                <p className="text-[10px] text-[#C0C0D0] font-medium px-3 py-2">
                  Showing 10 most recent events.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-[#C0C0D0] font-medium">Joined {new Date(m.created_at).toLocaleDateString()}</p>
    </div>
  )
}

function StoreCard({ s, onToggle, togglingField }: {
  s: Store
  onToggle: (store: Store, field: StoreToggleField, next: boolean) => void
  togglingField: StoreToggleField | null
}) {
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

      {/* V3 status model — four independent fields, never derived from is_active */}
      <div className="border-t border-[#EBEBF2] pt-3 flex flex-col gap-2">
        <p className="text-[9px] font-bold tracking-[0.08em] uppercase text-[#8E8EA8]">
          Network status
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <TogglePill
            label="Open for shopping"
            on={s.isOpenForShopping}
            busy={togglingField === 'is_open_for_shopping'}
            onClick={() => onToggle(s, 'is_open_for_shopping', !s.isOpenForShopping)}
          />
          <TogglePill
            label="Network visible"
            on={s.networkVisible}
            busy={togglingField === 'network_visible'}
            onClick={() => onToggle(s, 'network_visible', !s.networkVisible)}
          />
          <TogglePill
            label="Enrollment"
            on={s.enrollmentEnabled}
            busy={togglingField === 'enrollment_enabled'}
            onClick={() => onToggle(s, 'enrollment_enabled', !s.enrollmentEnabled)}
          />
          {/* Merchant-level and read-only here — a store cannot change it. */}
          <span
            className={`text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${
              s.commissionEligible ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}
            title="Commission eligibility is set on the merchant account, not per store"
          >
            🔒 {s.commissionEligible ? 'Commission eligible' : 'Commissions paused'}
          </span>
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

  // V3: merchant eligibility history (lazy per merchant) + store status toggles
  const [expandedMerchant, setExpandedMerchant] = useState<string | null>(null)
  const [historyByMerchant, setHistoryByMerchant] = useState<Record<string, EligibilityEvent[]>>({})
  const [historyLoading, setHistoryLoading] = useState<string | null>(null)
  const [storeToggling, setStoreToggling] = useState<string | null>(null)  // `${storeId}:${field}`
  const [enrollmentConfirm, setEnrollmentConfirm] = useState<Store | null>(null)

  // Phase 3: settlement batches
  const [batches, setBatches] = useState<SettlementBatch[]>([])
  const [previousPeriod, setPreviousPeriod] = useState('')
  const [previousPeriodCalculated, setPreviousPeriodCalculated] = useState(true)
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null)
  const [statementsByBatch, setStatementsByBatch] = useState<Record<string, SettlementStatement[]>>({})
  const [statementsLoading, setStatementsLoading] = useState<string | null>(null)
  const [settlementBusy, setSettlementBusy] = useState<string | null>(null)
  const [settlementError, setSettlementError] = useState('')
  const [approveConfirm, setApproveConfirm] = useState<SettlementBatch | null>(null)

  // Phase 4: scanner analytics
  const [scanner, setScanner] = useState<ScannerStats | null>(null)

  // Auth check
  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      // UX guard only — every /api/admin/* route re-checks server-side. Shares
      // lib/admin-emails with verifyAdmin so the two can't drift; previously
      // this held its own hardcoded address.
      if (!isAdminEmail(user?.email)) { router.replace('/admin/login'); return }
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

  const loadSettlement = useCallback(async (markLoaded = true) => {
    if (markLoaded) setTabLoading('settlement')
    const res = await fetch('/api/admin/settlement')
    if (res.ok) {
      const d = await res.json()
      setBatches(d.batches ?? [])
      setPreviousPeriod(d.previousPeriod ?? '')
      setPreviousPeriodCalculated(!!d.previousPeriodCalculated)
    }
    if (markLoaded) { setTabLoading(null); setLoadedTabs(p => new Set([...p, 'settlement'])) }
  }, [])

  const loadScanner = useCallback(async () => {
    setTabLoading('scanner')
    const res = await fetch('/api/admin/scanner')
    if (res.ok) setScanner(await res.json())
    setTabLoading(null); setLoadedTabs(p => new Set([...p, 'scanner']))
  }, [])

  useEffect(() => {
    if (!authed) return
    if (tab === 'overview'  && !loadedTabs.has('overview'))  loadOverview()
    if (tab === 'merchants' && !loadedTabs.has('merchants')) loadMerchants()
    if (tab === 'stores'    && !loadedTabs.has('stores'))    loadStores()
    if (tab === 'alerts'    && !loadedTabs.has('alerts'))    loadAlerts()
    if (tab === 'settlement' && !loadedTabs.has('settlement')) loadSettlement()
    if (tab === 'scanner'   && !loadedTabs.has('scanner'))   loadScanner()
  }, [tab, authed, loadedTabs, loadOverview, loadMerchants, loadStores, loadAlerts, loadSettlement, loadScanner])

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

  // Fetch a merchant's eligibility history once, on first expand.
  async function handleToggleExpand(merchantId: string) {
    if (expandedMerchant === merchantId) { setExpandedMerchant(null); return }
    setExpandedMerchant(merchantId)
    if (historyByMerchant[merchantId]) return
    setHistoryLoading(merchantId)
    const res = await fetch('/api/admin/merchants?action=eligibility_history&merchantId=' + merchantId)
    if (res.ok) {
      const d = await res.json()
      setHistoryByMerchant(prev => ({ ...prev, [merchantId]: d.history ?? [] }))
    }
    setHistoryLoading(null)
  }

  async function applyStoreToggle(store: Store, field: StoreToggleField, next: boolean) {
    setStoreToggling(`${store.id}:${field}`)
    const res = await fetch('/api/admin/stores', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: store.id, field, value: next }),
    })
    if (res.ok) {
      const key =
        field === 'is_open_for_shopping' ? 'isOpenForShopping' :
        field === 'network_visible'      ? 'networkVisible'    : 'enrollmentEnabled'
      setStores(prev => prev.map(s => s.id === store.id ? { ...s, [key]: next } : s))
    }
    setStoreToggling(null)
  }

  // Disabling enrollment cuts off every QR code and link for the location, so it
  // routes through a confirmation. Re-enabling is not destructive and applies
  // straight away. Note enrollment_enabled must stay on after merchant
  // cancellation — turn it off only for a documented reason (CLAUDE.md rule 21).
  function handleStoreToggle(store: Store, field: StoreToggleField, next: boolean) {
    if (field === 'enrollment_enabled' && next === false) {
      setEnrollmentConfirm(store)
      return
    }
    applyStoreToggle(store, field, next)
  }

  // ── Settlement ───────────────────────────────────────────────────────────

  async function handleCalculateSettlement() {
    setSettlementBusy('calculate'); setSettlementError('')
    const res = await fetch('/api/admin/settlement/calculate', { method: 'POST' })
    const d = await res.json().catch(() => null)
    if (!res.ok) {
      setSettlementError(
        d?.error === 'batch_exists'
          ? `A batch already exists for ${d.period}.`
          : d?.message ?? 'Calculation failed. Check the server logs.',
      )
    } else {
      await loadSettlement(false)
    }
    setSettlementBusy(null)
  }

  // Approval is the money gate — it never initiates a transfer, but it is the
  // point of no return for the batch, so it routes through a confirmation.
  async function handleApproveBatch(batch: SettlementBatch) {
    setSettlementBusy(batch.id); setSettlementError('')
    const res = await fetch('/api/admin/settlement/approve', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId: batch.id }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => null)
      setSettlementError(d?.error === 'invalid_status'
        ? `Batch is ${d.status} — only calculated batches can be approved.`
        : 'Approval failed. Check the server logs.')
      setSettlementBusy(null)
      return
    }

    // Carry closing negative balances into merchant accounts straight after
    // approval, so the next period starts from the correct opening balance.
    const nbRes = await fetch('/api/admin/settlement/negative-balance', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId: batch.id }),
    })
    if (!nbRes.ok) {
      setSettlementError('Batch approved, but negative balances were not applied. Check the server logs.')
    }

    await loadSettlement(false)
    if (expandedBatch === batch.id) await loadStatements(batch.id, true)
    setSettlementBusy(null)
  }

  async function loadStatements(batchId: string, force = false) {
    if (statementsByBatch[batchId] && !force) return
    setStatementsLoading(batchId)
    const res = await fetch(`/api/admin/settlement/${batchId}`)
    if (res.ok) {
      const d = await res.json()
      setStatementsByBatch(prev => ({ ...prev, [batchId]: d.statements ?? [] }))
    }
    setStatementsLoading(null)
  }

  async function handleToggleBatch(batchId: string) {
    if (expandedBatch === batchId) { setExpandedBatch(null); return }
    setExpandedBatch(batchId)
    await loadStatements(batchId)
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

        {/* ── V3 network ── */}
        <div className="pt-2">
          <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#8E8EA8] px-1 mb-2">
            Network
          </p>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Originated Members"
              value={s?.originatedMembers ?? '—'}
              sub="with an Origin Store" />
            <StatCard
              label="Eligible Merchants"
              value={s?.commissionEligibleMerchants ?? '—'}
              sub="earning commissions" />
          </div>
          <div className="mt-3">
            <StatCard
              label="BinPerks Retained"
              value={s ? '$' + s.binperksRetainedThisMonth.toFixed(2) : '—'}
              sub={s ? `commissions kept in ${s.settlementPeriod} (ineligible origins)` : 'this settlement period'} />
          </div>
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
            onW9Reject={(id) => { setW9RejectTarget(id); setW9RejectNotes('') }}
            expanded={expandedMerchant === m.id}
            onToggleExpand={() => handleToggleExpand(m.id)}
            history={historyByMerchant[m.id]}
            historyLoading={historyLoading === m.id} />
        ))}
      </div>
    )
  }

  function renderStores() {
    if (tabLoading === 'stores') return <Spinner />
    return (
      <div className="flex flex-col gap-3">
        {stores.length === 0 && <p className="text-[13px] text-[#8E8EA8] font-medium">No stores found.</p>}
        {stores.map(s => (
          <StoreCard
            key={s.id}
            s={s}
            onToggle={handleStoreToggle}
            togglingField={
              storeToggling?.startsWith(s.id + ':')
                ? (storeToggling.split(':')[1] as StoreToggleField)
                : null
            }
          />
        ))}
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

  function renderSettlement() {
    if (tabLoading === 'settlement') return <Spinner />
    return (
      <div className="flex flex-col gap-3">

        <div className="px-1">
          <p className="text-[12px] text-[#8E8EA8] font-medium leading-relaxed">
            Monthly batches are calculated and approved by hand. Approving records the
            decision and carries negative balances forward — it does <strong>not</strong> move
            money. Stripe Connect transfers are a separate step, still pending attorney
            confirmation.
          </p>
        </div>

        {settlementError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
            <p className="text-[12px] font-semibold text-red-700">{settlementError}</p>
          </div>
        )}

        {/* Calculate — only offered while last month has no batch */}
        {!previousPeriodCalculated && previousPeriod && (
          <button
            onClick={handleCalculateSettlement}
            disabled={settlementBusy === 'calculate'}
            className="w-full py-3.5 rounded-xl text-[14px] font-bold text-white bg-[#4A4B98] disabled:opacity-40"
          >
            {settlementBusy === 'calculate'
              ? 'Calculating…'
              : `Calculate Settlement — ${formatPeriod(previousPeriod)}`}
          </button>
        )}
        {previousPeriodCalculated && previousPeriod && (
          <p className="text-[11px] text-[#8E8EA8] font-medium px-1">
            {formatPeriod(previousPeriod)} has already been calculated.
          </p>
        )}

        {batches.length === 0 && (
          <div className="bg-white rounded-2xl py-14 px-6 text-center flex flex-col items-center gap-3">
            <span className="text-3xl">🧾</span>
            <p className="text-[13px] font-semibold text-[#8E8EA8] max-w-xs leading-relaxed">
              No settlement batches yet. Calculate the first one once a month of VIP
              payments has closed.
            </p>
          </div>
        )}

        {batches.map(b => {
          const expanded = expandedBatch === b.id
          const stmts    = statementsByBatch[b.id]
          return (
            <div key={b.id} className="bg-white rounded-2xl px-4 py-4 shadow-sm flex flex-col gap-3">

              <button onClick={() => handleToggleBatch(b.id)} className="flex items-start justify-between gap-2 text-left">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-[14px] font-bold text-[#1A1A2E]">{formatPeriod(b.settlementPeriod)}</p>
                    <Pill label={b.status.replace(/_/g, ' ')} tone={BATCH_STATUS_TONE[b.status] ?? 'gray'} />
                  </div>
                  <p className="text-[11px] text-[#8E8EA8] font-medium mt-0.5">
                    {b.merchantCount} merchant{b.merchantCount === 1 ? '' : 's'}
                    {b.approvedBy ? ` · approved by ${b.approvedBy}` : ''}
                  </p>
                </div>
                <span className={`text-[#8E8EA8] transition-transform ${expanded ? 'rotate-90' : ''}`}>▸</span>
              </button>

              <div className="grid grid-cols-3 gap-1 text-center">
                <div>
                  <p className="text-[13px] font-bold text-[#2A7D34]">{money(b.merchantDistributions)}</p>
                  <p className="text-[9px] text-[#8E8EA8] font-medium">to merchants</p>
                </div>
                <div>
                  <p className="text-[13px] font-bold text-[#4A4B98]">{money(b.binperksRetained)}</p>
                  <p className="text-[9px] text-[#8E8EA8] font-medium">BinPerks kept</p>
                </div>
                <div>
                  <p className="text-[13px] font-bold text-[#1A1A2E]">{money(b.membershipRevenue)}</p>
                  <p className="text-[9px] text-[#8E8EA8] font-medium">member revenue</p>
                </div>
              </div>

              {b.negativeBalances > 0 && (
                <p className="text-[11px] font-semibold text-[#DA1212] bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5">
                  {money(b.negativeBalances)} carried forward as negative balance
                </p>
              )}

              {/* Approve — only for a batch still awaiting sign-off */}
              {(b.status === 'calculated' || b.status === 'pending_approval') && (
                <button
                  onClick={() => setApproveConfirm(b)}
                  disabled={settlementBusy === b.id}
                  className="w-full py-2.5 rounded-xl text-[13px] font-bold text-white bg-[#2A7D34] disabled:opacity-40"
                >
                  {settlementBusy === b.id ? '…' : 'Approve batch'}
                </button>
              )}

              {expanded && (
                <div className="border border-[#EBEBF2] rounded-xl overflow-hidden">
                  {statementsLoading === b.id ? (
                    <p className="text-[11px] text-[#8E8EA8] font-medium px-3 py-3">Loading…</p>
                  ) : !stmts || stmts.length === 0 ? (
                    <p className="text-[11px] text-[#8E8EA8] font-medium px-3 py-3">
                      No merchant statements in this batch.
                    </p>
                  ) : (
                    <div className="divide-y divide-[#EBEBF2]">
                      {stmts.map(s => (
                        <div key={s.id} className="px-3 py-3 flex flex-col gap-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[12px] font-bold text-[#1A1A2E] truncate">{s.merchantName}</p>
                            <span className="font-['Coiny'] text-lg text-[#2A7D34] flex-shrink-0">
                              {money(s.netDistribution)}
                            </span>
                          </div>
                          <p className="text-[10px] text-[#8E8EA8] font-medium leading-relaxed">
                            commissions {money(s.originCommissionCredits)}
                            {' · '}coupons funded −{money(s.couponDebits)}
                            {' · '}coupons honoured +{money(s.couponCredits)}
                            {(s.refundAdjustments > 0 || s.chargebackAdjustments > 0) &&
                              ` · adjustments −${money(s.refundAdjustments + s.chargebackAdjustments)}`}
                          </p>
                          {(s.priorNegativeBalance > 0 || s.closingNegativeBalance > 0) && (
                            <p className="text-[10px] font-semibold text-[#DA1212]">
                              {s.priorNegativeBalance > 0 && `prior balance −${money(s.priorNegativeBalance)}`}
                              {s.priorNegativeBalance > 0 && s.closingNegativeBalance > 0 && ' · '}
                              {s.closingNegativeBalance > 0 && `carries forward ${money(s.closingNegativeBalance)}`}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  function renderScanner() {
    if (tabLoading === 'scanner') return <Spinner />
    const sc = scanner
    if (!sc) return <p className="text-[13px] text-[#8E8EA8]">No data.</p>

    const { shoppingCart, backToBins, noChoice } = sc.choices

    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Total Scans" value={sc.totalScans} sub="all time" />
          <StatCard label="This Month"  value={sc.scansThisMonth} sub="scans" />
        </div>

        <div>
          <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#8E8EA8] px-1 mb-2">
            What members did next
          </p>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="🛒 Cart"  value={shoppingCart.count} sub={`${shoppingCart.pct}% of scans`} />
            <StatCard label="🗑️ Bins"  value={backToBins.count}   sub={`${backToBins.pct}% of scans`} />
            <StatCard label="No Choice" value={noChoice.count}    sub={`${noChoice.pct}% of scans`} />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-[#EBEBF2] flex items-baseline justify-between gap-2">
            <h3 className="font-bold text-[13px] text-[#1A1A2E]">Top Identified Products</h3>
            <span className="text-[10px] font-medium text-[#8E8EA8]">top {sc.topProducts.length}</span>
          </div>

          {sc.topProducts.length === 0 ? (
            <p className="text-[12px] text-[#8E8EA8] font-medium px-4 py-3">
              No products identified yet.
            </p>
          ) : (
            // Scrolls horizontally on a phone rather than crushing the columns.
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse">
                <thead>
                  <tr className="bg-[#F5F5F8]">
                    <th className="text-left  text-[10px] font-bold tracking-wider uppercase text-[#8E8EA8] px-3 py-2">Product</th>
                    <th className="text-left  text-[10px] font-bold tracking-wider uppercase text-[#8E8EA8] px-3 py-2">Category</th>
                    <th className="text-right text-[10px] font-bold tracking-wider uppercase text-[#8E8EA8] px-3 py-2">Scans</th>
                    <th className="text-right text-[10px] font-bold tracking-wider uppercase text-[#8E8EA8] px-3 py-2">🛒</th>
                    <th className="text-right text-[10px] font-bold tracking-wider uppercase text-[#8E8EA8] px-3 py-2">🗑️</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EBEBF2]">
                  {sc.topProducts.map(p => (
                    <tr key={p.product}>
                      <td className="px-3 py-2.5 text-[12px] font-semibold text-[#1A1A2E]">{p.product}</td>
                      <td className="px-3 py-2.5 text-[11px] font-medium text-[#8E8EA8]">{p.category ?? '—'}</td>
                      <td className="px-3 py-2.5 text-[12px] font-bold text-[#1A1A2E] text-right tabular-nums">{p.scans}</td>
                      <td className="px-3 py-2.5 text-[11px] font-semibold text-[#2A7D34] text-right tabular-nums">{p.cartPct}%</td>
                      <td className="px-3 py-2.5 text-[11px] font-semibold text-[#8E8EA8] text-right tabular-nums">{p.binsPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-[10px] text-[#8E8EA8] font-medium px-4 py-2.5 border-t border-[#EBEBF2] leading-relaxed">
            Percentages are of each product&apos;s own scans. They fall short of 100% when
            some of its scans have no choice recorded.
          </p>
        </div>

        {/* ── Product Image Service ── */}
        {sc.imageService && (
          <div>
            <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#8E8EA8] px-1 mb-2">
              Product Image Service
            </p>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Catalog Size" value={sc.imageService.catalogSize} sub="known products" />
              <StatCard
                label="Brave Calls"
                value={sc.imageService.braveCallsThisMonth}
                sub="this month (billable)" />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <StatCard
                label="Catalog Hit"
                value={sc.imageService.catalogHit.count}
                sub={`${sc.imageService.catalogHit.pct}% of scans`} />
              <StatCard
                label="Image Search"
                value={sc.imageService.imageSearchRequests.count}
                sub={`${sc.imageService.imageSearchRequests.pct}% of scans`} />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <StatCard
                label="Low Conf."
                value={sc.imageService.lowConfidenceSkips.count}
                sub={`${sc.imageService.lowConfidenceSkips.pct}% skipped`} />
              <StatCard
                label="Too Vague"
                value={sc.imageService.specificitySkips.count}
                sub={`${sc.imageService.specificitySkips.pct}% skipped`} />
              <StatCard
                label="Failed"
                value={sc.imageService.searchFailed}
                sub="searches" />
            </div>
            <p className="text-[10px] text-[#8E8EA8] font-medium px-1 mt-2 leading-relaxed">
              Catalog hit and image search are independent — one scan can count toward
              both, so these do not add up to 100%. Brave calls counts searches and
              failures together; both hit the API and both are billable. All zero while
              IMAGE_SEARCH_ENABLED is off.
            </p>
          </div>
        )}

        {/* Plain link, not fetch(): the browser handles the attachment download
            directly, so there is no blob to build or object URL to revoke. */}
        <a
          href="/api/admin/scanner/export"
          className="w-full py-3 rounded-xl text-[13px] font-bold text-white bg-[#4A4B98] text-center active:opacity-80 transition-opacity"
        >
          Export Scanner Data (CSV)
        </a>
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
    { id: 'settlement', label: 'Settlement' },
    { id: 'scanner',   label: 'Scanner' },
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
        {tab === 'settlement' && renderSettlement()}
        {tab === 'scanner'   && renderScanner()}
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

      {/* Approve settlement batch confirmation */}
      {approveConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center px-4 z-50">
          <div className="bg-white rounded-3xl px-6 py-6 w-full max-w-sm flex flex-col gap-4 shadow-2xl">
            <h3 className="font-['Coiny'] text-xl text-[#1A1A2E]">
              Approve {formatPeriod(approveConfirm.settlementPeriod)}?
            </h3>
            <p className="text-[13px] text-[#8E8EA8] font-medium leading-relaxed">
              This records your approval of {money(approveConfirm.merchantDistributions)} across{' '}
              {approveConfirm.merchantCount} merchant{approveConfirm.merchantCount === 1 ? '' : 's'} and
              carries any negative balances into next period.
            </p>
            <p className="text-[12px] font-semibold text-[#1A1A2E] bg-[#F5F5F8] rounded-xl px-3 py-2.5 leading-relaxed">
              No money moves. Stripe Connect transfers are a separate step and are not
              wired up yet.
            </p>
            <p className="text-[11px] text-[#8E8EA8] font-medium">
              Approval cannot be undone from this screen.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setApproveConfirm(null)}
                className="flex-1 py-3 rounded-xl text-[14px] font-bold text-[#8E8EA8] border-2 border-[#EBEBF2]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const target = approveConfirm
                  setApproveConfirm(null)
                  handleApproveBatch(target)
                }}
                className="flex-1 py-3 rounded-xl text-[14px] font-bold text-white bg-[#2A7D34]"
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disable-enrollment confirmation */}
      {enrollmentConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center px-4 z-50">
          <div className="bg-white rounded-3xl px-6 py-6 w-full max-w-sm flex flex-col gap-4 shadow-2xl">
            <h3 className="font-['Coiny'] text-xl text-[#1A1A2E]">Disable enrollment?</h3>
            <p className="text-[13px] text-[#8E8EA8] font-medium leading-relaxed">
              Are you sure? This will prevent new members from enrolling through this store&apos;s
              QR codes and links.
            </p>
            <p className="text-[12px] font-semibold text-[#1A1A2E] bg-[#F5F5F8] rounded-xl px-3 py-2.5">
              {enrollmentConfirm.brand_name}
              <span className="block text-[10px] font-mono text-[#8E8EA8] mt-0.5">
                {enrollmentConfirm.canonical_key}
              </span>
            </p>
            <p className="text-[11px] text-[#8E8EA8] font-medium leading-relaxed">
              Enrollment should stay on after a merchant cancels. Only disable it for a
              documented reason such as fraud.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setEnrollmentConfirm(null)}
                className="flex-1 py-3 rounded-xl text-[14px] font-bold text-[#8E8EA8] border-2 border-[#EBEBF2]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const target = enrollmentConfirm
                  setEnrollmentConfirm(null)
                  applyStoreToggle(target, 'enrollment_enabled', false)
                }}
                className="flex-1 py-3 rounded-xl text-[14px] font-bold text-white bg-[#DA1212]"
              >
                Disable
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