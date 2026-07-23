import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

const ADMIN_EMAIL = 'enina@estecam.com'

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.email === ADMIN_EMAIL ? user : null
}

export async function GET() {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from('merchants')
    .select('id, name, owner_email, company_name, billing_status, subscription_status, location_count, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  return NextResponse.json({ merchants: data ?? [] })
}

export async function PATCH(req: NextRequest) {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { merchantId, action } = await req.json() as { merchantId?: string; action?: 'activate' | 'deactivate' }
  if (!merchantId || !action) return NextResponse.json({ error: 'missing_fields' }, { status: 400 })

  const admin = createAdminSupabaseClient()

  if (action === 'activate') {
    const { data: merchant, error: fetchErr } = await admin
      .from('merchants')
      .select('id, name, owner_email, company_name')
      .eq('id', merchantId)
      .single()
    if (fetchErr || !merchant) return NextResponse.json({ error: 'merchant_not_found' }, { status: 404 })

    // Activate merchant + all their stores
    await Promise.all([
      admin.from('merchants').update({
        billing_status:      'active',
        subscription_status: 'active',
      }).eq('id', merchantId),
      admin.from('stores').update({ is_active: true }).eq('merchant_id', merchantId),
    ])

    // Fire GHL activated webhook (non-blocking)
    if (process.env.GHL_MERCHANT_ACTIVATED_WEBHOOK_URL) {
      fetch(process.env.GHL_MERCHANT_ACTIVATED_WEBHOOK_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId:   merchant.id,
          firstName:    merchant.name ?? '',
          phone:        '',
          email:        merchant.owner_email ?? '',
          companyName:  merchant.company_name ?? '',
          dashboardUrl: 'https://app.binperks.com/merchant/dashboard',
        }),
      }).catch(err => console.error('[admin/merchants] GHL webhook error:', err))
    }
  } else {
    // Deactivate merchant + all their stores
    await Promise.all([
      admin.from('merchants').update({ billing_status: 'deactivated' }).eq('id', merchantId),
      admin.from('stores').update({ is_active: false }).eq('merchant_id', merchantId),
    ])
  }

  return NextResponse.json({ ok: true })
}
