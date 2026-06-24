'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function MemberExportPage() {
  const router = useRouter()
  const [brandColor, setBrandColor] = useState('#4A4B98')
  const [brandName, setBrandName] = useState('BinPerks')
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch('/api/member/me').then(res => {
      if (res.status === 401) { router.replace('/member/login'); return null }
      return res.ok ? res.json() : null
    }).then(d => {
      if (d?.store) { setBrandColor(d.store.brandColor); setBrandName(d.store.brandName) }
      setLoading(false)
    })
  }, [router])

  async function handleDownload() {
    setDownloading(true)
    const res = await fetch('/api/member/export')
    if (res.ok) {
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      const cd = res.headers.get('Content-Disposition') ?? ''
      a.download = cd.match(/filename="([^"]+)"/)?.[1] ?? 'my-binperks-data.csv'
      a.click()
      URL.revokeObjectURL(a.href)
      setDone(true)
    }
    setDownloading(false)
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#F5F5F8]">
        <span className="w-8 h-8 border-[3px] border-[#EBEBF2] border-t-[#4A4B98] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">
      <div className="px-5 py-3 flex items-center gap-2.5" style={{ backgroundColor: brandColor }}>
        <span className="font-['Coiny'] text-xl leading-none text-white">{brandName}</span>
      </div>

      <main className="flex-1 flex flex-col items-center px-6 py-12 gap-5 text-center max-w-md mx-auto w-full">
        <span className="text-4xl">📄</span>
        <h1 className="font-['Coiny'] text-2xl text-[#1A1A2E]">Export your data</h1>
        <p className="text-[13px] text-[#8E8EA8] font-medium leading-relaxed">
          Download a CSV of your visit history and coupons — everything BinPerks has on file for you.
        </p>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="w-full py-5 rounded-2xl font-bold text-[17px] text-white font-['Montserrat'] tracking-wide disabled:opacity-50 active:scale-[0.97] transition-all flex items-center justify-center gap-2"
          style={{ backgroundColor: brandColor }}
        >
          {downloading ? 'Preparing…' : done ? '✓ Downloaded — get it again' : 'Download my data (CSV)'}
        </button>

        <button onClick={() => router.push('/member/dashboard')} className="text-[13px] font-semibold text-[#8E8EA8] underline">
          Back to dashboard
        </button>
      </main>
    </div>
  )
}
