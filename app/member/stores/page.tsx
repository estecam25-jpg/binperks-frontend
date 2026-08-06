/**
 * /member/stores — Browse the BinPerks network.
 *
 * Split out of the member dashboard: browsing stores is a different errand
 * from checking your stamps, and inline it pushed everything below it off
 * the first screen.
 *
 * Server component, so the auth gate runs before anything renders — a signed
 * out visitor never sees a flash of the page. BinPerks colors only; the
 * stores listed here belong to many merchants, so no single store's brand
 * gets to own the chrome.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import StoreFinder from './StoreFinder'

export const dynamic = 'force-dynamic'

const BINPERKS_BLUE = '#4A4B98'

export default async function MemberStoresPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Not signed in → the home page, which is the single front door (phone
  // entry). Never /member/login, which is a store picker.
  if (!user) redirect('/')

  // Server client for identity, admin client for the read (CLAUDE.md).
  const admin = createAdminSupabaseClient()
  const { data: member } = await admin
    .from('members')
    .select('subscription_status, is_blacklisted')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  // Signed in but no membership behind the session, or blacklisted. Both are
  // states the dashboard already explains properly — sending them to / would
  // just invite another sign-in that lands right back here.
  if (!member || member.is_blacklisted) redirect('/member/dashboard')

  const isFree = member.subscription_status === 'free'

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">

      <div
        className="px-5 py-3 flex items-center gap-3"
        style={{ backgroundColor: BINPERKS_BLUE }}
      >
        <Link
          href="/member/dashboard"
          className="text-white/80 text-[20px] leading-none flex-shrink-0"
          aria-label="Back to dashboard"
        >
          ‹
        </Link>
        <span className="font-['Coiny'] text-xl leading-none text-white">
          Browse Stores
        </span>
      </div>

      <main className="flex-1 flex flex-col items-center px-4 py-6 gap-4 max-w-md mx-auto w-full">
        <div className="w-full px-1">
          <h1 className="font-['Coiny'] text-2xl text-[#1A1A2E]">Visit a Store</h1>
          <p className="text-[13px] text-[#8E8EA8] font-medium mt-0.5">
            See what&apos;s waiting for you.
          </p>
        </div>

        <StoreFinder isFree={isFree} />

        <Link
          href="/member/dashboard"
          className="w-full py-4 rounded-2xl font-semibold text-[14px] font-['Montserrat'] text-[#8E8EA8] border-2 border-[#EBEBF2] text-center active:border-[#1A1A2E] active:text-[#1A1A2E] transition-colors mt-1"
        >
          Back to dashboard
        </Link>

        <p className="text-[11px] text-[#8E8EA8] text-center font-medium">
          Questions? <a href="mailto:support@binperks.com" className="underline">support@binperks.com</a>
        </p>
      </main>
    </div>
  )
}
