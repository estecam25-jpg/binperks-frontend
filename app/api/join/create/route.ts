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
 *   5a. If they signed up at the register QR: award that day's visit stamp
 *   6. Notify GHL of the new member (fire-and-forget welcome comms)
 *   7. Issue an 8-digit sign-in code by SMS so the member lands on the dashboard
 *
 * Request body:
 *   { storeId?, merchantId?, zipCode, firstName, lastName, phone (digits), email,
 *     smsOptIn, referrerMemberId?, inStoreRegister? }
 *
 * Responses:
 *   200 { memberId, referralCode, referralUrl, otpSent, stampAwarded }
 *       otpSent false means the account exists but the code could not be sent —
 *       the caller should send the member to the login page to request one.
 *       stampAwarded is whether the register-QR stamp actually landed; false
 *       whenever one was not asked for.
 *   409 { error: 'phone_exists' }   — phone already registered anywhere on the network
 *   409 { error: 'email_exists' }   — email already has a Supabase auth identity
 *   400 { error: string }
 *   500 { error: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { issueMemberOtp } from '@/lib/member-otp'
import { postToGhl } from '@/lib/ghl-webhook'
import { BINPERKS_HOUSE_STORE_ID, BINPERKS_HOUSE_MERCHANT_ID } from '@/lib/binperks-origin'
import { generateReferralCode as generateShortCode, referralUrl as shortReferralUrl } from '@/lib/referral-code'
import { awardReferralBonusIfDue } from '@/lib/referral-bonus'

const APP_URL = 'https://app.binperks.com'

interface CreateMemberRequest {
  /** Omitted when the member joined through BinPerks with no store context. */
  storeId?: string
  zipCode: string
  /** Omitted alongside storeId for a BinPerks-direct join. */
  merchantId?: string
  firstName: string
  lastName: string
  phone: string       // digits only
  email: string
  smsOptIn: boolean
  referrerMemberId?: string
  /**
   * The member scanned the QR at a store's register, so they are standing in
   * that store right now and their visit stamp for today is awarded as part of
   * signing up. Set by the signup step from the URL it was reached through —
   * see lib/join-source.
   */
  inStoreRegister?: boolean
}

/**
 * Awards the single visit stamp that comes with signing up at the register.
 *
 * Writes the same two rows a cashier's stamp writes — the visits row that
 * enforces one stamp per member per store per day, and the activity_events row
 * that IS the stamp — so this is indistinguishable from any other stamp to
 * every reader, every dashboard and the settlement ledger.
 *
 * NOT stamp_events. That table was frozen at the dual-write cutover: since then
 * activity_events has been the sole source of truth and nothing writes to
 * stamp_events, which is kept only as the historical record. A row added there
 * now would be read by nothing while breaking the one property that record has.
 * Its event_type CHECK ('visit' | 'referral_bonus' | 'promotion' | 'reversal')
 * would reject a signup value in any case, and there is no source column on it
 * to put one in. The QR is recorded in activity_data instead, which is where a
 * live row can carry it.
 *
 * ALWAYS EXACTLY 1 STAMP. A member is subscription_status 'free' the instant
 * they are created, and a free member earns 1x per visit (Core Rule #12). Tier
 * multipliers cannot apply to someone who has not upgraded yet, so there is no
 * multiplier to compute and none to get wrong.
 *
 * NO COUPON CHECK. One stamp against a 20-stamp cycle cannot earn a reward, and
 * a brand new member has no prior coupon to redeem.
 *
 * Returns whether the stamp actually landed. Never throws: the member already
 * exists by the time this runs.
 */
async function awardRegisterSignupStamp(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  { memberId, storeId, merchantId }: {
    memberId: string; storeId: string; merchantId: string
  },
): Promise<boolean> {
  const now   = new Date()
  const today = now.toISOString().split('T')[0]

  // The once-per-day guard goes in FIRST, in the same order /api/stamp uses:
  // the unique index on (member_id, store_id, date) is what makes "this counts
  // as today's visit" true, and taking it before the stamp itself means a
  // cashier stamping the same member a minute later is rejected by the
  // database rather than by a check that could race it.
  const { error: visitError } = await admin.from('visits').insert({
    member_id:  memberId,
    store_id:   storeId,
    // No cashier: the member scanned the QR themselves. The column is nullable
    // and a null here is the honest record of that.
    cashier_id: null,
    date:       today,
    awarded_at: now.toISOString(),
    source:     'register_signup',
  })

  if (visitError) {
    console.error('[/api/join/create] register stamp: visit insert failed:', visitError)
    return false
  }

  const { error: activityError } = await admin.from('activity_events').insert({
    member_id:          memberId,
    store_id:           storeId,
    merchant_id:        merchantId,
    // The store they are standing in IS their Origin Store — this stamp only
    // happens at the moment of enrollment, so the two cannot differ.
    origin_store_id:    storeId,
    origin_merchant_id: merchantId,
    participant_type:   'bin_store',
    activity_type:      'store_visit',
    // 'store_visit' is what every reader counts, so the type cannot say
    // "register signup" without the stamp vanishing from the dashboards.
    // activity_data is where that distinction lives instead.
    activity_data:      { source: 'register_signup' },
    stamps_awarded:     1,
    multiplier_applied: 1,
    effective_stamps:   1,
    occurred_at:        now.toISOString(),
    cashier_id:         null,
    migrated_from:      null,   // null = live event, not backfill
    source_record_id:   null,
  })

  if (activityError) {
    console.error('[/api/join/create] register stamp: activity insert failed:', activityError)
    // Roll the visit back. Left behind, it blocks the member from being
    // stamped at this store for the rest of the day over a stamp they never
    // received — the same repair /api/stamp makes in this situation.
    await admin.from('visits').delete()
      .eq('member_id', memberId)
      .eq('store_id', storeId)
      .eq('date', today)
    return false
  }

  // Straight to 1 rather than an increment: the member was inserted with
  // total_stamps 0 moments ago and nothing else can have stamped them, so there
  // is no read-modify-write here to lose a race on.
  const { error: totalError } = await admin
    .from('members')
    .update({ total_stamps: 1 })
    .eq('id', memberId)

  if (totalError) {
    // The stamp IS recorded; only the denormalised counter is behind, and it
    // can be recomputed from activity_events. Reporting failure here would hide
    // a real stamp from the member.
    console.error('[/api/join/create] register stamp: total_stamps update failed:', totalError)
  }

  return true
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
    const { firstName, lastName, phone, email, smsOptIn, referrerMemberId, zipCode } = body

    if (!firstName || !lastName || !phone || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!/^\d{5}$/.test(String(zipCode ?? ''))) {
      return NextResponse.json({ error: 'Invalid zip code' }, { status: 400 })
    }

    // No store in the URL means the member came to BinPerks directly rather
    // than through a participating store. They are attributed to the BinPerks
    // house origin, which is commission_eligible = false, so no merchant
    // commission accrues — see lib/binperks-origin.
    const binperksOrigin = !body.storeId
    const storeId    = body.storeId    ?? BINPERKS_HOUSE_STORE_ID
    const merchantId = body.merchantId ?? BINPERKS_HOUSE_MERCHANT_ID

    // Basic phone validation (10 digits)
    if (!/^\d{10}$/.test(phone)) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
    }

    // Normalize here, not just in the client. Supabase matches email
    // case-insensitively when resolving a magic link, so two auth.users rows
    // differing only in case make that lookup ambiguous and can hand a member
    // a token for the wrong identity. Writing one canonical form is what stops
    // that pair from ever being created.
    const normalizedEmail = email.trim().toLowerCase()

    const supabase = createAdminSupabaseClient()

    // 1. Check phone uniqueness within this merchant (members list is per-merchant,
    //    never shared across merchants — see "Member & Location Model" rules)
    // GLOBAL, not scoped to this merchant. One phone is one BinPerks account
    // network-wide (CORE RULE 17), enforced by idx_members_phone_unique. The
    // old per-merchant check let the same person sign up again at a different
    // store and split their stamps across two records.
    const { data: existing } = await supabase
      .from('members')
      .select('id')
      .eq('phone', phone)
      .maybeSingle()

    if (existing) {
      // Returning member — bail out before any write. Origin Store attribution
      // is permanent (V3 rule 18): an existing member's origin_* fields are
      // never re-derived or overwritten by a second trip through the form.
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
      email: normalizedEmail,
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

    // 4. Generate referral codes (retry on the rare unique-constraint hit).
    //    referralCode is the LEGACY 8-char value, still written so links already
    //    in the wild keep resolving; shortCode drives the new /join/XXXXXX URL.
    let referralCode = generateReferralCode()
    let shortCode = generateShortCode()

    let memberId: string | null = null
    for (let attempt = 0; attempt < 3 && !memberId; attempt++) {
      const referralUrl = shortReferralUrl(shortCode, APP_URL)
      const { data: inserted, error: insertError } = await supabase
        .from('members')
        .insert({
          auth_user_id:          authUserId,
          home_store_id:         storeId,
          merchant_id:           merchantId,
          first_name:            firstName,
          last_name:             lastName,
          phone,
          email:                 normalizedEmail,
          status:                'active',
          subscription_status:   'free',
          total_stamps:          0,
          coupon_due:            false,
          sms_opt_in:            smsOptIn ?? true,
          is_blacklisted:        false,
          referred_by_member_id: referrerMemberId ?? null,
          referral_code:         referralCode,
          referral_short_code:   shortCode,
          referral_url:          referralUrl,
          zip_code:              String(zipCode),
          created_at:            new Date().toISOString(),

          // ── V3 Origin Store attribution ──────────────────────────────────
          // Written ONCE, here, at enrollment. Permanent for the life of the
          // member — never updated, reassigned, or transferred (V3 rule 18).
          // The Origin Store earns the $19.99 merchant commission on this
          // member's VIP payments while its merchant stays commission_eligible.
          origin_store_id:          storeId,
          origin_merchant_id:       store.merchant_id,
          origin_enrolled_at:       new Date().toISOString(),
          binperks_origin:          binperksOrigin,
          origin_enrollment_source: binperksOrigin ? 'binperks_direct' : 'qr_code',
          origin_migration_source:  'v3_enrollment',      // live enrollment, not a backfill
          origin_confidence:        'enrollment_record',  // highest — direct enrollment
          origin_migration_notes:   binperksOrigin
            ? 'Joined through BinPerks directly — no store context in the URL'
            : 'Enrolled via member signup page at launch',
          origin_admin_reviewed:    true,                 // live enrollments need no review
        })
        .select('id')
        .single()

      if (insertError) {
        // Unique violation — could be phone (race condition) or referral_code collision
        if (insertError.code === '23505') {
          // idx_members_phone_unique — someone claimed the number between the
          // check above and this insert.
          if (insertError.message?.includes('phone')) {
            await admin.auth.admin.deleteUser(authUserId)
            return NextResponse.json({ error: 'phone_exists' }, { status: 409 })
          }
          // A code collided — regenerate BOTH and retry; the message does not
          // reliably say which of the two unique indexes was hit.
          referralCode = generateReferralCode()
          shortCode = generateShortCode()
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

    // 5. If referred, create the referrals row. Pending until the referred
    //    member's first visit stamp, which pays 2 stamps to each side — see
    //    lib/referral-bonus. That can be this very request (5b, below) when
    //    they joined at the register; otherwise it is their first cashier stamp.
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

    // 5a. Register QR signup — award today's visit stamp on the spot.
    //
    //     FIRST-TIME SIGNUPS ONLY, and that is structural rather than a flag
    //     anyone has to remember: a returning member is turned away by the
    //     phone_exists check at the top of this route, long before here. There
    //     is no second path into this block for someone who already has an
    //     account.
    //
    //     NOT FOR A BINPERKS-DIRECT JOIN. A register QR only exists on a
    //     participating store's counter, so a request claiming one with no
    //     store in the URL is not a visit to anywhere and earns no stamp.
    //
    //     NEVER FATAL. The member, their auth identity and their referral row
    //     are already written, and a sign-in code is about to go out. Failing
    //     the whole signup because a bonus stamp did not land would cost
    //     someone their account over an extra. What comes back is what actually
    //     happened, so the thank-you page can only congratulate a member on a
    //     stamp they really have.
    let stampAwarded = false
    if (body.inStoreRegister === true && !binperksOrigin) {
      stampAwarded = await awardRegisterSignupStamp(admin, {
        memberId,
        storeId,
        // The store record, not the client-supplied merchantId — the same
        // authority the Origin Store attribution above is written from.
        merchantId: store.merchant_id,
      })
    }

    // 5b. Referral bonus, when this signup's register stamp WAS the first visit.
    //
    //     A referred member who joins at the register gets their first visit
    //     stamp right here, not at a cashier — so if the bonus waited for
    //     /api/stamp, this visit would already be spent and the referral would
    //     pay out a visit late. Only when the stamp actually landed: no stamp,
    //     no first visit, and the referral stays pending for their first
    //     cashier stamp to pay instead. Never throws — see lib/referral-bonus.
    if (stampAwarded && referrerMemberId) {
      await awardReferralBonusIfDue(admin, memberId)
    }

    // 6. Notify GHL. Awaited — a fire-and-forget fetch is killed when the
    //    handler returns on Vercel, so the welcome SMS was being dropped at
    //    random. postToGhl never throws, so a GHL outage cannot fail a signup
    //    that has already written the member. See lib/ghl-webhook.
    //    Skipped if GHL_MEMBER_CREATED_WEBHOOK_URL is not yet configured.
    //
    //    V3 network language: the SMS/email copy itself lives in the GoHighLevel
    //    workflow, not here — this route only supplies merge values. `storeName`
    //    stays the bare store name so existing {{storeName}} merge tags keep
    //    rendering correctly. `networkStoreName` carries the V3 framing
    //    ("BinPerks at EstaBins Tampa") for the workflow to switch over to, so a
    //    member reads as joining the network through a store rather than joining
    //    that store's own program.
    // THE SHORT LINK, not the old /member/join/[storeKey]?ref=… form.
    //
    // members.referral_url has stored the short format since it shipped; this
    // response and the GHL welcome payload were the two places still handing
    // out the long one, which is why the thank-you page showed it. Built from
    // the same shortCode that was actually written to the row above, so the
    // link on screen and the link in the database cannot disagree.
    const finalReferralUrl = shortReferralUrl(shortCode, APP_URL)
    const ghlWebhook = process.env.GHL_MEMBER_CREATED_WEBHOOK_URL
    if (ghlWebhook) {
      await postToGhl(ghlWebhook, {
        memberId,
        firstName,
        lastName,
        phone,
        email:            normalizedEmail,
        storeName:        store.display_name,
        networkStoreName: `BinPerks at ${store.display_name}`,
        referralUrl:      finalReferralUrl,
      }, '/api/join/create')
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
      email: normalizedEmail,
      authUserId,
    })

    if (!issued.ok) {
      console.error('[/api/join/create] OTP issue failed:', issued.reason)
    }

    return NextResponse.json({
      memberId,
      referralCode,
      referralUrl: finalReferralUrl,
      otpSent: issued.ok,
      stampAwarded,
    })

  } catch (err) {
    console.error('[/api/join/create] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
