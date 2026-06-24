import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const { memberId, storeId, cashierId, merchantId } = await req.json()

    if (!memberId || !storeId || !cashierId || !merchantId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = await createServerSupabaseClient()
    const today = new Date().toISOString().split('T')[0]

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

    // 2. Get member current stamps and coupon_due
    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('total_stamps, coupon_due')
      .eq('id', memberId)
      .single()

    if (memberError || !member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    // 3. Calculate tier multiplier
    const totalStamps = member.total_stamps
    const multiplier =
      totalStamps >= 1000 ? 5 :
      totalStamps >= 500  ? 4 :
      totalStamps >= 300  ? 3 :
      totalStamps >= 100  ? 2 : 1

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
    await supabase
      .from('stamp_events')
      .insert({
        member_id:   memberId,
        store_id:    storeId,
        merchant_id: merchantId,
        cashier_id:  cashierId,
        event_type:  'visit',
        stamp_count: multiplier,
        awarded_at:  new Date().toISOString(),
      })

    // 6. Update total_stamps
    const newTotalStamps = totalStamps + multiplier
    await supabase
      .from('members')
      .update({ total_stamps: newTotalStamps })
      .eq('id', memberId)

    // 7. Check if coupon earned
    const oldCycle = totalStamps % 20
    const newCycle = newTotalStamps % 20
    const couponIssued = newCycle < oldCycle || newCycle === 0

    // 8. Determine coupon value
    const couponValue =
      newTotalStamps >= 1000 ? 15 :
      newTotalStamps >= 500  ? 12 :
      newTotalStamps >= 300  ? 10 :
      newTotalStamps >= 100  ? 7  : 5

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

    return NextResponse.json({
      newTotalStamps,
      couponIssued,
      couponRedeemed,
      couponValue,
    })

  } catch (err) {
    console.error('[/api/stamp] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}