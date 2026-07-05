/**
 * /member — Member entry point (store finder).
 *
 * Shows all active stores. Member selects their store to proceed to
 * /member/join/[storeKey] to sign up, or can navigate to sign in.
 *
 * Kept as a separate file from /member/join so it can be repurposed
 * as a combined join/login hub later.
 *
 * Server component — uses admin client to bypass RLS.
 */

import Link from 'next/link'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

interface Store {
  id: string
  canonical_key: string
  display_name: string
  brand_name: string
  brand_color: string
  city: string
  state: string
}

export default async function MemberPage() {
  const admin = createAdminSupabaseClient()

  const { data: stores } = await admin
    .from('stores')
    .select('id, canonical_key, display_name, brand_name, brand_color, city, state')
    .eq('is_active', true)
    .order('canonical_key', { ascending: true }) as { data: Store[] | null }

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">

      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-center" style={{ backgroundColor: '#4A4B98' }}>
        <span className="font-['Coiny'] text-2xl text-white tracking-wide">BinPerks</span>
      </div>

      <main className="flex-1 flex flex-col items-center px-4 py-8 gap-6 max-w-md mx-auto w-full">

        <div className="w-full text-center">
          <h1 className="font-['Coiny'] text-3xl text-[#1A1A2E] mb-1">Join a store</h1>
          <p className="text-[14px] text-[#8E8EA8] font-medium">
            Select your store to start earning rewards.
          </p>
        </div>

        {/* Already a member? — near the top, above the store list */}
        <p className="text-[13px] text-[#8E8EA8] text-center font-medium -mt-2">
          Already a member?{' '}
          <Link href="/member/login" className="underline text-[#4A4B98] font-semibold">
            Sign in instead
          </Link>
        </p>

        {!stores || stores.length === 0 ? (
          <div className="w-full bg-white rounded-2xl px-5 py-6 text-center shadow-sm">
            <p className="text-[14px] text-[#8E8EA8] font-medium">No active stores found.</p>
          </div>
        ) : (
          <div className="w-full flex flex-col gap-2.5">
            {stores.map(store => (
              <Link
                key={store.id}
                href={`/member/join/${store.canonical_key}`}
                className="w-full flex items-center gap-4 bg-white rounded-2xl px-5 py-4 shadow-sm active:scale-[0.98] transition-transform"
              >
                {/* Brand color accent bar */}
                <div
                  className="w-1.5 h-12 rounded-full flex-shrink-0"
                  style={{ backgroundColor: store.brand_color ?? '#4A4B98' }}
                />
                <div className="flex-1 min-w-0">
                  {/* Canonical key — small/light, top */}
                  <p className="text-[10px] font-medium text-[#B0B0C8] tracking-wide truncate">
                    {store.canonical_key}
                  </p>
                  {/* Display name — bold, primary */}
                  <p className="text-[15px] font-bold text-[#1A1A2E] truncate leading-tight">
                    {store.brand_name}
                  </p>
                  {/* City, State — subtitle */}
                  {(store.city || store.state) && (
                    <p className="text-[12px] text-[#8E8EA8] font-medium">
                      {[store.city, store.state].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
                <span className="text-[20px] text-[#D1D1DC] flex-shrink-0">›</span>
              </Link>
            ))}
          </div>
        )}

        <p className="text-[11px] text-[#8E8EA8] text-center font-medium mt-4">
          Questions? <a href="mailto:support@binperks.com" className="underline">support@binperks.com</a>
        </p>
      </main>
    </div>
  )
}
