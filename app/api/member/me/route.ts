/**
 * GET /api/member/me
 *
 * Resolves the currently logged-in member (via the Supabase session cookie
 * set by /auth/callback after the magic-link click) and returns everything
 * the dashboard needs in one call: profile, home store branding, earned
 * coupons, and active perks at their home store.
 *
 * Responses:
 *   200 { member, store, rewards, freePerks, vipPerks }
 *   401 { error: 'not_authenticated' }
 *   404 { error: 'member_not_found' }
 */

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const { data: member, error: memberError } = await supabase
    .from('members')
    .select(`
      id, first_name, last_name, phone, email,
      status, subscription_status, vip_billing_cycle,
      total_stamps, coupon_due, sms_opt_in,
      is_blacklisted, referral_code, referral_url,
      home_store_id, merchant_id, created_at
    `)
    .eq('auth_user_id', user.id)
    .single()

  if (memberError || !member) {
    return NextResponse.json({ error: 'member_not_found' }, { status: 404 })
  }

  const { data: store } = await supabase
    .from('stores')
    .select('id, display_name, brand_name, brand_color, logo_url, google_review_url, facebook_review_url, member_memo')
    .eq('id', member.home_store_id)
    .single()

  // Full reward history (not just active) -- the dashboard partitions this
  // into "active coupon" vs "past coupons" client-side, and uses the
  // redeemed count to know whether a Free member has used their one
  // lifetime $5 coupon yet.
  const { data: rewards } = await supabase
    .from('rewards')
    .select('id, coupon_value, reward_type, status, earned_at, redeemed_at')
    .eq('member_id', member.id)
    .order('earned_at', { ascending: false })

  const { data: perksRows } = await supabase
    .from('perks')
    .select('id, slot, title, description, member_type')
    .eq('store_id', member.home_store_id)
    .eq('is_active', true)
    .order('slot', { ascending: true })

  const allPerks = perksRows ?? []
  const freePerks = allPerks
    .filter(p => p.member_type === 'free')
    .map(p => ({ id: p.id, slot: p.slot, title: p.title, description: p.description }))
  const vipPerks = allPerks
    .filter(p => p.member_type === 'vip')
    .map(p => ({ id: p.id, slot: p.slot, title: p.title, description: p.description }))

  return NextResponse.json({
    member: {
      id:                 member.id,
      firstName:          member.first_name,
      lastName:           member.last_name,
      phone:              member.phone,
      email:              member.email,
      status:             member.status,
      subscriptionStatus: member.subscription_status,
      vipBillingCycle:    member.vip_billing_cycle,
      totalStamps:        member.total_stamps,
      couponDue:          member.coupon_due,
      smsOptIn:           member.sms_opt_in,
      isBlacklisted:      member.is_blacklisted,
      referralCode:       member.referral_code,
      referralUrl:        member.referral_url,
      merchantId:         member.merchant_id,
      createdAt:          member.created_at,
    },
    store: store ? {
      id:                store.id,
      storeName:         store.display_name,
      brandName:         store.brand_name,
      brandColor:        store.brand_color ?? '#4A4B98',
      logoUrl:           store.logo_url,
      googleReviewUrl:   store.google_review_url,
      facebookReviewUrl: store.facebook_review_url,
      memberMemo:        store.member_memo ?? null,
    } : null,
    rewards: (rewards ?? []).map(r => ({
      id:          r.id,
      couponValue: r.coupon_value,
      rewardType:  r.reward_type,
      status:      r.status,
      earnedAt:    r.earned_at,
      redeemedAt:  r.redeemed_at,
    })),
    freePerks,
    vipPerks,
  })
}
