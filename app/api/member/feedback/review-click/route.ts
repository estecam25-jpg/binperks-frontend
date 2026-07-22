/**
 * POST /api/member/feedback/review-click
 *
 * Tracks that the member tapped "Leave a Review" on the feedback thank-you page.
 * Updates the most recent feedback record for this member with review_clicked=true.
 *
 * Auth: Supabase session cookie.
 * No request body required.
 * Response: { ok: true }
 */

import { NextRequest, NextResponse } from \'next/server\'
import { createServerSupabaseClient } from \'@/lib/supabase-server\'
import { createAdminSupabaseClient } from \'@/lib/supabase-admin\'

export async function POST(_req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: \'not_authenticated\' }, { status: 401 })
  }

  const admin = createAdminSupabaseClient()

  const { data: member } = await admin
    .from(\'members\')
    .select(\'id\')
    .eq(\'auth_user_id\', user.id)
    .single()

  if (!member) {
    return NextResponse.json({ ok: true })  // soft fail — click still counts
  }

  // Find most recent feedback record for this member
  const { data: latest } = await admin
    .from(\'feedback\')
    .select(\'id\')
    .eq(\'member_id\', member.id)
    .order(\'submitted_at\', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latest?.id) {
    // Update review_clicked fields if columns exist
    // (migration: ALTER TABLE feedback ADD COLUMN IF NOT EXISTS review_clicked boolean DEFAULT false,
    //             ADD COLUMN IF NOT EXISTS review_clicked_at timestamptz)
    await admin
      .from(\'feedback\')
      .update({
        review_clicked:    true,
        review_clicked_at: new Date().toISOString(),
      } as Record<string, unknown>)
      .eq(\'id\', latest.id)
      .throwOnError()
      .then(() => {}, (err) => {
        // Columns may not exist yet — log and continue
        console.warn(\'[review-click] Could not update review_clicked:\', err?.message)
      })
  }

  return NextResponse.json({ ok: true })
}
