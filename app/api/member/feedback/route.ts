/**
 * POST /api/member/feedback
 *
 * Member submits a rating (\'wow\' | \'meh\' | \'mad\') + optional notes.
 * \'bad\' display label is mapped to \'mad\' DB value here.
 *
 * Saves to feedback table and returns the store\'s review URL so the
 * thank-you page can prompt the member to leave a public review.
 *
 * Auth: Supabase session cookie.
 * Request body: { rating: \'wow\'|\'meh\'|\'mad\'|\'bad\', notes?: string }
 * Response: { reviewUrl: string | null }
 *   400 { error: string }
 *   401 { error: \'not_authenticated\' }
 *   404 { error: \'member_not_found\' }
 *   500 { error: string }
 */

import { NextRequest, NextResponse } from \'next/server\'
import { createServerSupabaseClient } from \'@/lib/supabase-server\'
import { createAdminSupabaseClient } from \'@/lib/supabase-admin\'

const VALID_RATINGS = [\'wow\', \'meh\', \'mad\']

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: \'not_authenticated\' }, { status: 401 })
  }

  const body = await req.json()
  const { rating: rawRating, notes } = body as { rating?: string; notes?: string }

  // Map \'bad\' display label -> \'mad\' DB value
  const rating = rawRating === \'bad\' ? \'mad\' : rawRating
  if (!rating || !VALID_RATINGS.includes(rating)) {
    return NextResponse.json({ error: \'Invalid rating\' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()

  const { data: member, error: memberError } = await admin
    .from(\'members\')
    .select(\'id, home_store_id, merchant_id, first_name, last_name\')
    .eq(\'auth_user_id\', user.id)
    .single()

  if (memberError || !member) {
    return NextResponse.json({ error: \'member_not_found\' }, { status: 404 })
  }

  // Save feedback and fetch store review URL in parallel
  const [insertResult, storeResult] = await Promise.all([
    admin.from(\'feedback\').insert({
      member_id:    member.id,
      store_id:     member.home_store_id,
      rating,
      notes:        notes?.trim() || null,
      submitted_at: new Date().toISOString(),
    }),
    admin.from(\'stores\')
      .select(\'google_review_url\')
      .eq(\'id\', member.home_store_id)
      .single(),
  ])

  if (insertResult.error) {
    console.error(\'[/api/member/feedback] Insert error:\', insertResult.error)
    return NextResponse.json({ error: \'Failed to submit feedback\' }, { status: 500 })
  }

  const storeData = storeResult.data as { google_review_url?: string | null } | null
  const reviewUrl = storeData?.google_review_url ?? null

  return NextResponse.json({ reviewUrl })
}
