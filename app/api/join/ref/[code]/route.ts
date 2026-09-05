/**
 * GET /api/join/ref/[code]
 *
 * Resolves a referrer to their first name and member ID, for the "You were
 * invited by Sarah!" banner in the join funnel.
 *
 * ACCEPTS EITHER SHAPE:
 *   a legacy 8-character referral_code, from /member/join/[storeKey]?ref=…
 *   a member UUID, from the short-link funnel /member/join/[storeKey]?referrer=…
 *
 * One route for both so the layout does not have to know which kind of link
 * the visitor arrived on.
 *
 * ADMIN CLIENT, NOT THE SESSION CLIENT. This runs during signup, when there is
 * no member session at all, so the previous server client was subject to RLS on
 * members and could only ever return not_found — the referral banner never
 * appeared. Public routes read through the admin client (CLAUDE.md CRITICAL RLS
 * RULE).
 *
 * Only non-identifying fields are returned: a first name and the id the signup
 * form already needs to post back. No phone, email, or surname.
 *
 * Returns:
 *   200 { referrerMemberId, referrerFirstName }
 *   404 { error: 'not_found' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const value = (code ?? '').trim()
  if (!value) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const admin = createAdminSupabaseClient()

  const query = admin
    .from('members')
    .select('id, first_name')
    .eq('status', 'active')
    .eq('is_blacklisted', false)

  const { data } = UUID_RE.test(value)
    ? await query.eq('id', value).maybeSingle()
    : await query.eq('referral_code', value).maybeSingle()

  if (!data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  return NextResponse.json({
    referrerMemberId:  data.id,
    referrerFirstName: data.first_name,
  })
}
