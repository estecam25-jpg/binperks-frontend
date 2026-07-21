import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

const ADMIN_EMAIL = 'enina@estecam.com'

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.email === ADMIN_EMAIL ? user : null
}

export async function GET(req: NextRequest) {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const search = new URL(req.url).searchParams.get('search')?.trim() ?? ''
  if (!search) return NextResponse.json({ members: [] })

  const admin = createAdminSupabaseClient()

  // Search by phone or email (partial match)
  const { data, error } = await admin
    .from('members')
    .select(`
      id, first_name, last_name, phone, email,
      subscription_status, total_stamps, is_blacklisted, created_at,
      stores:home_store_id ( brand_name )
    `)
    .or(`phone.ilike.%${search}%,email.ilike.%${search}%`)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  return NextResponse.json({ members: data ?? [] })
}

export async function PATCH(req: NextRequest) {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { memberId, reason } = await req.json() as { memberId?: string; reason?: string }
  if (!memberId || !reason?.trim()) {
    return NextResponse.json({ error: 'memberId and reason are required' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()
  const { error } = await admin.from('members').update({
    is_blacklisted: true,
    blacklist_reason: reason.trim(),
    blacklisted_at: new Date().toISOString(),
  }).eq('id', memberId)

  if (error) return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
