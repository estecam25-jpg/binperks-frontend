/**
 * GET /api/merchant/connect/status
 *
 * Reports the signed-in merchant's Stripe Connect state so the Settlement tab
 * can show the right prompt.
 *
 * Read live from Stripe rather than cached locally. Onboarding completes on
 * Stripe's hosted pages and requirements can change afterwards — a merchant
 * whose verification lapses goes from payouts_enabled true to false without
 * anything happening in this app, so a stored copy would go stale silently and
 * we would show "connected" for an account that can no longer be paid.
 *
 * Responses:
 *   200 { connected: false }
 *   200 { connected: true, chargesEnabled, payoutsEnabled, detailsSubmitted,
 *         requiresAction, bankLast4, currentlyDue }
 *   401 { error: 'Unauthorized' }
 *   404 { error: 'Merchant not found' }
 */

import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' })

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminSupabaseClient()

  const { data: merchant } = await admin
    .from('merchants')
    .select('id, stripe_connect_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!merchant) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 })

  if (!merchant.stripe_connect_id) {
    return NextResponse.json({ connected: false })
  }

  try {
    const account = await stripe.accounts.retrieve(merchant.stripe_connect_id)

    // Express accounts return their payout destination under external_accounts.
    // Absent until the merchant adds a bank, so this is best-effort display only.
    const external = account.external_accounts?.data?.[0]
    const bankLast4 =
      external && 'last4' in external && typeof external.last4 === 'string'
        ? external.last4
        : null

    return NextResponse.json({
      connected:        true,
      chargesEnabled:   account.charges_enabled,
      payoutsEnabled:   account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      // Either condition means the merchant still has something to do before a
      // transfer can land. payouts_enabled is the one that actually gates
      // money, so it is checked separately from details_submitted.
      requiresAction:   !account.details_submitted || !account.payouts_enabled,
      bankLast4,
      // Surfaced so an admin reading a support ticket can see WHAT Stripe is
      // waiting on, rather than just "incomplete".
      currentlyDue:     account.requirements?.currently_due ?? [],
    })
  } catch (err) {
    // A deleted or rejected account 404s at Stripe. Reporting not-connected
    // lets the merchant start again rather than stranding them on an error.
    console.error('[merchant/connect/status] Stripe error:', err)
    return NextResponse.json({ connected: false, error: 'lookup_failed' })
  }
}
