/**
 * / — BinPerks home page.
 *
 * 4 entry points for members and merchants.
 * No auth redirect — each destination handles its own auth.
 */

import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">

      {/* Hero header */}
      <div
        className="px-5 pt-12 pb-10 flex flex-col items-center text-center gap-3"
        style={{ backgroundColor: '#4A4B98' }}
      >
        <span className="font-['Coiny'] text-5xl text-white tracking-wide leading-none">BinPerks</span>
        <p className="text-white/70 text-[14px] font-semibold font-['Montserrat']">
          Loyalty rewards for bin stores
        </p>
      </div>

      <main className="flex-1 flex flex-col items-center px-4 py-8 gap-4 max-w-md mx-auto w-full">

        {/* Member section */}
        <p className="text-[11px] font-bold tracking-[0.09em] uppercase text-[#8E8EA8] self-start px-1">
          Members
        </p>

        <Link
          href="/member/join"
          className="w-full flex items-center gap-4 bg-white rounded-2xl px-5 py-5 shadow-sm active:scale-[0.98] transition-transform"
        >
          <div className="w-12 h-12 rounded-2xl bg-[#4A4B98]/10 flex items-center justify-center text-2xl flex-shrink-0">
            🏷️
          </div>
          <div className="flex-1">
            <p className="text-[16px] font-bold text-[#1A1A2E] font-['Montserrat']">Join a store</p>
            <p className="text-[12px] text-[#8E8EA8] font-medium mt-0.5">
              Sign up and start earning stamp rewards
            </p>
          </div>
          <span className="text-[20px] text-[#D1D1DC] flex-shrink-0">›</span>
        </Link>

        <Link
          href="/member/login"
          className="w-full flex items-center gap-4 bg-white rounded-2xl px-5 py-5 shadow-sm active:scale-[0.98] transition-transform"
        >
          <div className="w-12 h-12 rounded-2xl bg-[#FFB217]/15 flex items-center justify-center text-2xl flex-shrink-0">
            👋
          </div>
          <div className="flex-1">
            <p className="text-[16px] font-bold text-[#1A1A2E] font-['Montserrat']">Member sign in</p>
            <p className="text-[12px] text-[#8E8EA8] font-medium mt-0.5">
              Access your rewards dashboard
            </p>
          </div>
          <span className="text-[20px] text-[#D1D1DC] flex-shrink-0">›</span>
        </Link>

        {/* Merchant section */}
        <p className="text-[11px] font-bold tracking-[0.09em] uppercase text-[#8E8EA8] self-start px-1 mt-2">
          Merchants
        </p>

        <Link
          href="/merchant/signup"
          className="w-full flex items-center gap-4 bg-white rounded-2xl px-5 py-5 shadow-sm active:scale-[0.98] transition-transform"
        >
          <div className="w-12 h-12 rounded-2xl bg-[#DA1212]/10 flex items-center justify-center text-2xl flex-shrink-0">
            🏬
          </div>
          <div className="flex-1">
            <p className="text-[16px] font-bold text-[#1A1A2E] font-['Montserrat']">Apply as merchant</p>
            <p className="text-[12px] text-[#8E8EA8] font-medium mt-0.5">
              Add BinPerks loyalty to your store
            </p>
          </div>
          <span className="text-[20px] text-[#D1D1DC] flex-shrink-0">›</span>
        </Link>

        <Link
          href="/merchant/login"
          className="w-full flex items-center gap-4 bg-white rounded-2xl px-5 py-5 shadow-sm active:scale-[0.98] transition-transform"
        >
          <div className="w-12 h-12 rounded-2xl bg-[#4A4B98]/10 flex items-center justify-center text-2xl flex-shrink-0">
            🔑
          </div>
          <div className="flex-1">
            <p className="text-[16px] font-bold text-[#1A1A2E] font-['Montserrat']">Merchant sign in</p>
            <p className="text-[12px] text-[#8E8EA8] font-medium mt-0.5">
              View your dashboard and reports
            </p>
          </div>
          <span className="text-[20px] text-[#D1D1DC] flex-shrink-0">›</span>
        </Link>

        <p className="text-[11px] text-[#8E8EA8] text-center font-medium mt-4">
          Questions? <a href="mailto:support@binperks.com" className="underline">support@binperks.com</a>
        </p>

        {/* Hidden admin link — inconspicuous, for internal use only */}
        <Link
          href="/admin"
          className="text-[10px] text-[#EBEBF2] font-medium mt-2 self-center"
          aria-hidden="true"
        >
          ·
        </Link>
      </main>
    </div>
  )
}
