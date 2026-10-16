/**
 * /merchant/finish-setup/[token]
 *
 * The link Esteban opens on his phone, standing in the store. Everything the
 * owner has to do themselves — pay, then sign — starts here.
 *
 * Server component: the token is resolved before anything renders, so a spent
 * or mistyped link says so plainly instead of showing a Pay button that cannot
 * work. The page reveals only what is already on the poster in the owner's own
 * shop — their store name and their own details — and nothing at all for a
 * token that does not resolve.
 *
 * WHAT HAPPENS AFTER THE BUTTON is not this page's business. Stripe returns to
 * the ordinary thank-you page, which opens the DocuSeal session and forwards
 * to the ordinary signing page. This page exists only to replace the signup
 * form the owner never filled in.
 */

import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { PRESETUP, isPresetupToken } from '@/lib/presetup'
import FinishSetupStart from './finish-setup-start'

export const dynamic = 'force-dynamic'

export default async function FinishSetupPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const valid = isPresetupToken(token)

  let state: 'invalid' | 'ready' | 'started' = 'invalid'
  let companyName = ''
  let storeName = ''
  let ownerName = ''
  let locationCount = 1

  if (valid) {
    const admin = createAdminSupabaseClient()
    const { data: merchant } = await admin
      .from('merchants')
      .select('id, billing_status, company_name, owner_name, location_count')
      .eq('presetup_token', token)
      .maybeSingle()

    if (merchant) {
      // The token is cleared the moment a checkout is adopted, so finding a
      // merchant at all almost always means 'presetup'. The check stays
      // because "almost always" is not a guarantee worth billing someone on.
      state = merchant.billing_status === PRESETUP ? 'ready' : 'started'
      companyName   = (merchant.company_name as string) ?? ''
      ownerName     = (merchant.owner_name as string) ?? ''
      locationCount = Math.max(1, Number(merchant.location_count) || 1)

      const { data: store } = await admin
        .from('stores').select('display_name').eq('merchant_id', merchant.id)
        .order('created_at', { ascending: true }).limit(1).maybeSingle()
      storeName = (store?.display_name as string) ?? ''
    }
  }

  return (
    <FinishSetupStart
      state={state}
      token={valid ? token : null}
      companyName={companyName}
      storeName={storeName}
      ownerName={ownerName}
      locationCount={locationCount}
    />
  )
}
