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

interface ConnectStatus {
  connected: boolean
  chargesEnabled?: boolean
  payoutsEnabled?: boolean
  detailsSubmitted?: boolean
  requiresAction?: boolean
  bankLast4?: string | null
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

// Keys match merchant_settlement_statements.statement_status
// (draft | approved | transferred | failed | adjusted), plus a couple of
// transfer-status values that render through the same pill.
const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  paid:        { bg: '#2A7D3415', color: '#2A7D34' },
  transferred: { bg: '#2A7D3415', color: '#2A7D34' },
  approved:    { bg: '#4A4B9815', color: '#4A4B98' },
  adjusted:    { bg: '#FFB21725', color: '#8A6A00' },
  draft:       { bg: '#8E8EA815', color: '#8E8EA8' },
  pending:     { bg: '#FFB21725', color: '#8A6A00' },
  failed:      { bg: '#DA121215', color: '#DA1212' },
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

/**
 * Payout account — Stripe Connect onboarding state.
 *
 * Rendered above the statements because it is the blocking step: a merchant
 * with no connected account earns commissions that cannot be paid out, and the
 * statement list alone gives no hint of that.
 */
function PayoutAccount() {
  const [status, setStatus] = useState<ConnectStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/merchant/connect/status')
      .then(r => r.ok ? r.json() : null)
      .then(d => { setStatus(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function startOnboarding() {
    setStarting(true); setError('')
    try {
      const res = await fetch('/api/merchant/connect', { method: 'POST' })
      const d = await res.json().catch(() => null)
      if (res.ok && d?.url) {
        // Full navigation, not a new tab — Stripe returns the merchant here
        // via return_url when they finish.
        window.location.href = d.url
        return
      }
      setError("Couldn't open payout setup. Please try again or email support@binperks.com.")
    } catch {
      setError("Couldn't open payout setup. Please try again.")
    }
    setStarting(false)
  }

  if (loading) return <div className="bg-white rounded-2xl h-24 animate-pulse" />
  if (!status) return null

  const connected = status.connected === true
  const ready = connected && status.payoutsEnabled === true && status.requiresAction === false

  const tone = ready
    ? { bg: '#2A7D3412', border: '#2A7D3430' }
    : connected
      ? { bg: '#FFB21720', border: '#FFB21750' }
      : { bg: '#FFFFFF',  border: '#EBEBF2' }

  return (
    <div
      className="rounded-2xl px-4 py-4 flex flex-col gap-3 shadow-sm border"
      style={{ backgroundColor: tone.bg, borderColor: tone.border }}
    >
      <p className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#8E8EA8]">
        Payout account
      </p>

      {ready ? (
        <>
          <p className="text-[14px] font-bold text-[#2A7D34] leading-snug">
            ✅ Payout account connected
          </p>
          <p className="text-[12px] text-[#8E8EA8] font-medium leading-relaxed">
            {status.bankLast4
              ? `Monthly payouts go to your bank account ending ${status.bankLast4}.`
              : 'Monthly payouts will be sent to your connected bank account.'}
          </p>
        </>
      ) : connected ? (
        <>
          <p className="text-[14px] font-bold text-[#8A6A00] leading-snug">
            ⚠️ Action required — complete your payout setup
          </p>
          <p className="text-[12px] text-[#8E8EA8] font-medium leading-relaxed">
            Stripe still needs a few details before BinPerks can send your payouts.
            Until this is finished your commissions are calculated but cannot be paid.
          </p>
          <button
            onClick={startOnboarding}
            disabled={starting}
            className="w-full py-3 rounded-xl text-[13px] font-bold text-white bg-[#4A4B98] disabled:opacity-40 active:opacity-80 transition-opacity"
          >
            {starting ? 'Opening…' : 'Complete Setup'}
          </button>
        </>
      ) : (
        <>
          <p className="text-[14px] font-bold text-[#1A1A2E] leading-snug">
            Connect your bank account to receive monthly payouts
          </p>
          <p className="text-[12px] text-[#8E8EA8] font-medium leading-relaxed">
            BinPerks pays commissions monthly through Stripe. This takes a few minutes
            and only needs doing once.
          </p>
          <button
            onClick={startOnboarding}
            disabled={starting}
            className="w-full py-3 rounded-xl text-[13px] font-bold text-white bg-[#4A4B98] disabled:opacity-40 active:opacity-80 transition-opacity"
          >
            {starting ? 'Opening…' : 'Connect Bank Account'}
          </button>
        </>
      )}

      {error && (
        <p className="text-[12px] font-semibold text-[#DA1212] leading-snug">{error}</p>
      )}
    </div>
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

  return (
    <div className="flex flex-col gap-4 p-4 pb-12">

      {/* Above the statements, and outside the statements loading state — a
          merchant with no payout account needs to see that whether or not
          their statement list has loaded, and it has its own request. */}
      <PayoutAccount />

      <div className="px-1">
        <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">Settlement statements</h2>
        <p className="text-[12px] text-[#8E8EA8] font-medium mt-0.5 leading-relaxed">
          Your monthly payout from BinPerks: commissions on the VIP members you enrolled, plus
          coupons you honored, minus coupons funded for your members elsewhere.
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl h-24 animate-pulse" />
          ))}
        </div>
      ) : error ? (
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
