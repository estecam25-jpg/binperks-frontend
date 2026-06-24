/**
 * GET /api/merchant/export?storeId?
 *
 * Downloads the merchant's member list as CSV.
 * Per spec: CSV export available in MVP for merchants.
 *
 * Columns: First Name, Last Name, Phone, Tier, Total Stamps,
 *           Subscription, Join Date, Last Visit Date
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getTier } from '@/lib/tiers'

function csvEscape(v: string | null | undefined): string {
  const s = String(v ?? '')
  return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: merchant } = await supabase
    .from('merchants').select('id, company_name').eq('auth_user_id', user.id).single()
  if (!merchant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const storeId = new URL(req.url).searchParams.get('storeId')

  let query = supabase
    .from('members')
    .select(`
      first_name, last_name, phone, email,
      total_stamps, subscription_status, created_at,
      visits ( date )
    `)
    .eq('merchant_id', merchant.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (storeId) query = query.eq('home_store_id', storeId)

  const { data: members, error } = await query
  if (error) return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })

  const header = 'First Name,Last Name,Phone,Tier,Total Stamps,Subscription,Joined,Last Visit\n'
  const rows = (members ?? []).map((m: {
    first_name: string; last_name: string; phone: string; email: string
    total_stamps: number; subscription_status: string; created_at: string
    visits?: { date: string }[]
  }) => {
    const tier = getTier(m.total_stamps)
    const visits = (m.visits ?? []).sort((a, b) => b.date.localeCompare(a.date))
    const lastVisit = visits[0]?.date ?? ''
    const joined = new Date(m.created_at).toLocaleDateString('en-US')
    const lastVisitFmt = lastVisit ? new Date(lastVisit).toLocaleDateString('en-US') : ''
    return [
      csvEscape(m.first_name), csvEscape(m.last_name),
      csvEscape(m.phone), tier.name,
      m.total_stamps, m.subscription_status === 'vip' ? 'VIP' : 'Free',
      joined, lastVisitFmt,
    ].join(',')
  }).join('\n')

  const slug = merchant.company_name.replace(/\s+/g, '_')
  const date = new Date().toISOString().split('T')[0]
  const filename = `BinPerks_Members_${slug}_${date}.csv`

  return new NextResponse(header + rows, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
