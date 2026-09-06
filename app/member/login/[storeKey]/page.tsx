/**
 * /member/login/[storeKey] — Member sign-in.
 *
 * ALWAYS BINPERKS BRANDED, like the join flow it sits next to. This page used
 * to fetch the store's brand_name and brand_color and paint its header with
 * them, so a member arriving from a store link signed in to what looked like
 * that store's product. They are signing in to BinPerks.
 *
 * NO STORE IS LOADED AT ALL ANY MORE. The query existed only to feed the
 * header, so it is gone rather than fetched and ignored — one fewer request,
 * and nothing left for a future edit to reach for.
 *
 * The storeKey is still read from the URL and handed to LoginForm, where it
 * routes the "Join BinPerks" links to /member/join/[storeKey] so a member who
 * turns out not to have an account still enrols against the right Origin Store.
 * That is its only remaining job.
 *
 * Interactive two-step flow (phone in, then the 8-digit code we text via GHL)
 * lives in the client LoginForm.
 */

import EntryBrand from '@/components/EntryBrand'
import LoginForm from './LoginForm'

export default async function MemberLoginPage({
  params,
}: {
  params: Promise<{ storeKey: string }>
}) {
  const { storeKey } = await params

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">

      {/* The standard BinPerks door — same mark as join, signup and the
          cashier and admin entry pages. */}
      <EntryBrand />

      <main className="flex-1 flex flex-col items-center px-4 py-10 gap-6 max-w-md mx-auto w-full">
        <LoginForm storeKey={storeKey} />
      </main>
    </div>
  )
}
