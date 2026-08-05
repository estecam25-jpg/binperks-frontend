'use client'

import { useEffect, useState } from 'react'

interface ChartDay { date: string; dayLabel: string; stampCount: number }
interface RecentMember { id: string; firstName: string; lastName: string; tier: string; totalStamps: number; joinedAt: string }

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
    stampsToday: number
    couponsRedeemedThisWeek: number
    referralsThisWeek: number
    newMembersThisWeek: number
  } | null
  originMetrics: OriginMetrics | null
  fiscalWeekChart: ChartDay[]
  recentMembers: RecentMember[]
  fiscalWeekStart: string
}

const TIER_COLORS: Record<string, string> = {
  Free: '#8E8EA8', Bronze: '#A05C00', Silver: '#5A5A7A', Gold: '#8A6A00', Diamond: '#3A3B80',
}

export default function OverviewTab({ storeId }: { storeId: string | null }) {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const url = storeId
      ? `/api/merchant/dashboard?storeId=${storeId}`
      : '/api/merchant/dashboard'
    fetch(url).then(r => r.json()).then(d => { setData(d); setLoading(false) })
  }, [storeId])

  if (loading) return <LoadingSkeleton />
  if (!data?.stats) return <EmptyState />

  const { stats, fiscalWeekChart, recentMembers, merchant, originMetrics } = data
  const maxStamps = Math.max(...fiscalWeekChart.map(d => d.stampCount), 1)
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
          { label: 'Stamps today',    value: stats.stampsToday.toLocaleString(),              icon: '🏷️', color: '#FFB217' },
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
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">This fiscal week</h2>
          <span className="text-[10px] font-bold tracking-widest uppercase text-[#8E8EA8]">
            Stamps per day
          </span>
        </div>

        {/* Bar chart */}
        <div className="flex items-end gap-1.5 h-24">
          {fiscalWeekChart.map((day, i) => {
            const pct = maxStamps > 0 ? day.stampCount / maxStamps : 0
            const isToday = day.date === new Date().toISOString().split('T')[0]
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                <span className="text-[10px] font-bold text-[#8E8EA8] tabular-nums">
                  {day.stampCount > 0 ? day.stampCount : ''}
                </span>
                <div className="w-full flex items-end" style={{ height: '64px' }}>
                  <div
                    className="w-full rounded-t-md transition-all duration-500"
                    style={{
                      height: `${Math.max(pct * 100, day.stampCount > 0 ? 8 : 0)}%`,
                      backgroundColor: isToday ? '#FFB217' : '#4A4B98',
                      opacity: day.stampCount === 0 ? 0.15 : 1,
                      minHeight: day.stampCount > 0 ? '6px' : '0',
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

      {/* ── Recent members ── */}
      {recentMembers.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 border-b border-[#EBEBF2]">
            <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">Recent members</h2>
          </div>
          <div className="divide-y divide-[#EBEBF2]">
            {recentMembers.slice(0, 8).map(m => (
              <div key={m.id} className="px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#4A4B98] flex items-center justify-center font-['Coiny'] text-sm text-white flex-shrink-0">
                  {m.firstName[0]}{m.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-[#1A1A2E] truncate">
                    {m.firstName} {m.lastName}
                  </p>
                  <p className="text-[11px] text-[#8E8EA8] font-medium">
                    {m.totalStamps} stamps
                  </p>
                </div>
                <span
                  className="text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: `${TIER_COLORS[m.tier] ?? '#8E8EA8'}15`,
                    color: TIER_COLORS[m.tier] ?? '#8E8EA8',
                  }}
                >
                  {m.tier}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
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
