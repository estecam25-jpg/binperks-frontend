/**
 * /member/stores — the Stores tab.
 *
 * The tab layout already gates auth, so this only needs the member's
 * subscription status, which decides whether VIP perks render greyed.
 *
 * Every physical location is its own card. Locations are never grouped under a
 * merchant brand — a member visits a location, not a company.
 */

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import AppHeader from '@/components/member/AppHeader'
import StoreFinder from './StoreFinder'

export const dynamic = 'force-dynamic'

export default async function MemberStoresPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const admin = createAdminSupabaseClient()
  const { data: member } = await admin
    .from('members')
    .select('subscription_status')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const isFree = member?.subscription_status === 'free'

  return (
    <>
      <AppHeader />

      <main className="flex-1 flex flex-col items-center px-4 py-5 gap-4 max-w-md mx-auto w-full">
        <div className="w-full px-1">
          <h1 className="font-['Coiny'] text-[26px] text-[#1A1A2E] leading-tight">Stores</h1>
          <p className="text-[13px] text-[#8E8EA8] font-medium mt-0.5">
            Your stamps and rewards work at every location.
          </p>
        </div>

        <StoreFinder isFree={isFree} />
      </main>
    </>
  )
}
