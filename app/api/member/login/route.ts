/**
 * POST /api/member/login
 *
 * Step 1 of passwordless member sign-in. The member submits their phone
 * number; we resolve the matching member record(s) and issue an 8-digit SMS
 * code via lib/member-otp (see that file for the Redis keys and why the
 * Supabase token stays server-side). The member types the code back into the
 * login page, which POSTs to /api/member/verify-code.
 *
 * The 404 on an unknown phone is also what the combined sign-in/join flow on
 * the home page keys off to decide a caller is a new member.
 *
 * Members are merchant-scoped, so the same phone number can legitimately
 * belong to more than one merchant's member list. We never reveal which —
 * we just disambiguate by store so the member can pick the right one.
 *
 * Request body:
 *   { phone: string (digits), memberId?: string }
 *   memberId is passed on the second request, after the member picks one of
 *   several matching accounts.
 *
 * Responses:
 *   200 { ok: true }
 *   200 { ok: false, error: 'multiple_accounts', accounts: [...] }
 *   404 { error: 'not_found' }
 *   400 { error: string }
 *   429 { error: string }  — rate limited
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { issueMemberOtp, redisClient } from '@/lib/member-otp'

interface LoginRequest {
  phone: string
  memberId?: string
}

interface MemberRow {
  id: string
  email: string
  first_name: string
  auth_user_id: string | null
  is_blacklisted: boolean
  home_store_id: string
  merchant_id: string
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Partial<LoginRequest>
    const phone = body.phone?.replace(/\D/g, '')
    const { memberId } = body

    if (!phone || phone.length !== 10) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
    }

    // Rate limiting: max 5 code requests per phone per 15-minute window.
    // Covers both the initial send and the "Resend code" button. Prevents SMS
    // credit abuse and phone enumeration via timing differences.
    const redis = redisClient()
    const rateLimitKey = `ratelimit:login:${phone}`
    const requests = await redis.incr(rateLimitKey)
    if (requests === 1) {
      await redis.expire(rateLimitKey, 15 * 60) // 15-minute window
    }
    if (requests > 5) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait 15 minutes before requesting a new sign-in code.' },
        { status: 429 }
      )
    }

    // This is a public endpoint (no Supabase session). Use admin client for
    // all table reads so RLS does not block member lookups. The phone number
    // is the authentication token on this route.
    const admin = createAdminSupabaseClient()

    let member: MemberRow | null = null

    if (memberId) {
      const { data } = await admin
        .from('members')
        .select('id, email, first_name, auth_user_id, is_blacklisted, home_store_id, merchant_id')
        .eq('id', memberId)
        .eq('phone', phone)
        .eq('status', 'active')
        .single()
      member = data ?? null
    } else {
      const { data: matches } = await admin
        .from('members')
        .select('id, email, first_name, auth_user_id, is_blacklisted, home_store_id, merchant_id')
        .eq('phone', phone)
        .eq('status', 'active')

      if (!matches || matches.length === 0) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 })
      }

      if (matches.length > 1) {
        const storeIds = matches.map(m => m.home_store_id)
        const { data: stores } = await admin
          .from('stores')
          .select('id, display_name, brand_name, brand_color')
          .in('id', storeIds)

        const accounts = matches.map(m => {
          const store = stores?.find(s => s.id === m.home_store_id)
          return {
            memberId:   m.id,
            storeName:  store?.display_name ?? 'BinPerks',
            brandName:  store?.brand_name ?? 'BinPerks',
            brandColor: store?.brand_color ?? '#4A4B98',
          }
        })

        return NextResponse.json({ ok: false, error: 'multiple_accounts', accounts })
      }

      member = matches[0] as MemberRow
    }

    if (!member) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    const issued = await issueMemberOtp({
      admin,
      redis,
      memberId:   member.id,
      phone,
      firstName:  member.first_name,
      email:      member.email,
      authUserId: member.auth_user_id,
    })

    if (!issued.ok) {
      return NextResponse.json({ error: 'Failed to generate sign-in code' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error('[/api/member/login] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
