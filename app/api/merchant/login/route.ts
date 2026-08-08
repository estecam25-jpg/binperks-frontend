/**
 * POST /api/merchant/login
 *
 * Step 1 of merchant sign-in. Replaces the previous client-side
 * supabase.auth.signInWithOtp() call, which could only deliver by email and
 * used Supabase's own code. We now mint our own 8-digit code, keep the
 * Supabase magic-link token server-side, and deliver the code over two
 * channels: Resend for email, GHL/Twilio for SMS.
 *
 * ON THE SMS CHANNEL: `merchants.phone` is nullable and not every merchant
 * has one on file, so SMS is best-effort rather than guaranteed. The response
 * reports which channels actually went out (`sentEmail` / `sentSms`) so the
 * UI can tell the merchant the truth instead of promising a text that was
 * never sent.
 *
 * Request body: { email: string }
 *
 * Responses:
 *   200 { ok: true, sentEmail: boolean, sentSms: boolean }
 *   400 { error: 'invalid_email' }
 *   404 { error: 'not_found' }      — no merchant with that owner_email
 *   429 { error: string }           — rate limited
 *   500 { error: 'send_failed' }    — code minted but no channel delivered it
 */

import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import {
  merchantOtpKeys,
  normalizeMerchantEmail,
  generateOtpCode,
  redisClient,
  OTP_TTL_SECONDS,
} from '@/lib/merchant-otp'
import { postToGhl } from '@/lib/ghl-webhook'

const APP_URL = 'https://app.binperks.com'

/** Overridable without a deploy. The default sits on feedback.binperks.com
 *  because that is currently the only Resend-verified sending domain. */
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'BinPerks <noreply@feedback.binperks.com>'

/** Same budget as the member flow: covers the first send plus resends, and
 *  keeps this from becoming a free email/SMS cannon pointed at a merchant. */
const MAX_SENDS_PER_WINDOW = 5
const RATE_LIMIT_WINDOW_SECONDS = 15 * 60

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null) as { email?: string } | null
    const email = normalizeMerchantEmail(body?.email ?? '')

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
    }

    const redis = redisClient()

    const rateLimitKey = `ratelimit:merchant_login:${email}`
    const sends = await redis.incr(rateLimitKey)
    if (sends === 1) await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW_SECONDS)
    if (sends > MAX_SENDS_PER_WINDOW) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait 15 minutes before requesting a new sign-in code.' },
        { status: 429 }
      )
    }

    // Public endpoint (no session yet), so all reads go through the admin
    // client (CLAUDE.md CRITICAL RLS RULE).
    const admin = createAdminSupabaseClient()

    const { data: merchant } = await admin
      .from('merchants')
      .select('id, name, company_name, owner_email, phone, auth_user_id')
      .eq('owner_email', email)
      .maybeSingle()

    // Deliberately explicit rather than a silent 200. This is a three-merchant
    // B2B portal: telling someone their typo'd address isn't on file is worth
    // more than hiding which addresses are merchants. Flip to a blanket
    // { ok: true } if that trade ever stops being right.
    if (!merchant) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    // Phone comes straight off the merchant record. It is still optional —
    // only some merchants have one on file — so the SMS channel stays
    // conditional below.
    const phone = merchant.phone?.replace(/\D/g, '') || null
    const firstName = merchant.name?.trim() || merchant.company_name || 'there'

    // The Supabase side of auth is still a magic-link token; we simply never
    // send the link. The 8-digit code is our own handle for it, and the token
    // never leaves the server.
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `${APP_URL}/auth/callback?next=/merchant/dashboard` },
    })

    if (linkError || !linkData) {
      console.error('[/api/merchant/login] generateLink error:', linkError)
      return NextResponse.json({ error: 'send_failed' }, { status: 500 })
    }

    const code = generateOtpCode()
    const keys = merchantOtpKeys(email)

    try {
      await Promise.all([
        redis.set(keys.code, code, { ex: OTP_TTL_SECONDS }),
        redis.set(keys.token, linkData.properties.hashed_token, { ex: OTP_TTL_SECONDS }),
        merchant.auth_user_id
          ? redis.set(keys.authUser, merchant.auth_user_id, { ex: OTP_TTL_SECONDS })
          : redis.del(keys.authUser),
        redis.del(keys.attempts),
      ])
    } catch (err) {
      // Fatal: with no stored code there is nothing for verify-code to check.
      console.error('[/api/merchant/login] Redis write error:', err)
      return NextResponse.json({ error: 'send_failed' }, { status: 500 })
    }

    // ── Email (Resend) ──────────────────────────────────────────────────────
    // Awaited, because for a merchant with no phone on file this is the only
    // channel — if it fails there is nothing to fall back to.
    let sentEmail = false
    if (process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY)
        const { error: sendError } = await resend.emails.send({
          from: FROM_EMAIL,
          to: email,
          subject: 'Your BinPerks sign-in code',
          text: `Your BinPerks merchant sign-in code is: ${code}. Expires in 10 minutes.`,
        })
        if (sendError) console.error('[/api/merchant/login] Resend error:', sendError)
        else sentEmail = true
      } catch (err) {
        console.error('[/api/merchant/login] Resend threw:', err)
      }
    } else {
      console.error('[/api/merchant/login] RESEND_API_KEY not configured')
    }

    // ── SMS (GHL → Twilio) ──────────────────────────────────────────────────
    // AWAITED, matching lib/member-otp.ts. This was previously fire-and-forget
    // and that is what produced the ETIMEDOUT: once the handler returns,
    // Vercel is free to freeze or tear down the instance, so an unresolved
    // fetch is suspended mid-connection and the socket dies. The error
    // surfaces out of band, after the response, and the webhook never lands.
    //
    // Fire-and-forget is survivable for a welcome SMS. It is not survivable
    // for a sign-in code: if this call is dropped the merchant cannot log in.
    //
    // Skipped entirely without a phone number — posting phone: null would be a
    // guaranteed no-op that still looks like a send in the GHL logs.
    // postToGhl is bounded and never throws, so a slow or broken GHL costs the
    // SMS and nothing else — email has already gone out by this point. Its
    // return value is the source of truth for sentSms: an earlier version set
    // the flag before firing, so the UI told merchants a text was on its way
    // even when the call failed outright.
    let sentSms = false
    const ghlWebhook = process.env.GHL_MERCHANT_OTP_WEBHOOK_URL
    if (ghlWebhook && phone) {
      // GHL template: "Your BinPerks merchant sign-in code is: {{code}}."
      sentSms = await postToGhl(
        ghlWebhook,
        { merchantId: merchant.id, phone, firstName, code },
        '/api/merchant/login',
      )
    }

    // Every channel failed — the merchant has a live code they cannot see.
    if (!sentEmail && !sentSms) {
      return NextResponse.json({ error: 'send_failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, sentEmail, sentSms })

  } catch (err) {
    console.error('[/api/merchant/login] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
