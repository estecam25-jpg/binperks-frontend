/**
 * POST /api/member/login
 *
 * Step 1 of passwordless member sign-in. The member submits their phone
 * number; we resolve the matching member record(s), mint a Supabase magic-link
 * token via the admin client, then issue our own 8-digit code that maps to
 * that token in Redis. GHL/Twilio delivers the code by SMS — Supabase's phone
 * provider is OFF permanently, GHL sends all member SMS per the locked Auth
 * Architecture.
 *
 * The Supabase hashed_token never leaves the server and never appears in a
 * URL. The member proves possession of the phone by typing the 8-digit code
 * back into the login page, which POSTs to /api/member/verify-code.
 *
 * Redis keys written (all 10-minute TTL, keyed by phone):
 *   member_otp:{phone}          → the 8-digit code
 *   member_token:{phone}        → the Supabase hashed_token
 *   member_otp_attempts:{phone} → cleared here, incremented by verify-code
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
import { Redis } from '@upstash/redis'
import { randomInt } from 'node:crypto'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

const APP_URL = 'https://app.binperks.com'

/** Code lifetime in Redis. Shorter than Supabase's own token expiry (~60 min)
 *  so the code is always the binding constraint. */
const OTP_TTL_SECONDS = 10 * 60

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

/** 8-digit numeric code, 10000000–99999999. Uses crypto rather than
 *  Math.random() because this value is an authentication credential. */
function generateOtpCode(): string {
  return randomInt(10_000_000, 100_000_000).toString()
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
    const redis = new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    })
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

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: member.email,
      options: {
        redirectTo: `${APP_URL}/auth/callback?next=/member/dashboard`,
      },
    })

    if (linkError || !linkData) {
      console.error('[/api/member/login] generateLink error:', linkError)
      return NextResponse.json({ error: 'Failed to generate sign-in code' }, { status: 500 })
    }

    // Pair our 8-digit code with the Supabase token in Redis. Both expire
    // together; the attempt counter resets so a resend gives a clean slate.
    const code = generateOtpCode()
    try {
      await Promise.all([
        redis.set(`member_otp:${phone}`, code, { ex: OTP_TTL_SECONDS }),
        redis.set(`member_token:${phone}`, linkData.properties.hashed_token, { ex: OTP_TTL_SECONDS }),
        redis.del(`member_otp_attempts:${phone}`),
      ])
    } catch (err) {
      console.error('[/api/member/login] Redis write error:', err)
      return NextResponse.json({ error: 'Failed to generate sign-in code' }, { status: 500 })
    }

    // Awaited: send the code to the member via GHL → SMS.
    // GHL template: "Your BinPerks sign-in code is: {{code}}. Expires in 10 minutes."
    const ghlWebhook = process.env.GHL_MAGIC_LINK_WEBHOOK_URL
    if (ghlWebhook) {
      try {
        await fetch(ghlWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            memberId:  member.id,
            phone,
            firstName: member.first_name,
            code,
          }),
        })
      } catch (err) {
        console.error('[/api/member/login] GHL webhook error:', err)
      }
    }

    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error('[/api/member/login] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
