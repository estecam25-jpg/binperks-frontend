/**
 * DELETE /api/merchant/cashiers/[id]
 *
 * Deactivates a cashier (owner only). Never deletes the row — stamp_events
 * reference cashier_id for the audit trail, and member data rules apply the
 * same "never delete, only deactivate" principle to staff records.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: merchant } = await supabase
    .from('merchants')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!merchant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify the cashier belongs to this merchant, and is not the owner record
  const { data: cashier } = await supabase
    .from('staff_users')
    .select('id, role, merchant_id')
    .eq('id', id)
    .eq('merchant_id', merchant.id)
    .single()

  if (!cashier) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (cashier.role === 'owner') {
    return NextResponse.json({ error: 'Cannot remove the owner PIN' }, { status: 400 })
  }

  const { error } = await supabase
    .from('staff_users')
    .update({ is_active: false })
    .eq('id', id)
    .eq('merchant_id', merchant.id)

  if (error) {
    console.error('[/api/merchant/cashiers/[id] DELETE]', error)
    return NextResponse.json({ error: 'Failed to deactivate' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
