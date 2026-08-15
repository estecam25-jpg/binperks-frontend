import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { postToGhl } from '@/lib/ghl-webhook'

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
      .select('total_stamps, coupon_due, subscription_status, first_name, phone, status, is_blacklisted, origin_store_id, origin_merchant_id')
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

    // 5. Insert stamp event
    const awardedAt = new Date().toISOString()

    await supabase
      .from('stamp_events')
      .insert({
        member_id:   memberId,
        store_id:    storeId,
        merchant_id: merchantId,
        cashier_id:  cashierId,
        event_type:  'visit',
        stamp_count: stampsToAward,
        awarded_at:  awardedAt,
      })

    // 5a. Dual-write to activity_events (V3 Phase 2).
    //     Fire-and-forget on purpose: the cashier's stamp must never fail or be
    //     delayed because the V3 mirror write failed. stamp_events stays the
    //     source of truth until the Phase 3 cutover.
    //
    //     Column semantics: a store visit awards 1 base stamp, scaled by the
    //     member's tier multiplier. effective_stamps therefore equals
    //     stamp_events.stamp_count and is the correct column to reconcile on.
    //     Note the Phase 1 backfill could not recover that split from
    //     stamp_events (which only stored the final count), so those 23 rows
    //     carry multiplier_applied = 1.00 with the total in stamps_awarded.
    //     Live rows are distinguishable by migrated_from IS NULL.
    if (!member.origin_store_id || !member.origin_merchant_id) {
      // Every member should have origin attribution after the Phase 1 backfill
      // and the V3 enrollment write. Missing values mean a gap worth chasing.
      console.warn(
        `[stamp] activity_events dual-write skipped — member ${memberId} has no origin attribution`,
      )
    } else {
      const multiplier = stampsToAward   // base is always 1 visit stamp

      admin.from('activity_events').insert({
        member_id:          memberId,
        store_id:           storeId,
        merchant_id:        merchantId,
        origin_store_id:    member.origin_store_id,
        origin_merchant_id: member.origin_merchant_id,
        participant_type:   'bin_store',
        activity_type:      'store_visit',
        stamps_awarded:     1,
        multiplier_applied: multiplier,
        effective_stamps:   stampsToAward,
        occurred_at:        awardedAt,
        cashier_id:         cashierId,
        migrated_from:      null,   // null = live event, not backfill
        source_record_id:   null,
      }).then(({ error }) => {
        if (error) console.error('[stamp] activity_events dual-write failed:', error)
      })
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

    // 10. Fire post-visit webhook to GHL (non-blocking)
    //     Triggers SMS prompt to leave a review / provide feedback
    //
    //     Deliberately NOT awaited: a cashier is standing at the counter with
    //     a member in front of them, and a review request is not worth adding
    //     up to 5s to every stamp. The bounded timeout is what keeps the
    //     un-awaited call from lingering.
    //
    //     KNOWN LIMITATION: fire-and-forget is unreliable on Vercel. The
    //     instance may be frozen the moment this handler returns, killing the
    //     request mid-flight, so some review requests are silently never
    //     delivered. The timeout bounds the call but does not fix delivery —
    //     only awaiting does, and that trade was rejected here. If review
    //     requests turn out to be going missing, the fix is a queue or a
    //     scheduled job, not a longer timeout.
    if (process.env.GHL_POST_VISIT_WEBHOOK_URL) {
      const feedbackUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.binperks.com') + '/member/feedback'
      void postToGhl(process.env.GHL_POST_VISIT_WEBHOOK_URL, {
        memberId,
        firstName:   member.first_name,
        phone:       member.phone,
        storeId,
        feedbackUrl,
      }, 'stamp post-visit')
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
    })

  } catch (err) {
    console.error('[/api/stamp] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
