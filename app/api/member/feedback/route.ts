/**
 * POST /api/member/feedback
 *
 * Member submits a rating ('wow' | 'meh' | 'mad') + optional notes.
 * 'bad' display label is mapped to 'mad' DB value here.
 *
 * For meh/mad WITH notes: fires GHL_FEEDBACK_WEBHOOK_URL (non-blocking).
 *
 * Auth: Supabase session cookie.
 * Request body: { rating: 'wow'|'meh'|'mad'|'bad', notes?: string }
 * Responses:
 *   200 { ok: true }
 *   401 { error: 'not_authenticated' }
 *   400 { error: string }
 *   404 { error: 'member_not_found' }
 *   500 { error: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

const VALID_RATINGS = ['wow', 'meh', 'mad']

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const body = await req.json()
  const { rating: rawRating, notes } = body as { rating?: string; notes?: string }

  // Map 'bad' display label → 'mad' DB value
  const rating = rawRating === 'bad' ? 'mad' : rawRating
  if (!rating || !VALID_RATINGS.includes(rating)) {
    return NextResponse.json({ error: 'Invalid rating' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()

  const { data: member, error: memberError } = await admin
    .from('members')
    .select('id, home_store_id, merchant_id, first_name, last_name')
    .eq('auth_user_id', user.id)
    .single()

  if (memberError || !member) {
    return NextResponse.json({ error: 'member_not_found' }, { status: 404 })
  }

  const { error: insertError } = await admin
    .from('feedback')
    .insert({
      member_id:    member.id,
      store_id:     member.home_store_id,
      rating,
      notes:        notes?.trim() || null,
      submitted_at: new Date().toISOString(),
    })

  if (insertError) {
    console.error('[/api/member/feedback] Insert error:', insertError)
    return NextResponse.json({ error: 'Failed to submit feedback' }, { status: 500 })
  }

  // For meh/mad with notes: fire GHL webhook (non-blocking, fire and forget)
  if ((rating === 'meh' || rating === 'mad') && notes?.trim() && process.env.GHL_FEEDBACK_WEBHOOK_URL) {
    const webhookUrl = process.env.GHL_FEEDBACK_WEBHOOK_URL
    const memberName = `${member.first_name} ${member.last_name}`
    const notesText = notes.trim()
    const storeId = member.home_store_id
    const merchantId = member.merchant_id;

    (async () => {
      try {
        const [{ data: store }, { data: merchant }] = await Promise.all([
          admin.from('stores').select('brand_name').eq('id', storeId).single(),
          merchantId
            ? admin.from('merchants').select('owner_email').eq('id', merchantId).single()
            : Promise.resolve({ data: null, error: null }),
        ])
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            memberName,
            storeName:     store?.brand_name ?? '',
            rating,
            message:       notesText,
            merchantEmail: (merchant as { owner_email?: string } | null)?.owner_email ?? '',
          }),
        })
      } catch (err) {
        console.error('[feedback] GHL webhook error:', err)
      }
    })()
  }

  return NextResponse.json({ ok: true })
}
