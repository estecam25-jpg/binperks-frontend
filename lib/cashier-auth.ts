/**
 * Cashier verification for the stamp tool's server routes.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * A cashier has no Supabase session. The PIN lives in the tablet's session
 * storage and is sent with every request that matters, exactly as
 * /api/stamp does — so to Postgres a cashier is indistinguishable from a
 * stranger, and the ONLY thing standing between the tablet and member data is
 * this check. Which is why it is one function rather than three copies.
 *
 * The store is taken from the cashier's own row, never from the request. A
 * tablet that sends someone else's storeId gets its own store's answer.
 *
 * Returns null for every failure — unknown cashier, deactivated cashier, wrong
 * PIN — so a caller cannot accidentally tell the difference and turn this into
 * a probe for valid cashier ids.
 */

import bcrypt from 'bcryptjs'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

export interface VerifiedCashier {
  id:         string
  name:       string | null
  role:       string | null
  merchantId: string
  /** The cashier's own store. Authoritative; the request's is ignored. */
  storeId:    string
}

export async function verifyCashier(
  cashierId: unknown,
  pin: unknown,
): Promise<VerifiedCashier | null> {
  if (typeof cashierId !== 'string' || !cashierId) return null
  if (typeof pin !== 'string' || !pin) return null

  const admin = createAdminSupabaseClient()

  const { data: cashier } = await admin
    .from('staff_users')
    .select('id, name, role, merchant_id, store_id, pin')
    .eq('id', cashierId)
    .eq('is_active', true)
    .maybeSingle()

  if (!cashier) return null

  // '$2' is the bcrypt prefix — every hash starts $2a$, $2b$ or $2y$. The
  // plaintext branch is a transition fallback; every live PIN is hashed.
  const stored: string = (cashier.pin as string) ?? ''
  const ok = stored.startsWith('$2')
    ? await bcrypt.compare(pin, stored)
    : stored === pin

  if (!ok) return null

  return {
    id:         cashier.id as string,
    name:       (cashier.name as string) ?? null,
    role:       (cashier.role as string) ?? null,
    merchantId: cashier.merchant_id as string,
    storeId:    cashier.store_id as string,
  }
}
