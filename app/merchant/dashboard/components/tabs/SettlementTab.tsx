'use client'

import { useEffect, useState } from 'react'

interface Statement {
  id: string
  settlementPeriod: string
  grossDistribution: number | null
  netDistribution: number | null
  statementStatus: string | null
  transferStatus: string | null
  transferInitiatedAt: string | null
  transferCompletedAt: string | null
}

// Settlement periods are stored as text (e.g. "2026-08"). Render them as a
// readable month, falling back to the raw value for any unexpected format.
function formatPeriod(period: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(period)
  if (!match) return period
  const [, year, month] = match
  const d = new Date(Number(year), Number(month) - 1, 1)
  if (Number.isNaN(d.getTime())) return period
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function formatMoney(amount: number | null): string {
  if (amount === null) return '—'
  return `$${amount.toFixed(2)}`
}

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  paid:     { bg: '#2A7D3415', color: '#2A7D34' },
  approved: { bg: '#4A4B9815', color: '#4A4B98' },
  draft:    { bg: '#8E8EA815', color: '#8E8EA8' },
  pending:  { bg: '#FFB21725', color: '#8A6A00' },
  failed:   { bg: '#DA121215', color: '#DA1212' },
}

function StatusPill({ label }: { label: string }) {
  const style = STATUS_STYLES[label.toLowerCase()] ?? STATUS_STYLES.draft
  return (
    <span
      className="text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full flex-shrink-0"
      style={{ backgroundColor: style.bg, color: style.color }}
    >
      {label.replace(/_/g, ' ')}
    </span>
  )
}

export default function SettlementTab() {
  const [statements, setStatements] = useState<Statement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/api/merchant/settlement')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) setStatements(d.statements ?? [])
        else setError(true)
        setLoading(false)
      })
      .catch(() => { setError(true); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl h-24 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-12">

      <div className="px-1">
        <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">Settlement statements</h2>
        <p className="text-[12px] text-[#8E8EA8] font-medium mt-0.5 leading-relaxed">
          Your monthly payout from BinPerks: commissions on the VIP members you enrolled, plus
          coupons you honored, minus coupons funded for your members elsewhere.
        </p>
      </div>

      {error ? (
        <div className="bg-white rounded-2xl py-14 px-6 text-center">
          <p className="text-[14px] font-semibold text-[#8E8EA8]">
            Couldn&apos;t load your statements. Please refresh, or email{' '}
            <a href="mailto:support@binperks.com" className="underline text-[#4A4B98]">
              support@binperks.com
            </a>.
          </p>
        </div>
      ) : statements.length === 0 ? (
        <div className="bg-white rounded-2xl py-14 px-6 text-center flex flex-col items-center gap-3">
          <span className="text-3xl">🧾</span>
          <p className="text-[14px] font-semibold text-[#8E8EA8] max-w-xs leading-relaxed">
            Your first settlement statement will appear here after the first monthly
            settlement cycle.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="divide-y divide-[#EBEBF2]">
            {statements.map(s => (
              <div key={s.id} className="px-4 py-4 flex flex-col gap-2">

                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold text-[#1A1A2E] truncate">
                      {formatPeriod(s.settlementPeriod)}
                    </p>
                  </div>
                  {s.statementStatus && <StatusPill label={s.statementStatus} />}
                </div>

                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[11px] font-bold tracking-[0.06em] uppercase text-[#8E8EA8]">
                    Net distribution
                  </span>
                  <span className="font-['Coiny'] text-2xl text-[#2A7D34] leading-none">
                    {formatMoney(s.netDistribution)}
                  </span>
                </div>

                {(s.transferCompletedAt || s.transferInitiatedAt) && (
                  <p className="text-[11px] text-[#8E8EA8] font-medium">
                    {s.transferCompletedAt
                      ? `Transferred ${formatDate(s.transferCompletedAt)}`
                      : `Transfer initiated ${formatDate(s.transferInitiatedAt!)}`}
                    {s.transferStatus ? ` · ${s.transferStatus.replace(/_/g, ' ')}` : ''}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-[#8E8EA8] text-center font-medium leading-relaxed px-2">
        Statements are generated after BinPerks closes and approves each monthly settlement
        period. Questions about a payout?{' '}
        <a href="mailto:support@binperks.com" className="underline text-[#4A4B98] font-semibold">
          support@binperks.com
        </a>
      </p>
    </div>
  )
}
