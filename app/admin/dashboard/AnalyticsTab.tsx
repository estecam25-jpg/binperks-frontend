'use client'

/**
 * God Mode — Analytics.
 *
 * Read-only. Every number comes from /api/admin/analytics in one request; this
 * component never writes and has no actions beyond refreshing.
 *
 * The response is cached server-side for five minutes, so switching tabs is
 * free. "Refresh" bypasses that cache, and the header states how old the
 * numbers are rather than implying they are live.
 */

import { useCallback, useEffect, useState } from 'react'
import { StatCard, Spinner } from './ui'

// ── Types (mirrors /api/admin/analytics) ──────────────────────────────────

type RangeKey = 'week' | 'mtd' | 'ytd' | 'allTime'

interface GrowthRow {
  newMembers: number; newVipMembers: number; newMerchants: number
  stampsAwarded: number; couponsEarned: number; couponsRedeemed: number
}
interface Analytics {
  generatedAt: string
  cached: boolean
  truncated: boolean
  ranges: { key: RangeKey; label: string; since: string | null }[]
  growth: Record<RangeKey, GrowthRow>
  memberBehavior: {
    vipConversion: { starterMembers: number; vipMembers: number; totalMembers: number; conversionRate: number }
    retention: { last30: number; days31to60: number; days61to90: number; inactive90Plus: number; neverStamped: number }
    speedToFirstCoupon: { averageDays: number | null; memberCount: number; fastestDays: number | null; slowestDays: number | null }
    referrals: { membersViaReferral: number; totalMembers: number; referralRate: number }
    coupons: { earned: number; redeemed: number; redemptionRate: number }
  }
  storePerformance: {
    topStores: { storeId: string; storeName: string; merchantName: string; stamps: number; visits: number }[]
    inactiveStores: { storeId: string; storeName: string; merchantName: string; isActive: boolean; lastActivityAt: string | null }[]
    crossNetworkActivity: { crossNetworkEvents: number; totalEvents: number; crossNetworkPct: number; houseOriginEvents: number }
  }
  scannerIntelligence: {
    totalScans: number; scansThisMonth: number
    topCategories: { category: string; scans: number }[]
    topProducts: { product: string | null; category: string | null; scans: number }[]
    avgConfidence: number | null; confidenceSampleSize: number
    imageSearchRate: number; catalogHitRate: number; catalogImageHitRate: number
    imageSearchCalls: number; catalogHits: number; catalogImageHits: number
  }
  financialHealth: {
    commissionsEarned: number; commissionsRetained: number; couponsFundedByBinPerks: number
    eligibilityRate: number; commissionDecisions: number; eligibleDecisions: number
    negativeMerchants: { merchantId: string; merchantName: string; negativeBalance: number }[]
    mrr: { activeMerchantCount: number; merchantMrr: number; memberMrr: number; totalMrr: number }
    ledgerEmpty: boolean
  }
  networkHealth: {
    activeMerchants: number; activeStores: number; totalMerchants: number; totalStores: number
    checks: { label: string; missing: number; total: number; tone: 'green' | 'yellow' | 'red'; names: string[] }[]
  }
  anomalies: {
    starterOver20: { memberId: string; name: string; phone: string; totalStamps: number; originStore: string; isBlacklisted: boolean }[]
    highVelocity: { memberId: string; memberName: string; date: string; storeCount: number }[]
    possibleDuplicates: { name: string; members: { id: string; phone: string; createdAt: string | null; subscriptionStatus: string | null }[] }[]
  }
}

// ── Presentation helpers ──────────────────────────────────────────────────

