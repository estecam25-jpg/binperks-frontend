/**
 * GET /api/merchant/settlement
 *
 * Returns the signed-in merchant's settlement statements, newest period first.
 * Auth: Supabase merchant session cookie.
 *
 * Read-only. Merchants cannot create, edit, or approve settlements — batches are
 * calculated and approved by BinPerks admin in God Mode before any Stripe Connect
 * transfer is initiated (CLAUDE.md rule 20).
 *
 * Statements only exist after a monthly settlement batch has been calculated and
 * approved, so an empty array is the normal state before the first cycle closes.
 *
 * Response:
 *   200 { statements: [{ id, settlementPeriod, netDistribution, grossDistribution,
 *                        statementStatus, transferStatus, transferInitiatedAt,
 *                        transferCompletedAt }] }
 *   401 { error: 'Unauthorized' }
 *   404 { error: 'Merchant not found' }
 */

import { NextResponse } from 'next/server'
import { findMerchantForRequest } from '@/lib/merchant-auth'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

export async function GET() {
  // See lib/merchant-auth — resilient to a stale merchants.auth_user_id.
  const merchant = await findMerchantForRequest()
  if (!merchant) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 })

  // Admin client for all table reads (RLS would block these otherwise — see
  // CLAUDE.md CRITICAL RLS RULE).
  const admin = createAdminSupabaseClient()

  // Scoped to this merchant's own id — a merchant never sees another's statements.
  const { data: statements, error } = await admin
    .from('merchant_settlement_statements')
    .select(`
      id, settlement_period, gross_distribution, net_distribution,
      statement_status, stripe_transfer_status,
      transfer_initiated_at, transfer_completed_at
    `)
    .eq('merchant_id', merchant.id)
    .order('settlement_period', { ascending: false })

  if (error) {
    console.error('[/api/merchant/settlement] query error:', error)
    return NextResponse.json({ error: 'Failed to load settlements' }, { status: 500 })
  }

  return NextResponse.json({
    statements: (statements ?? []).map(s => ({
      id:                  s.id,
      settlementPeriod:    s.settlement_period,
      grossDistribution:   s.gross_distribution,
      netDistribution:     s.net_distribution,
      statementStatus:     s.statement_status,
      transferStatus:      s.stripe_transfer_status,
      transferInitiatedAt: s.transfer_initiated_at,
      transferCompletedAt: s.transfer_completed_at,
    })),
  })
}
