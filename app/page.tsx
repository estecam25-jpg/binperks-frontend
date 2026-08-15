/**
 * app.binperks.com — the front door.
 *
 * V3: one combined member sign-in / join flow instead of the old
 * "For Members" / "For Merchants" split. The phone number decides the branch,
 * so a member never has to know whether they're signing in or joining.
 *
 * Merchants are deliberately not offered here — /merchant/login only. The
 * admin entrance stays the inconspicuous dot at the bottom.
 */

import Link from 'next/link'
import HomeAuth from './HomeAuth'

export default function HomePage() {
  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">

      <div
        className="flex flex-col items-center px-5 pt-14 pb-20 gap-2"
        style={{ backgroundColor: '#4A4B98' }}
      >
        {/* Same asset and sizing as AppHeader. Width is left to the intrinsic
            aspect ratio — never set both, or the wordmark stretches. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/BinPerks_Landscape_Logo.png" alt="BinPerks" className="h-8 w-auto" />
        <p className="text-white/70 text-[14px] font-semibold">
          Your rewards, everywhere you shop
        </p>
      </div>

      <main className="flex-1 flex flex-col items-center px-4 -mt-12 pb-10 w-full">
        <div className="w-full max-w-sm">
          <HomeAuth />
        </div>

        <p className="text-[11px] text-[#8E8EA8] text-center font-medium mt-6 max-w-sm">
          Questions?{' '}
          <a href="mailto:support@binperks.com" className="underline">support@binperks.com</a>
        </p>
      </main>

      <div className="pb-6 text-center">
        <Link href="/admin/login" className="text-[10px] text-[#E0E0E0]">·</Link>
      </div>
    </div>
  )
}