function Section({ title, subtitle, children, defaultOpen = true }: {
  title: string; subtitle?: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full px-4 py-3 flex items-start justify-between gap-3 text-left active:bg-[#F5F5F8] transition-colors"
      >
        <span className="flex-1 min-w-0">
          <span className="block font-bold text-[13px] text-[#1A1A2E]">{title}</span>
          {subtitle && (
            <span className="block text-[11px] text-[#8E8EA8] font-medium mt-0.5 leading-relaxed">{subtitle}</span>
          )}
        </span>
        <span className="text-[#8E8EA8] text-[12px] font-bold flex-shrink-0 mt-0.5">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-4 pb-4 pt-1 flex flex-col gap-3 border-t border-[#EBEBF2]">{children}</div>}
    </section>
  )
}

/** Wide content scrolls inside its own box rather than pushing the page sideways. */
function TableWrap({ children, minWidth = 420 }: { children: React.ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full border-collapse" style={{ minWidth }}>{children}</table>
    </div>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`text-[10px] font-bold tracking-wider uppercase text-[#8E8EA8] px-3 py-2 ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

function Td({ children, right, muted, mono }: {
  children: React.ReactNode; right?: boolean; muted?: boolean; mono?: boolean
}) {
  return (
    <td className={[
      'px-3 py-2.5 text-[12px]',
      right ? 'text-right' : 'text-left',
      muted ? 'text-[#8E8EA8] font-medium' : 'text-[#1A1A2E] font-semibold',
      mono ? 'tabular-nums' : '',
    ].join(' ')}>
      {children}
    </td>
  )
}

function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr><td colSpan={colSpan} className="px-3 py-4 text-[12px] text-[#8E8EA8] font-medium">{children}</td></tr>
  )
}

const TONE_STYLES = {
  green:  { chip: 'bg-green-100 text-green-700',   icon: '✅' },
  yellow: { chip: 'bg-yellow-100 text-yellow-700', icon: '⚠️' },
  red:    { chip: 'bg-red-100 text-red-700',       icon: '❌' },
} as const

function shortDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const money = (n: number) => '$' + n.toFixed(2)

// ── Tab ───────────────────────────────────────────────────────────────────

export default function AnalyticsTab() {
  const [data, setData]       = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [range, setRange]     = useState<RangeKey>('mtd')

  /** Shared by the mount effect and the Refresh button so both land the same
   *  way — including the 403 case, which means the admin session went away
   *  while the page was open (see AdminDashboard's adminFetch). */
  function apply(d: Analytics | null, status: number) {
    if (d) { setData(d); setError('') }
    else {
      setError(status === 403
        ? 'Admin session ended. Sign in again.'
        : 'Could not load analytics.')
    }
    setLoading(false)
  }

  /** Refresh: bypasses the five-minute server cache. Raises the busy flag from
   *  the click handler, where a setState costs nothing. */
  const reload = useCallback(() => {
    setLoading(true)
    setError('')
    let status = 0
    fetch('/api/admin/analytics?refresh=1')
      .then(r => { status = r.status; return r.ok ? r.json() : null })
      .then(d => apply(d, status))
      .catch(() => apply(null, status))
  }, [])

  // Promise chain rather than an async helper: calling one from an effect body
  // sets state synchronously on the way in, which the React compiler lint
  // rightly flags as a cascading render. Cancelled guard so a fast tab switch
  // cannot set state on an unmounted tab.
  useEffect(() => {
    let cancelled = false
    let status = 0
    fetch('/api/admin/analytics')
      .then(r => { status = r.status; return r.ok ? r.json() : null })
      .then(d => {
        if (cancelled) return
        if (d) { setData(d); setError('') }
        else setError(status === 403 ? 'Admin session ended. Sign in again.' : 'Could not load analytics.')
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setError('Could not load analytics.')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  if (loading && !data) return <Spinner />
  if (error && !data)   return <p className="text-[13px] font-semibold text-[#DA1212]">{error}</p>
  if (!data)            return <p className="text-[13px] text-[#8E8EA8]">No data.</p>

  const g  = data.growth[range]
  const mb = data.memberBehavior
  const sp = data.storePerformance
  const sc = data.scannerIntelligence
  const fh = data.financialHealth
  const nh = data.networkHealth
  const an = data.anomalies

  const activeRange = data.ranges.find(r => r.key === range)
  const anomalyCount =
    an.starterOver20.length + an.highVelocity.length + an.possibleDuplicates.length

  return (
    <div className="flex flex-col gap-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-[#8E8EA8] font-medium leading-relaxed">
          Snapshot from {shortDate(data.generatedAt)}
          {' · '}
          {new Date(data.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          {data.cached && ' (cached)'}
        </p>
        <button
          onClick={reload}
          disabled={loading}
          className="text-[12px] font-bold px-3 py-1.5 rounded-lg bg-[#1A1A2E] text-white disabled:opacity-40 flex-shrink-0"
        >
          {loading ? '…' : 'Refresh'}
        </button>
      </div>

      {data.truncated && (
        <p className="text-[11px] font-semibold text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2 leading-relaxed">
          ⚠️ A table read stopped early, so these totals are a floor rather than a complete
          count. Check the server logs for the table that hit the page limit.
        </p>
      )}

      {/* ── 1. Growth ── */}
      <Section
        title="Growth"
        subtitle={
          activeRange?.since
            ? `Since ${shortDate(activeRange.since)} (UTC).`
            : 'Everything on record.'
        }
      >
        <div className="flex rounded-lg bg-[#F5F5F8] p-0.5" role="group" aria-label="Time range">
          {data.ranges.map(r => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              aria-pressed={range === r.key}
              className={'flex-1 px-2 py-1.5 rounded-md text-[11px] font-bold transition-colors ' + (
                range === r.key ? 'bg-[#4A4B98] text-white' : 'text-[#8E8EA8]'
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <StatCard label="New Members"   value={g.newMembers}     sub="joined in range" />
          <StatCard label="New VIP"       value={g.newVipMembers}  sub="approximate — see note" />
          <StatCard label="New Merchants" value={g.newMerchants}   sub="signed up in range" />
          <StatCard label="Stamps"        value={g.stampsAwarded}  sub="effective stamps" />
          <StatCard label="Coupons Earned"   value={g.couponsEarned}   sub="rewards created" />
          <StatCard label="Coupons Redeemed" value={g.couponsRedeemed} sub="redeemed in range" />
        </div>

        <p className="text-[10px] text-[#8E8EA8] font-medium leading-relaxed">
          New VIP counts members who are VIP <em>now</em> and signed up in this window — there
          is no upgrade date in the schema, so a member who joined in January and upgraded
          later still counts in January. Coupons earned counts reward records created in the
          window; coupons redeemed is dated by when they were redeemed, so the two are not a
          before-and-after pair.
        </p>
      </Section>

      {/* ── 2. Member behaviour ── */}
      <Section title="Member Behavior" subtitle="Conversion, retention, and how fast members reach their first reward.">
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Starter" value={mb.vipConversion.starterMembers} sub="free tier" />
          <StatCard label="VIP"     value={mb.vipConversion.vipMembers}     sub="paid tier" />
          <StatCard label="VIP Rate" value={mb.vipConversion.conversionRate + '%'} sub="of all members" />
        </div>

        <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#8E8EA8] pt-1">
          Retention by last stamp
        </p>
        <TableWrap minWidth={320}>
          <thead>
            <tr className="bg-[#F5F5F8]"><Th>Window</Th><Th right>Members</Th></tr>
          </thead>
          <tbody className="divide-y divide-[#EBEBF2]">
            {[
              { l: 'Stamped in last 30 days', v: mb.retention.last30 },
              { l: '31–60 days ago',          v: mb.retention.days31to60 },
              { l: '61–90 days ago',          v: mb.retention.days61to90 },
              { l: 'Inactive 90+ days',       v: mb.retention.inactive90Plus },
              { l: 'Never stamped',           v: mb.retention.neverStamped },
            ].map(r => (
              <tr key={r.l}><Td>{r.l}</Td><Td right mono>{r.v}</Td></tr>
            ))}
          </tbody>
        </TableWrap>
        <p className="text-[10px] text-[#8E8EA8] font-medium leading-relaxed">
          Never-stamped members are counted separately from lapsed ones — a member who never
          started is a signup problem, not churn.
        </p>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <StatCard
            label="First Reward"
            value={mb.speedToFirstCoupon.averageDays === null ? '—' : mb.speedToFirstCoupon.averageDays + 'd'}
            sub={mb.speedToFirstCoupon.memberCount > 0
              ? `avg over ${mb.speedToFirstCoupon.memberCount} member${mb.speedToFirstCoupon.memberCount === 1 ? '' : 's'}`
              : 'no rewards earned yet'} />
          <StatCard
            label="Referred"
            value={mb.referrals.membersViaReferral}
            sub={`${mb.referrals.referralRate}% of members`} />
        </div>
        {mb.speedToFirstCoupon.averageDays !== null && (
          <p className="text-[10px] text-[#8E8EA8] font-medium leading-relaxed">
            Fastest {mb.speedToFirstCoupon.fastestDays}d, slowest {mb.speedToFirstCoupon.slowestDays}d.
            Averaged only over members who have earned one.
          </p>
        )}

        <div className="grid grid-cols-3 gap-3 pt-1">
          <StatCard label="Earned"    value={mb.coupons.earned}   sub="coupons all time" />
          <StatCard label="Redeemed"  value={mb.coupons.redeemed} sub="coupons all time" />
          <StatCard label="Redemption" value={mb.coupons.redemptionRate + '%'} sub="of earned" />
        </div>
      </Section>

      {/* ── 3. Store performance ── */}
      <Section title="Store Performance" subtitle="Where stamps are actually being awarded.">
        <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#8E8EA8]">
          Top stores by stamps
        </p>
        <TableWrap>
          <thead>
            <tr className="bg-[#F5F5F8]">
              <Th>Store</Th><Th>Merchant</Th><Th right>Stamps</Th><Th right>Visits</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EBEBF2]">
            {sp.topStores.length === 0
              ? <EmptyRow colSpan={4}>No stamp activity recorded yet.</EmptyRow>
              : sp.topStores.map(s => (
                <tr key={s.storeId}>
                  <Td>{s.storeName}</Td>
                  <Td muted>{s.merchantName}</Td>
                  <Td right mono>{s.stamps}</Td>
                  <Td right mono muted>{s.visits}</Td>
                </tr>
              ))}
          </tbody>
        </TableWrap>

        <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#8E8EA8] pt-2">
          Inactive stores · no stamps in 30 days
        </p>
        <TableWrap>
          <thead>
            <tr className="bg-[#F5F5F8]">
              <Th>Store</Th><Th>Merchant</Th><Th right>Last activity</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EBEBF2]">
            {sp.inactiveStores.length === 0
              ? <EmptyRow colSpan={3}>✅ Every store has stamped in the last 30 days.</EmptyRow>
              : sp.inactiveStores.map(s => (
                <tr key={s.storeId}>
                  <Td>
                    {s.storeName}
                    {!s.isActive && <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">inactive</span>}
                  </Td>
                  <Td muted>{s.merchantName}</Td>
                  <Td right muted>{s.lastActivityAt ? shortDate(s.lastActivityAt) : 'never'}</Td>
                </tr>
              ))}
          </tbody>
        </TableWrap>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <StatCard
            label="Cross-Network"
            value={sp.crossNetworkActivity.crossNetworkEvents}
            sub={`${sp.crossNetworkActivity.crossNetworkPct}% of all stamps`} />
          <StatCard
            label="House Origin"
            value={sp.crossNetworkActivity.houseOriginEvents}
            sub="stamps by BinPerks-origin members" />
        </div>
        <p className="text-[10px] text-[#8E8EA8] font-medium leading-relaxed">
          Cross-network counts stamps earned at a merchant other than the member&apos;s Origin
          Merchant. Members who joined through BinPerks itself are counted separately — they
          have no participating origin merchant, so every stamp they earn would otherwise
          look like cross-shopping.
        </p>
      </Section>

      {/* ── 4. Scanner ── */}
      <Section title="Scanner Intelligence" subtitle="What members are scanning, and how the image service is doing.">
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Total Scans" value={sc.totalScans}     sub="all time" />
          <StatCard label="This Month"  value={sc.scansThisMonth} sub="scans" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Avg Confidence"
            value={sc.avgConfidence === null ? '—' : sc.avgConfidence.toFixed(2)}
            sub={`over ${sc.confidenceSampleSize} logged`} />
          <StatCard label="Catalog Hit" value={sc.catalogHitRate + '%'} sub={`${sc.catalogHits} of scans`} />
          <StatCard
            label="Catalog Image"
            value={sc.catalogImageHitRate + '%'}
            sub={`${sc.catalogImageHits} free of charge`} />
          <StatCard
            label="True Brave Rate"
            value={sc.imageSearchRate + '%'}
            sub={`${sc.imageSearchCalls} billable calls`} />
        </div>
        <p className="text-[10px] text-[#8E8EA8] font-medium leading-relaxed">
          Confidence is averaged over image_search_log rows only — scans that never reached
          the image service are not in it. Catalog hit and true Brave rate are independent
          rates over the same scan total, so they do not add to 100%. Catalog image is the
          one that costs nothing: the product was known and its representative image was
          already stored, so the scan never reached Brave.
        </p>

        <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#8E8EA8] pt-2">
          Top categories
        </p>
        <TableWrap minWidth={280}>
          <thead><tr className="bg-[#F5F5F8]"><Th>Category</Th><Th right>Scans</Th></tr></thead>
          <tbody className="divide-y divide-[#EBEBF2]">
            {sc.topCategories.length === 0
              ? <EmptyRow colSpan={2}>No categories identified yet.</EmptyRow>
              : sc.topCategories.map(c => (
                <tr key={c.category}><Td>{c.category}</Td><Td right mono>{c.scans}</Td></tr>
              ))}
          </tbody>
        </TableWrap>

        <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#8E8EA8] pt-2">
          Most scanned products · product catalog
        </p>
        <TableWrap>
          <thead>
            <tr className="bg-[#F5F5F8]"><Th>Product</Th><Th>Category</Th><Th right>Scans</Th></tr>
          </thead>
          <tbody className="divide-y divide-[#EBEBF2]">
            {sc.topProducts.length === 0
              ? <EmptyRow colSpan={3}>Catalog is empty.</EmptyRow>
              : sc.topProducts.map((p, i) => (
                <tr key={(p.product ?? '') + i}>
                  <Td>{p.product ?? '—'}</Td>
                  <Td muted>{p.category ?? '—'}</Td>
                  <Td right mono>{p.scans}</Td>
                </tr>
              ))}
          </tbody>
        </TableWrap>
      </Section>

      {/* ── 5. Financial ── */}
      <Section title="Financial Health" subtitle="Commissions, coupon funding, and what the network bills.">
        <StatCard label="Total MRR" accent value={money(fh.mrr.totalMrr)}
          sub={`${money(fh.mrr.merchantMrr)} merchant + ${money(fh.mrr.memberMrr)} member`} />

        <div className="grid grid-cols-2 gap-3">
          <StatCard label="To Merchants"  value={money(fh.commissionsEarned)}   sub="commission credits" />
          <StatCard label="BinPerks Kept" value={money(fh.commissionsRetained)} sub="ineligible origins" />
          <StatCard label="Coupons Funded" value={money(fh.couponsFundedByBinPerks)} sub="by BinPerks" />
          <StatCard label="Eligibility"    value={fh.eligibilityRate + '%'}
            sub={`${fh.eligibleDecisions} of ${fh.commissionDecisions} decisions`} />
        </div>

        {fh.ledgerEmpty && (
          <p className="text-[11px] font-medium text-[#8E8EA8] bg-[#F5F5F8] rounded-xl px-3 py-2 leading-relaxed">
            The settlement ledger has no rows yet, so every figure above is $0.00 because
            nothing has been recorded — not because it failed. The first entries are written
            when a VIP payment runs through the member webhook.
          </p>
        )}

        <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#8E8EA8] pt-1">
          Merchants carrying a negative balance
        </p>
        <TableWrap minWidth={300}>
          <thead><tr className="bg-[#F5F5F8]"><Th>Merchant</Th><Th right>Owes</Th></tr></thead>
          <tbody className="divide-y divide-[#EBEBF2]">
            {fh.negativeMerchants.length === 0
              ? <EmptyRow colSpan={2}>✅ No merchant is carrying a negative balance.</EmptyRow>
              : fh.negativeMerchants.map(m => (
                <tr key={m.merchantId}>
                  <Td>{m.merchantName}</Td>
                  <Td right mono>{money(m.negativeBalance)}</Td>
                </tr>
              ))}
          </tbody>
        </TableWrap>
      </Section>

      {/* ── 6. Network health ── */}
      <Section title="Network Health" subtitle="Setup gaps across merchants, stores, and member records.">
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Active Merchants" value={nh.activeMerchants} sub={`of ${nh.totalMerchants} total`} />
          <StatCard label="Active Stores"    value={nh.activeStores}    sub={`of ${nh.totalStores} total`} />
        </div>

        <div className="flex flex-col gap-2">
          {nh.checks.map(c => {
            const tone = TONE_STYLES[c.tone]
            return (
              <div key={c.label} className="border border-[#EBEBF2] rounded-xl px-3 py-2.5 flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold text-[#1A1A2E] flex-1 min-w-0">
                    {tone.icon} {c.label}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${tone.chip}`}>
                    {c.missing} of {c.total}
                  </span>
                </div>
                {c.names.length > 0 && (
                  <p className="text-[11px] text-[#8E8EA8] font-medium leading-relaxed">
                    {c.names.join(', ')}
                    {c.missing > c.names.length && ` +${c.missing - c.names.length} more`}
                  </p>
                )}
              </div>
            )
          })}
        </div>
        <p className="text-[10px] text-[#8E8EA8] font-medium leading-relaxed">
          The BinPerks house merchant and store are excluded — they exist to hold origin
          attribution, not to trade, so their missing Stripe Connect and pricing are not gaps.
        </p>
      </Section>

      {/* ── 7. Anomalies ── */}
      <Section
        title={`Anomaly Detection${anomalyCount > 0 ? ` · ${anomalyCount}` : ''}`}
        subtitle="Prompts for a human to look at. Nothing here is a verdict."
      >
        <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#8E8EA8]">
          Starter members over 20 stamps
        </p>
        <TableWrap>
          <thead>
            <tr className="bg-[#F5F5F8]">
              <Th>Member</Th><Th>Phone</Th><Th>Origin store</Th><Th right>Stamps</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EBEBF2]">
            {an.starterOver20.length === 0
              ? <EmptyRow colSpan={4}>✅ None — the Starter cap is holding.</EmptyRow>
              : an.starterOver20.map(m => (
                <tr key={m.memberId} className="bg-yellow-50">
                  <Td>
                    ⚠️ {m.name}
                    {m.isBlacklisted && <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">blacklisted</span>}
                  </Td>
                  <Td muted>{m.phone}</Td>
                  <Td muted>{m.originStore}</Td>
                  <Td right mono>{m.totalStamps}</Td>
                </tr>
              ))}
          </tbody>
        </TableWrap>
        <p className="text-[10px] text-[#8E8EA8] font-medium leading-relaxed">
          A Starter member is blocked after visit 22 and gets one $5 coupon for life, so this
          list should stay empty.
        </p>

        <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#8E8EA8] pt-2">
          Stamps at 3+ stores in one day
        </p>
        <TableWrap minWidth={340}>
          <thead>
            <tr className="bg-[#F5F5F8]"><Th>Member</Th><Th>Date</Th><Th right>Stores</Th></tr>
          </thead>
          <tbody className="divide-y divide-[#EBEBF2]">
            {an.highVelocity.length === 0
              ? <EmptyRow colSpan={3}>✅ No member stamped at three or more stores in a day.</EmptyRow>
              : an.highVelocity.map(h => (
                <tr key={h.memberId + h.date}>
                  <Td>{h.memberName}</Td>
                  <Td muted>{h.date}</Td>
                  <Td right mono>{h.storeCount}</Td>
                </tr>
              ))}
          </tbody>
        </TableWrap>
        <p className="text-[10px] text-[#8E8EA8] font-medium leading-relaxed">
          Allowed by the rules — one stamp per store per day — and days are counted in UTC.
          Worth a look, not an accusation.
        </p>

        <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#8E8EA8] pt-2">
          Possible duplicate accounts
        </p>
        <TableWrap>
          <thead>
            <tr className="bg-[#F5F5F8]"><Th>Name</Th><Th>Phones</Th><Th right>Accounts</Th></tr>
          </thead>
          <tbody className="divide-y divide-[#EBEBF2]">
            {an.possibleDuplicates.length === 0
              ? <EmptyRow colSpan={3}>✅ No repeated names across different phone numbers.</EmptyRow>
              : an.possibleDuplicates.map(d => (
                <tr key={d.name}>
                  <Td>{d.name}</Td>
                  <Td muted>{d.members.map(m => m.phone || '—').join(', ')}</Td>
                  <Td right mono>{d.members.length}</Td>
                </tr>
              ))}
          </tbody>
        </TableWrap>
        <p className="text-[10px] text-[#8E8EA8] font-medium leading-relaxed">
          One phone is one membership, so a duplicate can only appear as the same name on a
          second number. Two real people with the same name land here too.
        </p>
      </Section>
    </div>
  )
}
