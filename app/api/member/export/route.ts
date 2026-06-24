/**
 * GET /api/member/export
 *
 * Downloads the logged-in member's OWN data as CSV — visits and rewards
 * history. Distinct from the merchant-facing member-list export at
 * /api/merchant/export (which is the merchant downloading their whole
 * customer list). Auth: Supabase session cookie.
 */

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

function csvEscape(v: string | number | null | undefined): string {
  const s = String(v ?? '')
  return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET() {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const { data: member } = await supabase
    .from('members')
    .select('id, first_name, last_name, total_stamps, subscription_status, created_at')
    .eq('auth_user_id', user.id)
    .single()

  if (!member) {
    return NextResponse.json({ error: 'member_not_found' }, { status: 404 })
  }

  const [{ data: visits }, { data: rewards }] = await Promise.all([
    supabase
      .from('visits')
      .select('date, awarded_at, source')
      .eq('member_id', member.id)
      .order('date', { ascending: false }),
    supabase
      .from('rewards')
      .select('coupon_value, reward_type, status, earned_at, redeemed_at')
      .eq('member_id', member.id)
      .order('earned_at', { ascending: false }),
  ])

  const lines: string[] = []
  lines.push('BinPerks data export')
  lines.push(`Member,${csvEscape(member.first_name + ' ' + member.last_name)}`)
  lines.push(`Total lifetime stamps,${member.total_stamps}`)
  lines.push(`Membership,${member.subscription_status === 'vip' ? 'VIP' : 'Free'}`)
  lines.push(`Member since,${new Date(member.created_at).toLocaleDateString('en-US')}`)
  lines.push('')
  lines.push('Visits')
  lines.push('Date,Awarded At,Source')
  for (const v of visits ?? []) {
    lines.push([csvEscape(v.date), csvEscape(v.awarded_at), csvEscape(v.source)].join(','))
  }
  lines.push('')
  lines.push('Coupons')
  lines.push('Value,Type,Status,Earned At,Redeemed At')
  for (const r of rewards ?? []) {
    lines.push([
      csvEscape(r.coupon_value), csvEscape(r.reward_type), csvEscape(r.status),
      csvEscape(r.earned_at), csvEscape(r.redeemed_at),
    ].join(','))
  }

  const date = new Date().toISOString().split('T')[0]
  const filename = `BinPerks_MyData_${date}.csv`

  return new NextResponse(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
