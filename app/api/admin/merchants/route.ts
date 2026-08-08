import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { postToGhl } from '@/lib/ghl-webhook'
import { verifyAdmin } from '@/lib/admin-auth'

export async function GET(req: NextRequest) {
  const adminEmail = await verifyAdmin()
  if (!adminEmail) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const admin = createAdminSupabaseClient()
  // Signed URL for a merchant's W-9 PDF
  const url = new URL(req.url)
  const action  = url.searchParams.get('action')
  const mIdParam = url.searchParams.get('merchantId')
  if (action === 'w9_url' && mIdParam) {
    const { data, error } = await admin.storage
      .from('merchant-w9')
      .createSignedUrl(mIdParam + '/w9.pdf', 3600)
    if (error || !data?.signedUrl) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return NextResponse.json({ url: data.signedUrl })
  }

  // Commission eligibility audit trail for one merchant. Fetched lazily when the
  // admin expands a merchant card, so the main list stays a single round trip.
  if (action === 'eligibility_history' && mIdParam) {
    const { data, error } = await admin
      .from('origin_eligibility_history')
      .select('id, event_type, effective_at, triggered_by, reason, commission_eligible')
      .eq('merchant_id', mIdParam)
      .order('effective_at', { ascending: false })
      .limit(10)
    if (error) {
      console.error('[admin/merchants] eligibility_history error:', error)
      return NextResponse.json({ error: 'query_failed' }, { status: 500 })
    }
    return NextResponse.json({
      history: (data ?? []).map(h => ({
        id:                 h.id,
        eventType:          h.event_type,
        effectiveAt:        h.effective_at,
        triggeredBy:        h.triggered_by,
        reason:             h.reason,
        commissionEligible: h.commission_eligible,
      })),
    })
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [merchantsResult, stampEvents, allMembers, w9Records, allStores, allPerks, allStaff, allStamps, participantTypes] = await Promise.all([
    admin.from('merchants')
      .select('id, name, owner_email, company_name, billing_status, subscription_status, location_count, created_at, stripe_subscription_id, participant_type, commission_eligible, negative_balance, admin_suspended, admin_suspension_reason')
      .order('created_at', { ascending: false }),
    admin.from('stamp_events').select('merchant_id, stamp_count').gte('awarded_at', sevenDaysAgo),
    admin.from('members').select('merchant_id, subscription_status'),
    admin.from('merchant_w9').select('merchant_id, status, submitted_at, reviewed_at'),
    admin.from('stores').select('merchant_id, logo_url, brand_color, font_family, google_review_url, marketing_downloaded_at, cashier_training_confirmed_at'),
    admin.from('perks').select('merchant_id, is_active, member_type').eq('is_active', true),
    admin.from('staff_users').select('merchant_id').eq('is_active', true),
    admin.from('stamp_events').select('merchant_id'),
    admin.from('participant_types').select('id, display_name'),
  ])

  // participant_types is the source of truth for the human-readable label
  // ('bin_store' → 'Bin Store'). Falls back to the raw slug if a type is missing.
  const participantLabelById: Record<string, string> = {}
  for (const p of (participantTypes.data ?? [])) {
    if (p.id) participantLabelById[p.id] = p.display_name ?? p.id
  }

  // Aggregate stamps per merchant this week
  const stampsByMerchant: Record<string, number> = {}
  for (const s of (stampEvents.data ?? [])) {
    if (!s.merchant_id) continue
    stampsByMerchant[s.merchant_id] = (stampsByMerchant[s.merchant_id] || 0) + (s.stamp_count ?? 0)
  }

  // W-9 status per merchant
  type W9Row = { merchant_id: string; status: string; submitted_at: string | null; reviewed_at: string | null }
  const w9ByMerchant: Record<string, W9Row> = {}
  for (const w of (w9Records.data ?? [])) {
    if (w.merchant_id) w9ByMerchant[w.merchant_id] = w as W9Row
  }

  // Onboarding data per merchant
  const storesByMerchant: Record<string, typeof allStores.data> = {}
  for (const s of (allStores.data ?? [])) {
    if (!storesByMerchant[s.merchant_id]) storesByMerchant[s.merchant_id] = []
    storesByMerchant[s.merchant_id]!.push(s)
  }
  const freePerksByMerchant: Record<string, number> = {}
  const vipPerksByMerchant: Record<string, number> = {}
  for (const p of (allPerks.data ?? [])) {
    if (!p.merchant_id) continue
    if (p.member_type === 'free') freePerksByMerchant[p.merchant_id] = (freePerksByMerchant[p.merchant_id] || 0) + 1
    if (p.member_type === 'vip')  vipPerksByMerchant[p.merchant_id]  = (vipPerksByMerchant[p.merchant_id] || 0) + 1
  }
  const staffByMerchant: Record<string, number> = {}
  for (const s of (allStaff.data ?? [])) {
    if (s.merchant_id) staffByMerchant[s.merchant_id] = (staffByMerchant[s.merchant_id] || 0) + 1
  }
  const stampedMerchants = new Set((allStamps.data ?? []).map((s: { merchant_id: string }) => s.merchant_id))

  function calcOnboarding(m: { id: string; billing_status: string }) {
    const w9 = w9ByMerchant[m.id] ?? null
    const mStores = storesByMerchant[m.id] ?? []
    const primary = mStores[0]
    const checks = [
      !!w9 && w9.status !== 'rejected',
      w9?.status === 'approved',
      mStores.length > 0,
      m.billing_status === 'active',
      !!(primary?.logo_url && primary?.brand_color && primary?.font_family),
      mStores.some(s => !!s.google_review_url),
      (freePerksByMerchant[m.id] ?? 0) >= 1,
      (vipPerksByMerchant[m.id]  ?? 0) >= 3,
      (staffByMerchant[m.id]     ?? 0) > 0,
      mStores.some(s => !!s.marketing_downloaded_at),
      stampedMerchants.has(m.id),
      true,
      mStores.some(s => !!s.cashier_training_confirmed_at),
    ]
    return Math.round(checks.filter(Boolean).length / 13 * 100)
  }

  // Aggregate member counts per merchant
  const membersByMerchant: Record<string, number> = {}
  const vipByMerchant: Record<string, number> = {}
  for (const m of (allMembers.data ?? [])) {
    if (!m.merchant_id) continue
    membersByMerchant[m.merchant_id] = (membersByMerchant[m.merchant_id] || 0) + 1
    if (m.subscription_status === 'vip') {
      vipByMerchant[m.merchant_id] = (vipByMerchant[m.merchant_id] || 0) + 1
    }
  }

  const merchants = (merchantsResult.data ?? []).map(m => {
    const total = membersByMerchant[m.id] ?? 0
    const vip   = vipByMerchant[m.id]   ?? 0
    return {
      ...m,
      stampsThisWeek:    stampsByMerchant[m.id] ?? 0,
      totalMembers:      total,
      vipMembers:        vip,
      vipConversionPct:  total > 0 ? Math.round(vip / total * 100) : 0,
      w9:                w9ByMerchant[m.id] ?? null,
      onboardingComplete: calcOnboarding(m),
      abandonedCheckout: m.billing_status === 'pending' && !m.stripe_subscription_id,
      // V3 fields. commission_eligible is merchant-level (never per store) and
      // is driven by billing + admin suspension, not by billing_status alone —
      // see CLAUDE.md "STORE AND MERCHANT STATUS MODEL (V3)".
      commissionEligible:    m.commission_eligible ?? false,
      participantType:       m.participant_type ?? null,
      participantTypeLabel:  m.participant_type ? (participantLabelById[m.participant_type] ?? m.participant_type) : null,
      negativeBalance:       Number(m.negative_balance ?? 0),
      adminSuspended:        m.admin_suspended ?? false,
      adminSuspensionReason: m.admin_suspension_reason ?? null,
    }
  })

  if (merchantsResult.error) return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  return NextResponse.json({ merchants })
}

export async function PATCH(req: NextRequest) {
  const adminEmail = await verifyAdmin()
  if (!adminEmail) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { merchantId, action } = await req.json() as { merchantId?: string; action?: 'activate' | 'deactivate' | 'approve_w9' | 'reject_w9' }
  if (!merchantId || !action) return NextResponse.json({ error: 'missing_fields' }, { status: 400 })

  const admin = createAdminSupabaseClient()

  if (action === 'approve_w9' || action === 'reject_w9') {
    const status = action === 'approve_w9' ? 'approved' : 'rejected'
    const { error } = await admin
      .from('merchant_w9')
      .update({ status, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('merchant_id', merchantId)
    if (error) return NextResponse.json({ error: 'update_failed' }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'activate') {
    const { data: merchant, error: fetchErr } = await admin
      .from('merchants').select('id, name, owner_email, company_name').eq('id', merchantId).single()
    if (fetchErr || !merchant) return NextResponse.json({ error: 'merchant_not_found' }, { status: 404 })

    await Promise.all([
      admin.from('merchants').update({ billing_status: 'active', subscription_status: 'active' }).eq('id', merchantId),
      admin.from('stores').update({ is_active: true }).eq('merchant_id', merchantId),
    ])

    // Awaited — a fire-and-forget fetch is killed when the handler returns on
    // Vercel, so the activation email was being dropped at random, leaving an
    // activated merchant with no notice that they can log in. postToGhl never
    // throws, so a GHL outage cannot fail an activation already written above.
    if (process.env.GHL_MERCHANT_ACTIVATED_WEBHOOK_URL) {
      await postToGhl(process.env.GHL_MERCHANT_ACTIVATED_WEBHOOK_URL, {
        merchantId: merchant.id, firstName: merchant.name ?? '',
        phone: '', email: merchant.owner_email ?? '',
        companyName: merchant.company_name ?? '',
        dashboardUrl: 'https://app.binperks.com/merchant/dashboard',
      }, '/api/admin/merchants')
    }
  } else {
    await Promise.all([
      admin.from('merchants').update({ billing_status: 'deactivated' }).eq('id', merchantId),
      admin.from('stores').update({ is_active: false }).eq('merchant_id', merchantId),
    ])
  }

  return NextResponse.json({ ok: true })
}
