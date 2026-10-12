import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import bcrypt from 'bcryptjs'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { postToGhl, memberOptedIntoSms } from '@/lib/ghl-webhook'
import { createAlert, couponReadyAlert, tierUpAlert } from '@/lib/member-alerts'
import { awardReferralBonusIfDue } from '@/lib/referral-bonus'
import { askedRecently, createReviewRequest, isSafeRedirectUrl } from '@/lib/review-link'
import { TIERS, tierFor, applyCycle } from '@/lib/tiers'
import { canAwardStamps, CANNOT_STAMP_MESSAGE } from '@/lib/merchant-status'
import { transferOriginIfDue } from '@/lib/origin-transfer'
import { recordCouponRedemption, isSpendable } from '@/lib/coupon-settlement'

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
    //
    // '$2' IS THE BCRYPT PREFIX — every bcrypt hash starts $2a$, $2b$ or $2y$.
    // The test was `startsWith('')`, which every string passes, so a legacy
    // plaintext PIN was handed to bcrypt.compare and could never match: that
    // cashier simply could not stamp. Today every active PIN is hashed, so
    // nothing was failing in practice — but the fallback would have been dead
    // the moment a plaintext PIN existed again.
    const storedPin: string = cashier.pin ?? ''
    const isHash = storedPin.startsWith('$2')
    const pinValid = isHash
      ? await bcrypt.compare(pin, storedPin)
      : storedPin === pin  // legacy plaintext fallback

    if (!pinValid) {
      return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 })
    }

    const merchantId = cashier.merchant_id

    // 0a. MAY THIS STORE STAMP AT ALL?
    //
    //     A merchant in its 30-day grace period still can — nothing changes
    //     for the member or the cashier while a payment is being chased. Once
    //     the grace period runs out the account is inactive and every one of
    //     its stores stops, because a stamp is a promise to fund a coupon
    //     later and an unpaid merchant cannot keep making them.
    //
    //     Checked here rather than in the stamp tool because the tool is not
    //     enforcement: this route is a plain POST.
    const { data: stampingMerchant } = await admin
      .from('merchants')
      .select('billing_status, admin_suspended')
      .eq('id', merchantId)
      .maybeSingle()

    if (!canAwardStamps(stampingMerchant)) {
      return NextResponse.json(
        { error: 'store_cannot_stamp', message: CANNOT_STAMP_MESSAGE },
        { status: 403 },
      )
    }

    // 0b. Load the member and decide whether they may be stamped HERE.
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
      .select('total_stamps, cycle_stamps, vip_progression_stamps, coupon_due, subscription_status, first_name, last_name, email, phone, sms_opt_in, status, is_blacklisted, origin_store_id, origin_merchant_id')
      .eq('id', memberId)
      .single()

    if (memberError || !member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    if (member.status !== 'active' || member.is_blacklisted) {
      return NextResponse.json({ error: 'member_inactive' }, { status: 403 })
    }

    // 0c. ORIGIN TRANSFER, BEFORE ANYTHING IS WRITTEN.
    //
    //     A member whose origin merchant has gone inactive — or who joined
    //     through BinPerks directly and has never been stamped anywhere —
    //     is attributed to this store from this stamp forward. Done first so
    //     the visit, the activity row, any coupon this visit completes and
    //     every commission afterwards all belong to the store that earned
    //     them. Nothing already settled moves, and a merchant that later pays
    //     up does not get the member back.
    const origin = await transferOriginIfDue(
      admin,
      { id: memberId, origin_store_id: member.origin_store_id, origin_merchant_id: member.origin_merchant_id },
      storeId,
      merchantId,
    )

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

    // 2a. NO CAP. A free member earns for as long as they keep shopping: a $5
    //     coupon every 20 stamps, for good. This is where the old "one
    //     lifetime coupon, then blocked past 20 stamps" rule lived — it
    //     counted redeemed rewards and refused the stamp outright, so a free
    //     member's 21st visit returned free_coupon_exhausted and awarded them
    //     nothing. Free membership is permanent now.

    // 3. What this visit is worth.
    //
    //    The tier comes from VIP PROGRESSION stamps, never from the lifetime
    //    count: stamps earned while free do not buy a VIP tier. A free member
    //    is Starter at 1x however long their history.
    //
    //    Two passes, as before: a visit that carries a member over a tier
    //    threshold pays at the NEW tier (crossing into Silver earns 3, not 2).
    //    Only VIP progression can cross a threshold, so the second pass is
    //    VIP-only.
    const totalStamps = member.total_stamps
    const cycleStamps = member.cycle_stamps ?? 0
    const progression = member.vip_progression_stamps ?? 0
    const isVip       = member.subscription_status === 'vip'

    const tierBefore = tierFor({
      vipProgressionStamps: progression,
      subscriptionStatus:   member.subscription_status,
    })
    const stampsToAward = isVip
      ? tierFor({
          vipProgressionStamps: progression + tierBefore.multiplier,
          subscriptionStatus:   member.subscription_status,
        }).multiplier
      : tierBefore.multiplier

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

    if (!origin.originStoreId || !origin.originMerchantId) {
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
      origin_store_id:    origin.originStoreId,
      origin_merchant_id: origin.originMerchantId,
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

    // 6. Move the three counters.
    //
    //    LIFETIME never resets. VIP PROGRESSION moves only while they are VIP,
    //    and never moves backwards — a member who cancels keeps the tier they
    //    climbed to and resumes from there if they return. THE CYCLE is what
    //    coupons are paid from, and an upgrade does not touch it: 14 of 20
    //    toward a $5 coupon becomes 14 of 20 toward a $7 one.
    const newTotalStamps = totalStamps + stampsToAward
    const newProgression = isVip ? progression + stampsToAward : progression
    const cycle          = applyCycle(cycleStamps, stampsToAward)

    const tierAfter = tierFor({
      vipProgressionStamps: newProgression,
      subscriptionStatus:   member.subscription_status,
    })

    // Lower-cased for the alert copy, which reads "silver" / "gold" /
    // "diamond". Bronze is where a VIP starts, so it is never a level-up.
    const justLeveledUp: 'silver' | 'gold' | 'diamond' | null =
      tierAfter.name !== tierBefore.name
      && (tierAfter.name === 'Silver' || tierAfter.name === 'Gold' || tierAfter.name === 'Diamond')
        ? (tierAfter.name.toLowerCase() as 'silver' | 'gold' | 'diamond')
        : null

    // Within 20 progression stamps of the next rung — the nudge the stamp
    // tool prints. The thresholds come from lib/tiers rather than numbers
    // typed here: this test and the multiplier above each used to carry their
    // own copy of 200 / 750 / 2000.
    const nextRung = isVip
      ? TIERS.find(t => newProgression < t.minStamps && newProgression >= t.minStamps - 20)
      : undefined
    const approachingLevelUp = nextRung
      ? (nextRung.name.toLowerCase() as 'silver' | 'gold' | 'diamond')
      : null

    await supabase
      .from('members')
      .update({
        total_stamps:           newTotalStamps,
        cycle_stamps:           cycle.cycleStamps,
        vip_progression_stamps: newProgression,
      })
      .eq('id', memberId)

    // 7/8. Coupons. One per completed cycle — more than one is possible when
    //      a visit carries the cycle past 20 twice, which a Diamond member's
    //      5 stamps on an 18/20 cycle does. The old `total % 20` test could
    //      only ever notice one.
    //
    //      Each is worth the member's tier AFTER this visit, which is what
    //      makes a cycle carried through an upgrade pay out at the new rate.
    const couponsEarned = cycle.couponsEarned
    const couponValue   = tierAfter.couponValue
    const couponIssued  = couponsEarned > 0

    if (couponIssued) {
      const earnedAt = new Date().toISOString()
      await supabase.from('rewards').insert(
        Array.from({ length: couponsEarned }, () => ({
          member_id:             memberId,
          merchant_id:           merchantId,
          store_id:              storeId,
          issued_at_location_id: storeId,
          coupon_value:          couponValue,
          reward_type:           'visit_reward',
          status:                'earned',
          earned_at:             earnedAt,
          // WHO PAYS, frozen now. The member's origin as at this moment —
          // which, after the transfer above, is this store if the old one had
          // gone inactive. A cycle that began elsewhere is owed in full by
          // whoever is the origin when it completes.
          funding_store_id:      origin.originStoreId,
          funding_merchant_id:   origin.originMerchantId,
        })),
      )
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

    // 9. Redeem ONE coupon if the member had one waiting.
    //
    //    ONE, OLDEST FIRST. This used to update every row with status
    //    'earned', which redeemed a member's whole stack in a single
    //    transaction — survivable while a free member could only ever hold
    //    one, and wrong the moment they can hold several. The member hands
    //    over one coupon at the counter and one is what gets marked.
    //
    //    An expired coupon is not redeemable and is passed over rather than
    //    spent; the sweep in the reactivation cron closes it out.
    let couponRedeemed = false
    let redeemedValue: number | null = null

    if (member.coupon_due) {
      const { data: open } = await admin
        .from('rewards')
        .select('id, member_id, coupon_value, status, expires_at, funding_store_id, funding_merchant_id')
        .eq('member_id', memberId)
        .eq('status', 'earned')
        .order('earned_at', { ascending: true })

      const spendable = (open ?? []).filter(r => isSpendable(r as { status: string; expires_at?: string | null }))
      const toRedeem  = spendable[0]

      if (toRedeem) {
        const redeemedAt = new Date()
        const { data: claimed } = await admin
          .from('rewards')
          .update({
            status:                  'redeemed',
            redeemed_at:             redeemedAt.toISOString(),
            redeemed_at_location_id: storeId,
            redeemed_by:             cashierId,
          })
          .eq('id', toRedeem.id)
          // Compare-and-set: two tills cannot spend the same coupon twice.
          .eq('status', 'earned')
          .select('id')

        if (claimed && claimed.length > 0) {
          couponRedeemed = true
          redeemedValue  = Number(toRedeem.coupon_value ?? 0)

          // Who owes whom. Nothing is written when the store that funded the
          // coupon is the store honouring it — see lib/coupon-settlement.
          await recordCouponRedemption(
            admin,
            toRedeem as unknown as Parameters<typeof recordCouponRedemption>[1],
            storeId,
            merchantId,
            redeemedAt,
          )
        }
      }

      // coupon_due reflects whether anything spendable is still waiting, so a
      // member holding two coupons keeps the flag after spending one.
      const stillWaiting = spendable.filter(r => r.id !== toRedeem?.id).length > 0
      if (!stillWaiting) {
        await supabase
          .from('members')
          .update({ coupon_due: false })
          .eq('id', memberId)
      }
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

    // 10. "Member got a stamp" message to GHL, with a review link when due.
    //
    //     REPLACES the old post-visit review request, which pointed at the
    //     Wow/Meh/Bad page. This one tells the member about their stamp and,
    //     no more than once a month per store, asks for a review through a
    //     tracked link — see lib/review-link.
    //
    //     CASHIER STAMPS ONLY. A register-QR signup stamp is written by
    //     /api/join/create and never passes through here, so it can never send
    //     this — the member is standing at the counter creating their account,
    //     not finishing a visit.
    //
    //     AFTER THE RESPONSE, KEPT ALIVE UNTIL IT LANDS. waitUntil holds the
    //     function open past the response so the request is not frozen
    //     mid-flight — the failure that silently dropped every post-visit
    //     message before 2026-09-21. The cashier waits for none of it: the
    //     store lookup, the 30-day check and the link are all in here too.
    //
    //     ONLY TO MEMBERS WHO OPTED IN TO SMS, strictly — only an explicit
    //     true. Nothing is recorded for anyone else, so a member who is not
    //     messaged is not counted as asked and is not put on a 30-day hold.
    //
    //     NOTHING IS RECORDED WITHOUT A WEBHOOK TO SEND IT TO, for the same
    //     reason: a review request that went nowhere would count as sent and
    //     hold the member back from the next real one.
    const gotStampUrl = process.env.GHL_MEMBER_GOT_STAMP_WEBHOOK_URL
    if (!gotStampUrl) {
      console.warn('[stamp got-stamp] GHL_MEMBER_GOT_STAMP_WEBHOOK_URL is not set — stamp message and review link skipped')
    } else if (!memberOptedIntoSms({ id: memberId, sms_opt_in: member.sms_opt_in }, 'stamp got-stamp')) {
      // Nothing to do — memberOptedIntoSms logged why. Same rule as the VIP
      // and referral messages, from one place.
    } else {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.binperks.com'

      waitUntil((async () => {
        try {
          const { data: store } = await admin
            .from('stores')
            .select('display_name, google_review_url, timezone')
            .eq('id', storeId)
            .maybeSingle()

          // A review link only for a store with a usable review page, and
          // only if this member has not been asked here in the last 30 days.
          // Otherwise '' — the stamp message still goes out without the ask.
          let feedbackUrl = ''
          const reviewUrl = store?.google_review_url?.trim()
          if (isSafeRedirectUrl(reviewUrl) && !(await askedRecently(admin, memberId, storeId))) {
            feedbackUrl = await createReviewRequest(admin, {
              memberId,
              storeId,
              reviewUrl,
              timezone: store?.timezone,
              appUrl,
            })
          }

          await postToGhl(gotStampUrl, {
            phone:       member.phone,
            firstName:   member.first_name,
            lastName:    member.last_name,
            email:       member.email,
            storeName:   store?.display_name ?? '',
            feedbackUrl,
          }, 'stamp got-stamp')
        } catch (err) {
          // postToGhl never throws; this covers the lookups and the link.
          // Caught here because nothing awaits this promise to catch it.
          console.error('[stamp got-stamp] background task failed:', err)
        }
      })())
    }

    return NextResponse.json({
      newTotalStamps,
      stampCount: stampsToAward,
      couponIssued,
      couponRedeemed,
      // The face value actually handed over, which is not always the tier
      // value: a $2 reactivation coupon is redeemed the same way.
      redeemedCouponValue: redeemedValue,
      couponValue,
      // How many cycles this visit completed. More than one is rare but real.
      couponsIssued: couponsEarned,
      // The counters, so the stamp tool shows progress without recomputing it
      // from the lifetime total — which is no longer the cycle.
      cycleStamps: cycle.cycleStamps,
      vipProgressionStamps: newProgression,
      tierName: tierAfter.name,
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
