import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { verifyAdmin } from '@/lib/admin-auth'
import { toOne } from '@/lib/supabase-relations'

/** Shape of the stores:home_store_id embed. Declared as object-or-array because
 *  toOne accepts either — see lib/supabase-relations. */
type StoreRelation =
  | { display_name?: string; canonical_key?: string }
  | { display_name?: string; canonical_key?: string }[]
  | null

export async function GET(req: NextRequest) {
  const adminEmail = await verifyAdmin()
  if (!adminEmail) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const search = new URL(req.url).searchParams.get('search')?.trim() ?? ''
  if (!search) return NextResponse.json({ members: [] })

  const admin = createAdminSupabaseClient()

  // Search by phone or email (partial match); join stores for display name
  const { data, error } = await admin
    .from('members')
    .select(`
      id, first_name, last_name, phone, email,
      subscription_status, total_stamps, is_blacklisted, created_at,
      stores:home_store_id ( display_name, canonical_key )
    `)
    .or(`phone.ilike.%${search}%,email.ilike.%${search}%`)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: 'query_failed' }, { status: 500 })

  // stores:home_store_id is a to-ONE embed, so supabase-js hands back an object,
  // not an array. This previously indexed [0] on it, which is always undefined —
  // every member in the admin Members tab displayed "No Store". See
  // lib/supabase-relations for why CORE RULE 9 does not apply to to-one embeds.
  const members = (data ?? []).map(m => ({
    ...m,
    storeName: toOne(m.stores as StoreRelation)?.display_name ?? 'No Store',
  }))

  return NextResponse.json({ members })
}

export async function PATCH(req: NextRequest) {
  const adminEmail = await verifyAdmin()
  if (!adminEmail) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { memberId, reason } = await req.json() as { memberId?: string; reason?: string }
  if (!memberId || !reason?.trim()) {
    return NextResponse.json({ error: 'memberId and reason are required' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()
  const { error } = await admin.from('members').update({
    is_blacklisted:   true,
    blacklist_reason: reason.trim(),
    blacklisted_at:   new Date().toISOString(),
  }).eq('id', memberId)

  if (error) return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
