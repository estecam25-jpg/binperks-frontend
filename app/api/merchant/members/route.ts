/**
 * GET /api/merchant/members
 *
 * Returns the merchant's member list.
 *
 * Query params:
 *   storeId?  — scope to one location's home members; all if omitted
 *   search?   — name or phone substring filter
 *   page?     — 1-based, default 1
 *   limit?    — default 50, max 100
 *
 * Response:
 * {
 *   members: [{
 *     id, firstName, lastName, phone, tier, totalStamps,
 *     subscriptionStatus, lastVisitDate, lastVisitStore, joinedAt
 *   }],
 *   total: number,
 *   page: number,
 *   pages: number
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getTier } from '@/lib/tiers'

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: merchant } = await supabase
    .from('merchants')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!merchant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const url = new URL(req.url)
  const storeId = url.searchParams.get('storeId')
  const search  = url.searchParams.get('search')?.trim() ?? ''
  const page    = Math.max(1, Number(url.searchParams.get('page') ?? 1))
  const limit   = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 50)))
  const offset  = (page - 1) * limit

  let query = supabase
    .from('members')
    .select(`
      id,
      first_name,
      last_name,
      phone,
      total_stamps,
      subscription_status,
      created_at,
      home_store_id,
      visits (
        date,
        store_id,
        stores ( display_name )
      )
    `, { count: 'exact' })
    .eq('merchant_id', merchant.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (storeId) {
    query = query.eq('home_store_id', storeId)
  }

  if (search) {
    // Search by name or last 4 digits of phone
    query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%`
    )
  }

  const { data: members, count, error } = await query

  if (error) {
    console.error('[/api/merchant/members]', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }

  const result = (members ?? []).map((m: {
    id: string
    first_name: string
    last_name: string
    phone: string
    total_stamps: number
    subscription_status: string
    created_at: string
    home_store_id: string
    visits: {
      date: string
      store_id: string
      stores: { display_name: string }[]
    }[]
  }) => {
    const tier = getTier(m.total_stamps)
    // Get most recent visit
    const sortedVisits = (m.visits ?? []).sort(
      (a, b) => b.date.localeCompare(a.date)
    )
    const lastVisit = sortedVisits[0]

    return {
      id:                 m.id,
      firstName:          m.first_name,
      lastName:           m.last_name,
      phone:              m.phone,
      tier:               tier.name,
      totalStamps:        m.total_stamps,
      subscriptionStatus: m.subscription_status,
      joinedAt:           m.created_at,
      lastVisitDate:      lastVisit?.date ?? null,
      lastVisitStore:     lastVisit?.stores[0]?.display_name ?? null,
    }
  })

  const total = count ?? 0
  return NextResponse.json({
    members: result,
    total,
    page,
    pages: Math.ceil(total / limit),
  })
}
