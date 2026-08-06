/**
 * POST /api/join/create
 *
 * Creates a new member. Called by Page 2 (join form) on submit.
 *
 * Steps:
 *   1. Normalize phone (digits only), check uniqueness within merchant
 *   2. Look up store's canonical_key + merchant_id (referral_url + Origin Store attribution)
 *   3. Create Supabase auth user (passwordless — magic link only, no provider send;
 *      GHL delivers the actual SMS with the link per the locked Auth Architecture)
 *   4. Insert members row with home_store_id, merchant_id, referral fields, and the
 *      permanent V3 Origin Store attribution (origin_store_id / origin_merchant_id)
 *   5. If referred: create referrals row (status: 'pending')
 *   6. Notify GHL of the new member (fire-and-forget welcome comms)
 *   7. Issue an 8-digit sign-in code by SMS so the member lands on the dashboard
 *
 * Request body:
 *   { storeId, merchantId, firstName, lastName, phone (digits), email,
 *     smsOptIn, referrerMemberId? }
 *
 * Responses:
 *   200 { memberId, referralCode, referralUrl, otpSent }
 *       otpSent false means the account exists but the code could not be sent —
 *       the caller should send the member to the login page to request one.
 *   409 { error: 'phone_exists' }   — phone already registered at this merchant
 *   409 { error: 'email_exists' }   — email already has a Supabase auth identity
 *   400 { error: string }
 *   500 { error: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { issueMemberOtp } from '@/lib/member-otp'

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
      // Returning member — bail out before any write. Origin Store attribution is
      // permanent (V3 rule 18): an existing member's origin_* fields are never
      // re-derived or overwritten by a second trip through the signup form.
      return NextResponse.json({ error: 'phone_exists' }, { status: 409 })
    }

    // 2. Look up the store's canonical_key so the referral_url points at the
    //    right /member/join/[storeKey] funnel (QR codes use the same canonical_key).
    //    merchant_id comes from this row too — the store record is the authoritative
    //    source for Origin Store attribution, not the client-supplied merchantId.
    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('canonical_key, display_name, merchant_id')
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

          // ── V3 Origin Store attribution ──────────────────────────────────
          // Written ONCE, here, at enrollment. Permanent for the life of the
          // member — never updated, reassigned, or transferred (V3 rule 18).
          // The Origin Store earns the $19.99 merchant commission on this
          // member's VIP payments while its merchant stays commission_eligible.
          origin_store_id:          storeId,
          origin_merchant_id:       store.merchant_id,
          origin_enrolled_at:       new Date().toISOString(),
          origin_enrollment_source: 'qr_code',            // all signup-page enrollments
          origin_migration_source:  'v3_enrollment',      // live enrollment, not a backfill
          origin_confidence:        'enrollment_record',  // highest — direct enrollment
          origin_migration_notes:   'Enrolled via member signup page at launch',
          origin_admin_reviewed:    true,                 // live enrollments need no review
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
    //
    //    V3 network language: the SMS/email copy itself lives in the GoHighLevel
    //    workflow, not here — this route only supplies merge values. `storeName`
    //    stays the bare store name so existing {{storeName}} merge tags keep
    //    rendering correctly. `networkStoreName` carries the V3 framing
    //    ("BinPerks at EstaBins Tampa") for the workflow to switch over to, so a
    //    member reads as joining the network through a store rather than joining
    //    that store's own program.
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
          storeName:        store.display_name,
          networkStoreName: `BinPerks at ${store.display_name}`,
          referralUrl:      finalReferralUrl,
        }),
      }).catch(err => console.error('[/api/join/create] GHL webhook error:', err))
    }

    // 7. Send the new member an 8-digit sign-in code so they can go straight
    //    to the dashboard. Same code and same verify route as a returning
    //    member's login — see lib/member-otp.
    //
    //    Awaited, not fire-and-forget: the combined join flow on the home page
    //    sends the member to a code-entry screen the moment this returns, so
    //    the code has to exist in Redis before we respond. `otpSent` tells the
    //    caller whether to show that screen or fall back to the login page.
    const issued = await issueMemberOtp({
      admin,
      memberId,
      phone,
      firstName,
      email,
    })

    if (!issued.ok) {
      console.error('[/api/join/create] OTP issue failed:', issued.reason)
    }

    return NextResponse.json({
      memberId,
      referralCode,
      referralUrl: finalReferralUrl,
      otpSent: issued.ok,
    })

  } catch (err) {
    console.error('[/api/join/create] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
