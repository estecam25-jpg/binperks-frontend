import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import bcrypt from 'bcryptjs'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { postToGhl } from '@/lib/ghl-webhook'
import { createAlert, couponReadyAlert, tierUpAlert } from '@/lib/member-alerts'
import { awardReferralBonusIfDue } from '@/lib/referral-bonus'

export async function POST(req: NextRequest) {
  try {
    const { memberId, storeId, cashierId, pin } = await req.json()

    if (!memberId || !storeId || !cashierId || !pin) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = await createServerSupabaseClient()
    const admin    = createAdminSupabaseClient()
    const today    = new Date().toISOString().split('T')[0]

    // 0. Verify cashier exists, resolve merchant_id, and re-verify PIN with bcrypt.
    //    Never trust the merchantId supplied by the client. Re-checking the PIN
    //    server-side on every stamp prevents a stolen cashier session from being
    //    used if the tablet is compromised after login.
    const { data: cashier, error: cashierError } = await supabase
      .from('staff_users')
      .select('merchant_id, pin')
      .eq('id', cashierId)
      .eq('is_active', true)
      .single()

    if (cashierError || !cashier) {
      return NextResponse.json({ error: 'Cashier not found' }, { status: 404 })
    }

    // Verify PIN with bcrypt. Supports legacy plaintext PINs during transition.
    const storedPin: string = cashier.pin ?? ''
    const isHash = storedPin.startsWith('')
    const pinValid = isHash
      ? await bcrypt.compare(pin, storedPin)
      : storedPin === pin  // legacy plaintext fallback

    if (!pinValid) {
      return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 })
    }

    const merchantId = cashier.merchant_id

    // 0a. Load the member and decide whether they may be stamped HERE.
    //
    //     Deliberately NOT scoped to the cashier's merchant. This route used to
    //     require members.merchant_id === the cashier's merchant, which rejected
    //     every member visiting any store other than the one that enrolled them.
    //     A BinPerks membership is network-wide: Origin Store governs commission
    //     attribution only and never restricts where stamps are earned.
    //
    //     What does still gate a stamp: the member must exist, be active, and
    //     not be blacklisted. The stamp tool checks the last two before showing
    //     the Award button, but the UI is not enforcement — a direct POST to
    //     this route bypasses it entirely.
    //
    //     origin_store_id / origin_merchant_id are read for the activity_events
    //     dual-write (step 5a) — permanent attribution, never recomputed here.
    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('total_stamps, coupon_due, subscription_status, first_name, phone, sms_opt_in, status, is_blacklisted, origin_store_id, origin_merchant_id')
      .eq('id', memberId)
      .single()

    if (memberError || !member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    if (member.status !== 'active' || member.is_blacklisted) {
      return NextResponse.json({ error: 'member_inactive' }, { status: 403 })
    }

    // 1. Check for duplicate visit today
    const { data: existingVisit } = await supabase
      .from('visits')
      .select('id')
      .eq('member_id', memberId)
      .eq('store_id', storeId)
      .eq('date', today)
      .single()

    if (existingVisit) {
      return NextResponse.json({ error: 'already_stamped' }, { status: 409 })
    }

    // 2a. Check if free member has already used their one lifetime coupon.
    //     Use admin client — rewards table has RLS that blocks anon reads.
    //     Core Rule #12: free members get one  coupon lifetime, then must upgrade.
    const { count: redeemedCount } = await admin
      .from('rewards')
      .select('*', { count: 'exact', head: true })
      .eq('member_id', memberId)
      .eq('status', 'redeemed')

    const isFreeMemberCouponExhausted =
      member.subscription_status === 'free' && (redeemedCount ?? 0) >= 1

    // Core Rule #12 enforcement: if free member already redeemed their one lifetime coupon
    // AND has accumulated more than 20 stamps, block the stamp entirely.
    // (Visits 1–20 are allowed so they can earn + redeem their free coupon; visit 21+ is blocked.)
    if (member.subscription_status === 'free' && isFreeMemberCouponExhausted && member.total_stamps > 20) {
      return NextResponse.json(
        { error: 'free_coupon_exhausted', memberName: member.first_name, totalStamps: member.total_stamps },
        { status: 200 }
      )
    }

    // 3. Calculate stamp multiplier.
    //    Free members always get 1 stamp per visit (Core Rule #12).
    //    VIP members earn more stamps based on their tier.
    //    Two-pass approach: if a visit causes a tier level-up, award the
    //    NEW tier's multiplier (e.g. crossing into Silver at 200 stamps
    //    earns 3 stamps on that same visit, not 2).
    const totalStamps = member.total_stamps

    const vipMultiplier = (stamps: number) =>
      stamps >= 2000 ? 5 :
      stamps >= 750  ? 4 :
      stamps >= 200  ? 3 : 2

    const stampsToAward =
      member.subscription_status === 'free' ? 1
      : vipMultiplier(totalStamps + vipMultiplier(totalStamps))  // two-pass: check post-stamp tier

    // 4. Insert visit row
    const { error: visitError } = await supabase
      .from('visits')
      .insert({
        member_id:  memberId,
        store_id:   storeId,
        cashier_id: cashierId,
        date:       today,
        awarded_at: new Date().toISOString(),
        source:     'cashier',
      })

    if (visitError) {
      if (visitError.code === '23505') {
        return NextResponse.json({ error: 'already_stamped' }, { status: 409 })
      }
      console.error('Visit insert error:', visitError)
      return NextResponse.json({ error: visitError.message }, { status: 500 })
    }

    // 5. Record the activity.
    //
    // stamp_events is now read-only — activity_events is the source of truth.
    //
    // Dual-write ran from 2026-08-08 and reconciled exactly across the whole
    // window (matching row counts and stamp totals per member, no orphans on
    // either side), so the legacy write has been removed. The stamp_events
    // TABLE is deliberately kept as the historical record; nothing writes to it
    // any more.
    //
    // AWAITED, and its failure fails the request. While this was a mirror it
    // was fire-and-forget on purpose — a failed copy must not cost the cashier
    // their stamp. Now it is the only record of the stamp, so silently
    // swallowing an error would award a member nothing while telling the
    // cashier it worked.
    //
    // Column semantics: a store visit awards 1 base stamp, scaled by the
    // member's tier multiplier, so effective_stamps is what the old
    // stamp_events.stamp_count held and is the column to sum. The Phase 1
    // backfill could not recover that split, so those rows carry
    // multiplier_applied = 1.00 with the total in stamps_awarded; live rows are
    // distinguishable by migrated_from IS NULL.
    const awardedAt = new Date().toISOString()

    if (!member.origin_store_id || !member.origin_merchant_id) {
      // activity_events.origin_* are NOT NULL, so there is no row to write.
      // This used to be a warning and a skip, which was survivable while
      // stamp_events still captured the stamp — now it would lose it entirely.
      // The visit row inserted above is rolled back so the member is not left
      // blocked by the once-per-day guard for a stamp they never received.
      console.error(
        `[stamp] member ${memberId} has no origin attribution — cannot record activity`,
      )
      await supabase.from('visits')
        .delete()
        .eq('member_id', memberId)
        .eq('store_id', storeId)
        .eq('date', today)
      return NextResponse.json({ error: 'member_missing_origin' }, { status: 500 })
    }

    const { error: activityError } = await admin.from('activity_events').insert({
      member_id:          memberId,
      store_id:           storeId,
      merchant_id:        merchantId,
      origin_store_id:    member.origin_store_id,
      origin_merchant_id: member.origin_merchant_id,
      participant_type:   'bin_store',
      activity_type:      'store_visit',
      stamps_awarded:     1,
      multiplier_applied: stampsToAward,   // base is always 1 visit stamp
      effective_stamps:   stampsToAward,
      occurred_at:        awardedAt,
      cashier_id:         cashierId,
      migrated_from:      null,   // null = live event, not backfill
      source_record_id:   null,
    })

    if (activityError) {
      console.error('[stamp] activity_events insert failed:', activityError)
      await supabase.from('visits')
        .delete()
        .eq('member_id', memberId)
        .eq('store_id', storeId)
        .eq('date', today)
      return NextResponse.json({ error: 'stamp_not_recorded' }, { status: 500 })
    }

    // 6. Update total_stamps and detect tier milestones
    const newTotalStamps = totalStamps + stampsToAward

    const justLeveledUp =
      (newTotalStamps >= 200 && totalStamps < 200) ? 'silver' :
      (newTotalStamps >= 750 && totalStamps < 750) ? 'gold'   :
      (newTotalStamps >= 2000 && totalStamps < 2000) ? 'diamond' : null

    const approachingLevelUp =
      (totalStamps < 200  && newTotalStamps >= 180)  ? 'silver'  :
      (totalStamps < 750  && newTotalStamps >= 730)  ? 'gold'    :
      (totalStamps < 2000 && newTotalStamps >= 1980) ? 'diamond' : null
    await supabase
      .from('members')
      .update({ total_stamps: newTotalStamps })
      .eq('id', memberId)

    // 7. Check if coupon earned
    const oldCycle = totalStamps % 20
    const newCycle = newTotalStamps % 20
    const couponEarned = newCycle < oldCycle || newCycle === 0

    // 8. Determine coupon value (thresholds match VIP tier levels)
    //    Bronze VIP (0-199) = , Starter free (any) = 
    const couponValue =
      newTotalStamps >= 2000 ? 15 :
      newTotalStamps >= 750  ? 12 :
      newTotalStamps >= 200  ? 10 :
      member.subscription_status === 'free' ? 5 : 7

    // Only issue the coupon if the stamp threshold was crossed AND the member
    // is eligible. Free members get exactly one lifetime coupon (Core Rule #12).
    const couponIssued = couponEarned && !isFreeMemberCouponExhausted

    if (couponIssued) {
      await supabase.from('rewards').insert({
        member_id:             memberId,
        merchant_id:           merchantId,
        store_id:              storeId,
        issued_at_location_id: storeId,
        coupon_value:          couponValue,
        reward_type:           'visit_reward',
        status:                'earned',
        earned_at:             new Date().toISOString(),
      })
      await supabase
        .from('members')
        .update({ coupon_due: true })
        .eq('id', memberId)
    }

    // 8a. Notify the member.
    //
    //     AWAITED but never fatal: createAlert swallows its own errors. The
    //     stamp and the reward are already written — failing to tell someone
    //     about a reward they have must not undo the reward.
    //
    //     Awaited rather than fire-and-forget because Vercel can freeze the
    //     instance the moment this handler returns, which is what silently
    //     drops un-awaited work (see the GHL note below).
    if (couponIssued) {
      await createAlert(admin, couponReadyAlert(memberId, couponValue, storeId))
    }
    if (justLeveledUp) {
      await createAlert(admin, tierUpAlert(memberId, justLeveledUp, storeId))
    }

    // 9. Redeem existing coupon if coupon_due was true
    let couponRedeemed = false
    if (member.coupon_due) {
      await supabase
        .from('rewards')
        .update({
          status:                  'redeemed',
          redeemed_at:             new Date().toISOString(),
          redeemed_at_location_id: storeId,
          redeemed_by:             cashierId,
        })
        .eq('member_id', memberId)
        .eq('status', 'earned')

      await supabase
        .from('members')
        .update({ coupon_due: false })
        .eq('id', memberId)

      couponRedeemed = true
    }

    // 9a. Referral bonus — 2 stamps to this member and 2 to whoever referred
    //     them, if this is their first visit and a referral is waiting.
    //
    //     AFTER the stamp is fully written, and unable to affect it: it never
    //     throws, and a failure there costs the member nothing they earned
    //     here. With no referral pending — every stamp but one per referred
    //     member — it is a single read. Its bonus stamps go to their own rows
    //     and their own total update, so newTotalStamps below is this visit's
    //     result and referralBonusStamps says what was added on top.
    const referralBonus = await awardReferralBonusIfDue(admin, memberId)

    // 10. Post-visit review request to GHL.
    //
    //     AFTER THE RESPONSE, AND KEPT ALIVE UNTIL IT LANDS. The cashier is
    //     standing at the counter with a member in front of them, so this must
    //     not delay the stamp — but it used to be a bare `void postToGhl(...)`,
    //     and on Vercel the instance is frozen the moment this handler returns.
    //     The request was suspended mid-flight and never reached GHL; its 5s
    //     timeout then fired whenever the next request woke the instance, and
    //     was logged against THAT request. Production logs showed exactly that
    //     for both of the last two real stamps (2026-09-08, 2026-09-17).
    //
    //     waitUntil tells Vercel to keep the function running after the
    //     response until the promise settles. postToGhl gives up after 5s, so
    //     the function cannot be held past that. Off Vercel it is a no-op and
    //     the promise simply runs, which is all a dev server needs.
    //
    //     ONLY TO MEMBERS WHO OPTED IN TO SMS. A review request is a
    //     solicitation, not something the member asked for, so it respects
    //     sms_opt_in — strictly: only an explicit true sends. The GHL workflow
    //     sends the email from the same trigger, so an opted-out member gets
    //     neither.
    //
    //     storeName, not storeId: the GHL templates need something a person
    //     can read, and an id is meaningless in a text message. Looked up
    //     inside the background task so it adds nothing to the cashier's wait.
    const postVisitUrl = process.env.GHL_POST_VISIT_WEBHOOK_URL
    if (postVisitUrl && member.sms_opt_in === true) {
      const feedbackUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.binperks.com') + '/member/feedback'

      waitUntil((async () => {
        try {
          const { data: store } = await admin
            .from('stores')
            .select('display_name')
            .eq('id', storeId)
            .maybeSingle()

          await postToGhl(postVisitUrl, {
            memberId,
            firstName:   member.first_name,
            phone:       member.phone,
            storeName:   store?.display_name ?? null,
            feedbackUrl,
          }, 'stamp post-visit')
        } catch (err) {
          // postToGhl never throws; this covers the store lookup. Caught here
          // because nothing awaits this promise to catch it for us.
          console.error('[stamp post-visit] background task failed:', err)
        }
      })())
    } else if (postVisitUrl) {
      // Logged so "why didn't they get a review text?" has an answer in the
      // logs rather than a silence.
      console.info(`[stamp post-visit] skipped for member ${memberId}: SMS opt-in is off`)
    }

    return NextResponse.json({
      newTotalStamps,
      stampCount: stampsToAward,
      couponIssued,
      couponRedeemed,
      couponValue,
      freeCouponExhausted: isFreeMemberCouponExhausted,
      justLeveledUp,
      approachingLevelUp,
      isVip: member.subscription_status === 'vip',
      // 0 on every stamp but a referred member's first. The stamp tool does not
      // show it yet; it is here so it can without another round trip.
      referralBonusStamps: referralBonus.referredStamps,
    })

  } catch (err) {
    console.error('[/api/stamp] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
