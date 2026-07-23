/**
 * POST /api/join/create
 *
 * Creates a new member. Called by Page 2 (join form) on submit.
 *
 * Steps:
 *   1. Normalize phone (digits only), check uniqueness within merchant
 *   2. Look up store's canonical_key (for the referral_url)
 *   3. Create Supabase auth user (passwordless — magic link only, no provider send;
 *      GHL delivers the actual SMS with the link per the locked Auth Architecture)
 *   4. Insert members row with home_store_id, merchant_id, referral fields
 *   5. If referred: create referrals row (status: 'pending')
 *   6. TODO: POST to GHL webhook to create the contact + trigger welcome SMS
 *      (Express backend route not built yet — see SIGNUP_FUNNEL_README contract)
 *
 * Request body:
 *   { storeId, merchantId, firstName, lastName, phone (digits), email,
 *     smsOptIn, referrerMemberId? }
 *
 * Responses:
 *   200 { memberId, referralCode, referralUrl }
 *   409 { error: 'phone_exists' }   — phone already registered at this merchant
 *   400 { error: string }
 *   500 { error: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { Redis } from '@upstash/redis'

const APP_URL = 'https://app.binperks.com'

interface CreateMemberRequest {
  storeId: string
  merchantId: string
  firstName: string
  lastName: string
  phone: string       // digits only
  email: string
  smsOptIn: boolean
  referrerMemberId?: string
}

function generateReferralCode(): string {
  // 8-char uppercase alphanumeric, e.g. "QX7K2M4P"
  return Array.from({ length: 8 }, () =>
    '23456789ABCDEFGHJKMNPQRSTUVWXYZ'[Math.floor(Math.random() * 32)]
  ).join('')
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Partial<CreateMemberRequest>
    const { storeId, merchantId, firstName, lastName, phone, email, smsOptIn, referrerMemberId } = body

    if (!storeId || !merchantId || !firstName || !lastName || !phone || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Basic phone validation (10 digits)
    if (!/^\d{10}$/.test(phone)) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
    }

    const supabase = createAdminSupabaseClient()

    // 1. Check phone uniqueness within this merchant (members list is per-merchant,
    //    never shared across merchants — see "Member & Location Model" rules)
    const { data: existing } = await supabase
      .from('members')
      .select('id')
      .eq('phone', phone)
      .eq('merchant_id', merchantId)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'phone_exists' }, { status: 409 })
    }

    // 2. Look up the store's canonical_key so the referral_url points at the
    //    right /member/join/[storeKey] funnel (QR codes use the same canonical_key)
    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('canonical_key, display_name')
      .eq('id', storeId)
      .single()

    if (storeError || !store) {
      return NextResponse.json({ error: 'store_not_found' }, { status: 400 })
    }

    // 3. Create the Supabase auth user (admin client — service role required).
    //    No password is ever set. Phone auth provider is OFF in Supabase
    //    (GHL/Twilio sends the actual SMS), so we create the identity with
    //    email and store phone as a plain column on members for lookups.
    const admin = createAdminSupabaseClient()

    // Phone auth provider is OFF — never pass `phone` to createUser or it may
    // collide on a cross-merchant signup where the same phone already has a
    // Supabase auth identity. Phone lookups use the members table only.
    const { data: authUser, error: authError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
    })

    if (authError || !authUser?.user) {
      // A user with this email is already registered in Supabase auth —
      // this happens if the same person tries to join a second merchant.
      // Return a specific 409 so the client can show a helpful message
      // rather than a generic 500 crash.
      const isEmailConflict =
        authError?.message?.toLowerCase().includes('already') ||
        authError?.status === 422
      if (isEmailConflict) {
        return NextResponse.json({ error: 'email_exists' }, { status: 409 })
      }
      console.error('[/api/join/create] Auth user creation error:', authError)
      return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
    }

    const authUserId = authUser.user.id

    // 4. Generate a unique referral code (retry on the rare unique-constraint hit)
    let referralCode = generateReferralCode()

    let memberId: string | null = null
    for (let attempt = 0; attempt < 3 && !memberId; attempt++) {
      const referralUrl = `${APP_URL}/member/join/${store.canonical_key}?ref=${referralCode}`
      const { data: inserted, error: insertError } = await supabase
        .from('members')
        .insert({
          auth_user_id:          authUserId,
          home_store_id:         storeId,
          merchant_id:           merchantId,
          first_name:            firstName,
          last_name:             lastName,
          phone,
          email,
          status:                'active',
          subscription_status:   'free',
          total_stamps:          0,
          coupon_due:            false,
          sms_opt_in:            smsOptIn ?? true,
          is_blacklisted:        false,
          referred_by_member_id: referrerMemberId ?? null,
          referral_code:         referralCode,
          referral_url:          referralUrl,
          created_at:            new Date().toISOString(),
        })
        .select('id')
        .single()

      if (insertError) {
        // Unique violation — could be phone (race condition) or referral_code collision
        if (insertError.code === '23505') {
          if (insertError.message?.includes('phone')) {
            await admin.auth.admin.deleteUser(authUserId)
            return NextResponse.json({ error: 'phone_exists' }, { status: 409 })
          }
          // referral_code collision — regenerate and retry
          referralCode = generateReferralCode()
          continue
        }
        console.error('[/api/join/create] Member insert error:', insertError)
        await admin.auth.admin.deleteUser(authUserId)
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }

      memberId = inserted.id
    }

    if (!memberId) {
      await admin.auth.admin.deleteUser(authUserId)
      return NextResponse.json({ error: 'Failed to create member' }, { status: 500 })
    }

    // 5. If referred, create the referrals row (bonus stamps are awarded later,
    //    by the award_stamp flow, once the referred member earns their first
    //    real visit stamp — referral bonus is 2 stamps, never 5)
    if (referrerMemberId) {
      await supabase.from('referrals').insert({
        referrer_member_id: referrerMemberId,
        referred_member_id: memberId,
        merchant_id:         merchantId,
        location_id:          storeId,
        status:               'pending',
        bonus_awarded:        false,
        created_at:           new Date().toISOString(),
      })
    }

    // 6. Notify GHL (fire-and-forget — don't block the response).
    //    Skipped if GHL_MEMBER_CREATED_WEBHOOK_URL is not yet configured.
    const finalReferralUrl = `${APP_URL}/member/join/${store.canonical_key}?ref=${referralCode}`
    const ghlWebhook = process.env.GHL_MEMBER_CREATED_WEBHOOK_URL
    if (ghlWebhook) {
      fetch(ghlWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId,
          firstName,
          lastName,
          phone,
          email,
          storeName:   store.display_name,
          referralUrl: finalReferralUrl,
        }),
      }).catch(err => console.error('[/api/join/create] GHL webhook error:', err))
    }

    // 7. Generate magic link and send via GHL so new member can go straight to dashboard.
    //    Fire-and-forget — never block the signup response on this.
    const magicLinkWebhook = process.env.GHL_MAGIC_LINK_WEBHOOK_URL
    if (magicLinkWebhook) {
      ;(async () => {
        try {
          const APP_BASE = process.env.NEXT_PUBLIC_APP_URL ?? APP_URL
          const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
            type: 'magiclink',
            email,
            options: { redirectTo: APP_BASE + '/auth/callback?next=/member/dashboard' },
          })
          if (linkError || !linkData) {
            console.error('[/api/join/create] generateLink error:', linkError); return
          }
          // Shorten via Upstash Redis (same pattern as /api/member/login)
          const redis = new Redis({
            url: process.env.KV_REST_API_URL!,
            token: process.env.KV_REST_API_TOKEN!,
          })
          const code = Math.random().toString(36).substring(2, 10)
          await redis.set('token:' + code, linkData.properties.hashed_token, { ex: 65 * 60 })
          const shortUrl = APP_BASE + '/s/' + code
          await fetch(magicLinkWebhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ memberId, phone, firstName, magicLink: shortUrl }),
          })
        } catch (err) {
          console.error('[/api/join/create] magic link error:', err)
        }
      })()
    }

    return NextResponse.json({
      memberId,
      referralCode,
      referralUrl: finalReferralUrl,
    })

  } catch (err) {
    console.error('[/api/join/create] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
