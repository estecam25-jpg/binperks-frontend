'use client'

import { useEffect, useState, useCallback } from 'react'

interface Member {
  id: string; firstName: string; lastName: string; phone: string
  tier: string; totalStamps: number; subscriptionStatus: string
  lastVisitDate: string | null; joinedAt: string
}

const TIER_COLORS: Record<string, string> = {
  Free: '#8E8EA8', Bronze: '#A05C00', Silver: '#5A5A7A', Gold: '#8A6A00', Diamond: '#3A3B80',
}
const TIER_BG: Record<string, string> = {
  Free: '#F5F5F8', Bronze: '#FDF0E0', Silver: '#EEEEF5', Gold: '#FFF8E0', Diamond: '#EEF0FF',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function maskPhone(digits: string): string {
  if (digits.length < 4) return digits
  return `(${digits.slice(0,3)}) ***-${digits.slice(-4)}`
}

export default function MembersTab({ storeId }: { storeId: string | null }) {
  const [members, setMembers] = useState<Member[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)

  const fetchMembers = useCallback(async (searchVal: string, pageVal: number) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(pageVal), limit: '50' })
    if (storeId) params.set('storeId', storeId)
    if (searchVal) params.set('search', searchVal)

    const res = await fetch(`/api/merchant/members?${params}`)
    if (res.ok) {
      const data = await res.json()
      setMembers(data.members)
      setTotal(data.total)
      setPages(data.pages)
    }
    setLoading(false)
  }, [storeId])

  useEffect(() => {
    setPage(1)
    const t = setTimeout(() => fetchMembers(search, 1), search ? 300 : 0)
    return () => clearTimeout(t)
  }, [search, storeId, fetchMembers])

  useEffect(() => {
    if (page > 1) fetchMembers(search, page)
  }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleExport() {
    setDownloading(true)
    const url = storeId ? `/api/merchant/export?storeId=${storeId}` : '/api/merchant/export'
    const res = await fetch(url)
    if (res.ok) {
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      const cd = res.headers.get('Content-Disposition') ?? ''
      a.download = cd.match(/filename="([^"]+)"/)?.[1] ?? 'members.csv'
      a.click()
      URL.revokeObjectURL(a.href)
    }
    setDownloading(false)
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-12">

      {/* Search + export row */}
      <div className="flex gap-2.5">
        <div className="flex-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E8EA8] text-sm">🔍</span>
          <input
            type="text"
            placeholder="Search by name or phone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-4 py-3 rounded-xl bg-white border-2 border-transparent focus:border-[#4A4B98] outline-none text-[14px] font-semibold text-[#1A1A2E] placeholder:text-[#D1D1DC] placeholder:font-normal"
          />
        </div>
        <button
          onClick={handleExport}
          disabled={downloading}
          className="flex-shrink-0 px-4 py-3 rounded-xl bg-white border-2 border-[#EBEBF2] text-[13px] font-bold text-[#4A4B98] disabled:opacity-50 active:bg-indigo-50 transition-colors"
        >
          {downloading ? '…' : '↓ CSV'}
        </button>
      </div>

      {/* Total count */}
      <p className="text-[12px] font-semibold text-[#8E8EA8] px-1">
        {total.toLocaleString()} member{total !== 1 ? 's' : ''}
        {search && ` matching "${search}"`}
      </p>

      {/* Member list */}
      {loading ? (
        <div className="flex flex-col gap-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl h-16 animate-pulse" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <div className="bg-white rounded-2xl py-16 text-center">
          <p className="text-[14px] font-semibold text-[#8E8EA8]">
            {search ? 'No members match that search.' : 'No members yet.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="divide-y divide-[#EBEBF2]">
            {members.map(m => (
              <div key={m.id} className="px-4 py-3.5 flex items-center gap-3">
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-[#4A4B98] flex items-center justify-center font-['Coiny'] text-sm text-white flex-shrink-0">
                  {m.firstName[0]}{m.lastName[0]}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[14px] font-bold text-[#1A1A2E] truncate">
                      {m.firstName} {m.lastName}
                    </p>
                    {m.subscriptionStatus === 'vip' && (
                      <span className="text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded-full bg-[#4A4B98] text-white">
                        VIP
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#8E8EA8] font-medium">
                    {maskPhone(m.phone)} · {m.totalStamps} stamps ·{' '}
                    Last visit {formatDate(m.lastVisitDate)}
                  </p>
                </div>

                {/* Tier badge */}
                <span
                  className="text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: TIER_BG[m.tier] ?? '#F5F5F8', color: TIER_COLORS[m.tier] ?? '#8E8EA8' }}
                >
                  {m.tier}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-4 py-2 rounded-xl bg-white text-[13px] font-bold text-[#4A4B98] border-2 border-[#EBEBF2] disabled:opacity-30"
          >
            ← Prev
          </button>
          <span className="text-[12px] font-semibold text-[#8E8EA8]">
            Page {page} of {pages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(pages, p + 1))}
            disabled={page >= pages}
            className="px-4 py-2 rounded-xl bg-white text-[13px] font-bold text-[#4A4B98] border-2 border-[#EBEBF2] disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
