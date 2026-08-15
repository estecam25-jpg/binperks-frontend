/**
 * Layout for the five member tabs.
 *
 * Lives in a route group so the bottom nav wraps ONLY the tab screens. A
 * layout at app/member/ would also wrap /member/join, /member/login and
 * /member/feedback — none of which are places a signed-out visitor should see
 * member navigation. The group parentheses keep the URLs unchanged:
 * app/member/(tabs)/home → /member/home.
 *
 * Server component, so the auth gate runs before anything paints and a signed
 * out visitor never sees a flash of the app.
 */

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import BottomNavigation, { BOTTOM_NAV_HEIGHT_PX } from '@/components/member/BottomNavigation'

export const dynamic = 'force-dynamic'

export default async function MemberTabsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Home page, not /member/login — that route is a store picker, and sending a
  // signed-out visitor there makes them choose a store before they can even
  // type a phone number.
  if (!user) redirect('/')

  // Server client for identity, admin client for the read (CLAUDE.md RLS rule).
  const admin = createAdminSupabaseClient()
  const { data: member } = await admin
    .from('members')
    .select('id, is_blacklisted')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  // A session with no membership behind it, or a blacklisted one. Neither can
  // use the tabs; the front door explains the state.
  if (!member || member.is_blacklisted) redirect('/')

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">
      {/* Padded by the covered height so the fixed nav never hides content.
          The safe-area inset is added on top for notched phones, where the
          home indicator sits below the bar and pushes it further up. */}
      <div
        className="flex-1 flex flex-col"
        style={{ paddingBottom: `calc(${BOTTOM_NAV_HEIGHT_PX + 16}px + env(safe-area-inset-bottom))` }}
      >
        {children}
      </div>
      <BottomNavigation />
    </div>
  )
}
