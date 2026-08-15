'use client'

import { useEffect, useState } from 'react'

interface ChartDay { date: string; dayLabel: string; visitCount: number; stampCount: number }

/**
 * Visits vs stamps.
 *
 * A VISIT is one qualifying trip — one member, one location, one day. STAMPS
 * are what that visit actually awarded, which is the visit times the member's
 * tier multiplier, so a Diamond VIP's single visit is 5 stamps. The two used
 * to be conflated: the tile read "Stamps today" while counting visit rows.
 */
type Metric = 'visits' | 'stamps'

interface OriginMetrics {
  originatedMembers: number
  originatedVipMembers: number
  // null when the merchant is not commission_eligible — no potential to show.
  monthlyCommissionPotential: number | null
}

interface OverviewData {
  merchant: {
    commissionEligible: boolean
    commissionSuspensionReason: string | null
  } | null
  stats: {
    totalMembers: number
    visitsToday: number
    stampsToday: number
    couponsRedeemedThisWeek: number
    referralsThisWeek: number
    newMembersThisWeek: number
  } | null
  originMetrics: OriginMetrics | null
  fiscalWeekChart: ChartDay[]
  fiscalWeekStart: string
}

export default function OverviewTab({ storeId }: { storeId: string | null }) {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [metric, setMetric] = useState<Metric>('visits')

  useEffect(() => {
    setLoading(true)
    const url = storeId
      ? `/api/merchant/dashboard?storeId=${storeId}`
      : '/api/merchant/dashboard'
    fetch(url).then(r => r.json()).then(d => { setData(d); setLoading(false) })
  }, [storeId])

  if (loading) return <LoadingSkeleton />
  if (!data?.stats) return <EmptyState />

  const { stats, fiscalWeekChart, merchant, originMetrics } = data
  const showStamps = metric === 'stamps'
  const valueFor = (d: ChartDay) => showStamps ? d.stampCount : d.visitCount
  const maxValue = Math.max(...fiscalWeekChart.map(valueFor), 1)
  const eligible = merchant?.commissionEligible ?? false

  return (
    <div className="flex flex-col gap-5 p-4 pb-12">

      {/* ── Commission eligibility ──
          Merchant-level status: unaffected by which location is selected. */}
      {merchant && (
        <div
          className="rounded-2xl px-4 py-3.5 flex items-start gap-3 border"
          style={
            eligible
              ? { backgroundColor: '#F0FAF1', borderColor: '#BFE3C4' }
              : { backgroundColor: '#FDF0F0', borderColor: '#F3C4C4' }
          }
        >
          <span className="text-lg flex-shrink-0 leading-none mt-0.5">
            {eligible ? '✅' : '⏸️'}
          </span>
          <div className="flex-1 min-w-0">
            <p
              className="text-[14px] font-bold leading-tight"
              style={{ color: eligible ? '#2A7D34' : '#DA1212' }}
            >
              {eligible ? 'Earning commissions ✓' : 'Commissions paused'}
            </p>
            <p className="text-[11px] text-[#8E8EA8] font-medium mt-0.5 leading-relaxed">
              {eligible
                ? `You earn $19.99/month for every VIP member you enroll, for as long as they stay subscribed.`
                : `Members you enrolled keep their perks and coupons, but new commissions aren't being credited to your account. Contact BinPerks at support@binperks.com to resolve this.`}
            </p>
          </div>
        </div>
      )}

      {/* ── Stats grid ── */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Total members',   value: stats.totalMembers.toLocaleString(),             icon: '👥', color: '#4A4B98' },
          {
            label: showStamps ? 'Stamps today' : 'Visits today',
            value: (showStamps ? stats.stampsToday : stats.visitsToday).toLocaleString(),
            icon: '🏷️', color: '#FFB217',
          },
          { label: 'Coupons this week', value: stats.couponsRedeemedThisWeek.toLocaleString(), icon: '🎟️', color: '#DA1212' },
          { label: 'New members',     value: stats.newMembersThisWeek.toLocaleString(),        icon: '✨', color: '#2A7D34' },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-2xl px-4 py-4 shadow-sm flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-[0.06em] uppercase text-[#8E8EA8]">
                {stat.label}
              </span>
              <span className="text-lg">{stat.icon}</span>
            </div>
            <span
              className="font-['Coiny'] text-3xl leading-none"
              style={{ color: stat.color }}
            >
              {stat.value}
            </span>
          </div>
        ))}
      </div>

      {/* ── Members you originated ──
          Attribution is permanent and merchant-wide, so these figures do not
          change when switching between locations. */}
      {originMetrics && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 border-b border-[#EBEBF2]">
            <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">Members you enrolled</h2>
            <p className="text-[11px] text-[#8E8EA8] font-medium mt-0.5">
              Members who joined the BinPerks network through your store. This never changes,
              even if they shop elsewhere in the network.
            </p>
          </div>

          <div className="grid grid-cols-2 divide-x divide-[#EBEBF2]">
            <div className="px-4 py-4">
              <p className="text-[11px] font-bold tracking-[0.06em] uppercase text-[#8E8EA8] mb-1">
                Total enrolled
              </p>
              <p className="font-['Coiny'] text-3xl text-[#4A4B98] leading-none">
                {originMetrics.originatedMembers.toLocaleString()}
              </p>
            </div>
            <div className="px-4 py-4">
              <p className="text-[11px] font-bold tracking-[0.06em] uppercase text-[#8E8EA8] mb-1">
                Currently VIP
              </p>
              <p className="font-['Coiny'] text-3xl text-[#FFB217] leading-none">
                {originMetrics.originatedVipMembers.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Only shown while commission_eligible — a paused merchant has no
              potential to project, and BinPerks retains those commissions. */}
          {originMetrics.monthlyCommissionPotential !== null && (
            <div className="px-4 py-4 border-t border-[#EBEBF2] bg-[#F5F5F8]">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[11px] font-bold tracking-[0.06em] uppercase text-[#8E8EA8]">
                  Monthly commission potential
                </p>
                <p className="font-['Coiny'] text-2xl text-[#2A7D34] leading-none">
                  ${originMetrics.monthlyCommissionPotential.toFixed(2)}
                </p>
              </div>
              <p className="text-[11px] text-[#8E8EA8] font-medium mt-1.5 leading-relaxed">
                {originMetrics.originatedVipMembers.toLocaleString()} VIP member
                {originMetrics.originatedVipMembers === 1 ? '' : 's'} × $19.99. An estimate at
                today&apos;s numbers, not an amount owed — your actual payout is calculated in the
                monthly settlement and shown on the Settlement tab.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Fiscal week chart — the signature element ── */}
      <div className="bg-white rounded-2xl px-4 py-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">This fiscal week</h2>

          <div className="flex rounded-lg bg-[#F5F5F8] p-0.5" role="group" aria-label="Metric">
            {(['visits', 'stamps'] as Metric[]).map(m => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                aria-pressed={metric === m}
                className="px-2.5 py-1 rounded-md text-[11px] font-bold capitalize transition-colors"
                style={metric === m
                  ? { backgroundColor: '#4A4B98', color: '#fff' }
                  : { color: '#8E8EA8' }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-[#8E8EA8] font-medium mb-4 leading-relaxed">
          {showStamps
            ? 'Stamps awarded — visits multiplied by each member’s tier.'
            : 'Qualifying visits — one per member, per location, per day.'}
        </p>

        {/* Bar chart */}
        <div className="flex items-end gap-1.5 h-24">
          {fiscalWeekChart.map((day, i) => {
            const value = valueFor(day)
            const pct = maxValue > 0 ? value / maxValue : 0
            const isToday = day.date === new Date().toISOString().split('T')[0]
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                <span className="text-[10px] font-bold text-[#8E8EA8] tabular-nums">
                  {value > 0 ? value : ''}
                </span>
                <div className="w-full flex items-end" style={{ height: '64px' }}>
                  <div
                    className="w-full rounded-t-md transition-all duration-500"
                    style={{
                      height: `${Math.max(pct * 100, value > 0 ? 8 : 0)}%`,
                      backgroundColor: isToday ? '#FFB217' : '#4A4B98',
                      opacity: value === 0 ? 0.15 : 1,
                      minHeight: value > 0 ? '6px' : '0',
                    }}
                  />
                </div>
                <span
                  className="text-[10px] font-bold"
                  style={{ color: isToday ? '#FFB217' : '#8E8EA8' }}
                >
                  {day.dayLabel}
                </span>
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {[0,1,2,3].map(i => (
          <div key={i} className="bg-white rounded-2xl h-20 animate-pulse" />
        ))}
      </div>
      <div className="bg-white rounded-2xl h-40 animate-pulse" />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center gap-3">
      <span className="text-4xl">📊</span>
      <p className="font-['Coiny'] text-2xl text-[#1A1A2E]">No data yet</p>
      <p className="text-[13px] text-[#8E8EA8] font-medium">
        Stats will appear once your first members start visiting.
      </p>
    </div>
  )
}
