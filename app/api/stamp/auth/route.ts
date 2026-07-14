/**
 * POST /api/stamp/auth
 *
 * Server-side cashier PIN verification. Called by the stamp login page
 * instead of querying staff_users directly from the browser (which would
 * require anon access and doesn't work with bcrypt-hashed PINs).
 *
 * Request body: { pin: string, storeId: string }
 * Response:
 *   200 { id, name, role, merchantId }  — PIN matched
 *   401 { error: 'invalid_pin' }        — no match
 *   400 { error: string }               — missing fields
 */

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const { pin, storeId } = await req.json()

  if (!pin || !storeId) {
    return NextResponse.json({ error: 'pin and storeId are required' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()

  // Fetch all active cashiers for this store so we can bcrypt.compare each.
  // A store will have at most a handful of cashiers so this is fast.
  const { data: cashiers, error } = await admin
    .from('staff_users')
    .select('id, name, role, merchant_id, store_id, pin')
    .eq('store_id', storeId)
    .eq('is_active', true)

  if (error || !cashiers) {
    return NextResponse.json({ error: 'invalid_pin' }, { status: 401 })
  }

  // Find the cashier whose stored PIN matches the entered PIN.
  // Supports both bcrypt hashes (new) and legacy plaintext PINs (transition period).
  for (const cashier of cashiers) {
    const storedPin: string = cashier.pin ?? ''
    const isHash = storedPin.startsWith('$2')
    const match = isHash
      ? await bcrypt.compare(pin, storedPin)
      : storedPin === pin  // legacy plaintext fallback during transition

    if (match) {
      return NextResponse.json({
        id:         cashier.id,
        name:       cashier.name,
        role:       cashier.role,
        merchantId: cashier.merchant_id,
      })
    }
  }

  return NextResponse.json({ error: 'invalid_pin' }, { status: 401 })
}
