import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">
      <div className="flex flex-col items-center px-5 pt-16 pb-12 gap-2" style={{ backgroundColor: '#4A4B98' }}>
        <h1 className="font-['Coiny'] text-5xl text-white tracking-wide">BinPerks</h1>
        <p className="text-white/70 text-[14px] font-semibold">Loyalty rewards for bin stores</p>
      </div>

      <div className="flex flex-col items-center px-5 py-12 gap-4 max-w-md mx-auto w-full">
        <Link href="/member/join/" className="w-full py-5 rounded-2xl font-bold text-[18px] text-white text-center font-['Montserrat'] tracking-wide shadow-lg bg-[#4A4B98]">
          For Members
        </Link>
        <Link href="/merchant/join/" className="w-full py-5 rounded-2xl font-bold text-[18px] text-center font-['Montserrat'] tracking-wide shadow-lg bg-white text-[#4A4B98] border-2 border-[#4A4B98]">
          For Merchants
        </Link>
      </div>

      <div className="mt-auto pb-6 text-center">
        <Link href="/admin" className="text-[10px] text-[#E0E0E0]">·</Link>
      </div>
    </div>
  )
}
