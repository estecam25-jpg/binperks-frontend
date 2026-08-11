/**
 * Resolving the signed-in merchant.
 *
 * Every /api/merchant/* route used to do this inline:
 *
 *   .from('merchants').eq('auth_user_id', user.id).single()
 *
 * which breaks the moment merchants.auth_user_id stops matching the auth user
 * that actually signs in — and it does. Merchant sign-in mints its token with
 * generateLink, which CREATES an auth user when none exists for that address.
 * So if the stored auth_user_id is stale, or points at a user that was deleted
 * and later recreated, the lookup finds nothing and the route returns 404.
 *
 * Nothing surfaces that as an error: the dashboard tabs read a 404 as "no
 * data" and render their empty state, so the merchant sees a fully populated
 * account as a blank dashboard on every tab at once.
 *
 * WinBin was in exactly this state — auth_user_id 66bebed7… does not exist in
 * auth.users at all.
 *
 * This resolves by id first, falls back to owner_email, and repairs the stored
 * id when the fallback hits, so the same merchant costs one extra query once
 * and none afterwards.
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

/**
 * The signed-in merchant, or null when there is no session or no merchant
 * record for it.
 *
 * @param columns Postgrest column list. MUST include `id` — the self-heal
 *                below needs it to target the row. Defaults to just 'id',
 *                which is all a route needs to scope its queries.
 */
export async function findMerchantForRequest<T = { id: string }>(
  columns = 'id',
): Promise<T | null> {
  const server = await createServerSupabaseClient()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return null

  // Identity comes from the session; every read below uses the admin client
  // (CLAUDE.md CRITICAL RLS RULE).
  const admin = createAdminSupabaseClient()

  // maybeSingle, not single: a miss here is an ordinary case that falls through
  // to the email lookup, not an error.
  const { data: byId } = await admin
    .from('merchants')
    .select(columns)
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (byId) return byId as unknown as T

  const email = user.email?.toLowerCase().trim()
  if (!email) return null

  // owner_email is stored as entered, so match case-insensitively — the same
  // reason merchant sign-in normalises the address before keying Redis.
  const { data: byEmail } = await admin
    .from('merchants')
    .select(columns)
    .ilike('owner_email', email)
    .maybeSingle()

  if (!byEmail) return null

  // Self-heal so the next request takes the fast path. Failure is not fatal —
  // the caller already has the merchant it needs.
  const merchantId = (byEmail as unknown as { id?: string }).id
  if (!merchantId) return byEmail as unknown as T
  const { error } = await admin
    .from('merchants')
    .update({ auth_user_id: user.id })
    .eq('id', merchantId)

  if (error) {
    console.error('[merchant-auth] could not repair auth_user_id:', error)
  } else {
    console.log(
      `[merchant-auth] repaired stale auth_user_id for merchant=${merchantId} ` +
      `-> ${user.id} (matched on owner_email)`
    )
  }

  return byEmail as unknown as T
}
