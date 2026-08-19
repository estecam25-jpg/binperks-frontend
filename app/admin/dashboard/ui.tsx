'use client'

/**
 * Shared God Mode primitives.
 *
 * These were defined inside AdminDashboard.tsx. They moved here when the
 * Analytics tab — which is its own component file, like AnnouncementsTab and
 * ContentTab — needed the same stat card: importing them back out of
 * AdminDashboard would have made the two files import each other.
 */

export function StatCard({ label, value, sub, accent }: {
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

export function Spinner() {
  return <div className="flex justify-center py-12"><span className="w-8 h-8 border-[3px] border-[#EBEBF2] border-t-[#4A4B98] rounded-full animate-spin" /></div>
}
