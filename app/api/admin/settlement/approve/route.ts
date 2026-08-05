/**
 * POST /api/admin/settlement/approve
 *
 * Approves a calculated settlement batch. Admin-only.
 *
 * Approval is a bookkeeping gate, not a payment. NO Stripe Connect transfer is
 * initiated here — transfers are a later, separate step pending attorney
 * confirmation of the payout model (CLAUDE.md rule 20 and LEGAL STATUS).
 *
 * Body: { batchId, notes? }
 *
 * Responses:
 *   200 { batch }
 *   400 { error: 'missing_batch_id' }
 *   401 { error: 'forbidden' }
 *   404 { error: 'batch_not_found' }
 *   409 { error: 'invalid_status', status }
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin-auth'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

// Only a batch still awaiting sign-off may be approved. Re-approving an
// already-approved batch is rejected so approved_by/approved_at stay truthful.
const APPROVABLE_STATUSES = ['calculated', 'pending_approval']

export async function POST(req: NextRequest) {
  const adminEmail = await verifyAdmin()
  if (!adminEmail) return NextResponse.json({ error: 'forbidden' }, { status: 401 })

  const { batchId, notes } = await req.json() as { batchId?: string; notes?: string }
  if (!batchId) return NextResponse.json({ error: 'missing_batch_id' }, { status: 400 })

  const admin = createAdminSupabaseClient()

  const { data: batch } = await admin
    .from('settlement_batches')
    .select('id, status, settlement_period')
    .eq('id', batchId)
    .maybeSingle()

  if (!batch) return NextResponse.json({ error: 'batch_not_found' }, { status: 404 })

  if (!APPROVABLE_STATUSES.includes(batch.status)) {
    return NextResponse.json({ error: 'invalid_status', status: batch.status }, { status: 409 })
  }

  const approvedAt = new Date().toISOString()

  // Status is re-checked in the WHERE clause so two admins clicking Approve at
  // the same moment cannot both write an approval.
  const { data: updated, error } = await admin
    .from('settlement_batches')
    .update({
      status:         'approved',
      approved_by:    adminEmail,
      approved_at:    approvedAt,
      approval_notes: notes?.trim() || null,
      updated_at:     approvedAt,
    })
    .eq('id', batchId)
    .in('status', APPROVABLE_STATUSES)
    .select('*')
    .single()

  if (error || !updated) {
    console.error('[settlement/approve] update failed:', error)
    return NextResponse.json({ error: 'approve_failed' }, { status: 500 })
  }

  // Merchant statements move to 'approved' alongside the batch so the merchant
  // Settlement tab reflects the decision. Still no transfer at this point.
  await admin
    .from('merchant_settlement_statements')
    .update({ statement_status: 'approved' })
    .eq('settlement_batch_id', batchId)
    .eq('statement_status', 'draft')

  console.log(`[settlement/approve] batch=${batchId} period=${batch.settlement_period} by=${adminEmail}`)

  return NextResponse.json({ batch: updated })
}
