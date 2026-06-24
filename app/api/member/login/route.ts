/**
 * POST /api/member/login
 *
 * Passwordless member login. Member submits their phone number; we resolve
 * the matching member record(s), mint a Supabase magic link via the admin
 * client, and (once the Express/GHL webhook exists) hand it to GHL so it can
 * be delivered by SMS — Supabase's own phone provider is OFF, GHL/Twilio
 * sends all member SMS per the locked Auth Architecture.
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
 *   200 { ok: false, error: 'multiple_accounts', accounts: [{ memberId, storeName, brandName, brandColor }] }
 *   404 { error: 'not_found' }
 *   400 { error: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

const APP_URL = 'https://app.binperks.com'

interface LoginRequest {
  phone: string
  memberId?: string
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Partial<LoginRequest>
    const phone = body.phone?.replace(/\D/g, '')
    const { memberId } = body

    if (!phone || phone.length !== 10) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
    }

    const supabase = await createServerSupabaseClient()

    let member: {
      id: string
      email: string
      first_name: string
      auth_user_id: string | null
      is_blacklisted: boolean
      home_store_id: string
    } | null = null

    if (memberId) {
      // Disambiguated request — fetch the exact account chosen.
      const { data } = await supabase
        .from('members')
        .select('id, email, first_name, auth_user_id, is_blacklisted, home_store_id, phone')
        .eq('id', memberId)
        .eq('phone', phone)
        .eq('status', 'active')
        .single()
      member = data ?? null
    } else {
      // Only return active members — deactivated accounts get the same
      // "not_found" 404 response so they can't receive new magic links.
      const { data: matches } = await supabase
        .from('members')
        .select('id, email, first_name, auth_user_id, is_blacklisted, home_store_id, merchant_id')
        .eq('phone', phone)
        .eq('status', 'active')

      if (!matches || matches.length === 0) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 })
      }

      if (matches.length > 1) {
        // Multiple merchants share this phone — let the member pick their store,
        // without revealing anything else about the other accounts.
        const storeIds = matches.map(m => m.home_store_id)
        const { data: stores } = await supabase
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

      member = matches[0] as typeof member as any
    }

    if (!member) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    // Blacklisted members can still receive a login link — the dashboard
    // itself shows a generic "account unavailable" state. Never reveal the
    // reason here (same rule as the cashier-facing stamp tool).

    const admin = createAdminSupabaseClient()
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: member.email,
      options: {
        redirectTo: `${APP_URL}/auth/callback?next=/member/dashboard`,
      },
    })

    if (linkError || !linkData) {
      console.error('[/api/member/login] generateLink error:', linkError)
      return NextResponse.json({ error: 'Failed to generate login link' }, { status: 500 })
    }

    // TODO: POST to GHL webhook once the Express route exists:
    //   POST https://your-backend.com/webhooks/ghl/member-login
    //   { memberId: member.id, phone, firstName: member.first_name, magicLink: linkData.properties.action_link }
    //   GHL sends the SMS containing the link. Supabase never sends it directly
    //   (phone provider is OFF).

    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error('[/api/member/login] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
