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

  const admin = createAdminSupabaseClient()

  // An empty search used to short-circuit to an empty array, so the Members
  // tab looked broken until something was typed. It now lists the most recent
  // members and narrows as you search.
  let query = admin
    .from('members')
    .select(`
      id, first_name, last_name, phone, email,
      subscription_status, total_stamps, is_blacklisted, created_at,
      stores:home_store_id ( display_name, canonical_key )
    `)
    .order('created_at', { ascending: false })
    .limit(20)

  if (search) {
    // Escape PostgREST's or() delimiters — a comma or paren typed into the box
    // would otherwise be parsed as filter syntax.
    const safe = search.replace(/[,()]/g, ' ')
    query = query.or(
      `phone.ilike.%${safe}%,email.ilike.%${safe}%,` +
      `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%`
    )
  }

  const { data, error } = await query

  if (error) {
    console.error('[admin/members] query failed:', error)
    return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  }

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
