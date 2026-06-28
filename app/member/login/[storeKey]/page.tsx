/**
 * /member/login/[storeKey] — Member sign-in with store branding.
 *
 * Server component: fetches store branding from Supabase at request time,
 * renders the branded header server-side (zero flash), then hands off to
 * the client LoginForm for the interactive phone + magic-link flow.
 */

import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { headerTextColor } from '@/lib/branding'
import LoginForm from './LoginForm'

const FALLBACK = { brandColor: '#4A4B98', brandName: 'BinPerks' }

export default async function MemberLoginPage({
  params,
}: {
  params: Promise<{ storeKey: string }>
}) {
  const { storeKey } = await params

  // Fetch store branding server-side — no client-side flash
  const admin = createAdminSupabaseClient()
  const { data: store } = await admin
    .from('stores')
    .select('brand_name, brand_color')
    .eq('canonical_key', storeKey)
    .eq('is_active', true)
    .maybeSingle()

  const brandColor = store?.brand_color ?? FALLBACK.brandColor
  const brandName  = store?.brand_name  ?? FALLBACK.brandName
  const textColor  = headerTextColor(brandColor)
  const subColor   = textColor === '#FFFFFF' ? 'rgba(255,255,255,0.5)' : 'rgba(26,26,46,0.45)'

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">

      {/* Store-branded header — rendered server-side, always the right color */}
      <div
        className="px-5 py-3 flex items-center gap-2.5"
        style={{ backgroundColor: brandColor }}
      >
        <span
          className="font-['Coiny'] text-xl leading-none"
          style={{ color: textColor }}
        >
          {brandName}
        </span>
        <span
          className="text-[10px] font-semibold tracking-widest uppercase ml-auto"
          style={{ color: subColor }}
        >
          Powered by BinPerks
        </span>
      </div>

      <main className="flex-1 flex flex-col items-center px-4 py-10 gap-6 max-w-md mx-auto w-full">
        {/* Client component handles phone input + magic-link submission */}
        <LoginForm brandColor={brandColor} storeKey={storeKey} />
      </main>
    </div>
  )
}
