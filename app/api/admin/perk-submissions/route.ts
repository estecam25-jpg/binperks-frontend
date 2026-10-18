/**
 * /api/admin/perk-submissions — the review queue
 *
 * GET   every submission, newest first, with the store that sent it
 * POST  { id, action: 'approve' | 'decline', ... }
 *
 * APPROVE takes the reviewed wording, not the submitted wording: the admin may
 * edit the title and sentence and pick a group, because "approved, after a
 * rewrite" is the normal outcome and the merchant was told so before they
 * submitted. The edited version is what joins the shared menu, where EVERY
 * store can choose it — the submitting store gets no privileged access to it
 * and is not named on it.
 *
 * DECLINE REQUIRES A REASON, because the reason is shown to the merchant
 * verbatim. A decline with no explanation is how a merchant submits the same
 * perk again next week.
 *
 * Both outcomes email the merchant. Awaited rather than deferred: an admin is
 * watching the button and a silent failure here means a merchant is left
 * waiting on a notice that never comes. A failed email does not undo the
 * decision — the status is already saved and visible in their dashboard.
 *
 * Auth: admin allow-list. Data: admin client.
 */

import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { verifyAdmin } from '@/lib/admin-auth'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { MENU_COLUMNS } from '@/lib/perk-menu'

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'BinPerks <noreply@feedback.binperks.com>'

export async function GET() {
  if (!await verifyAdmin()) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from('perk_submissions')
    .select('id, store_id, merchant_id, title, description, note, status, decline_reason, created_at, reviewed_at, reviewed_by')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[admin/perk-submissions] load failed:', error)
    return NextResponse.json({ error: 'load_failed' }, { status: 500 })
  }

  const rows = data ?? []
  const storeIds = [...new Set(rows.map(r => r.store_id as string))]
  const { data: stores } = storeIds.length
    ? await admin.from('stores').select('id, display_name').in('id', storeIds)
    : { data: [] as { id: string; display_name: string | null }[] }
  const nameById = new Map((stores ?? []).map(s => [s.id as string, (s.display_name as string) ?? '—']))

  return NextResponse.json({
    submissions: rows.map(r => ({
      id:            r.id,
      storeName:     nameById.get(r.store_id as string) ?? '—',
      title:         r.title,
      description:   r.description,
      note:          r.note,
      status:        r.status,
      declineReason: r.decline_reason,
      createdAt:     r.created_at,
      reviewedAt:    r.reviewed_at,
      reviewedBy:    r.reviewed_by,
    })),
  })
}

async function notifyMerchant(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  merchantId: string,
  subject: string,
  text: string,
): Promise<void> {
  try {
    const { data: m } = await admin
      .from('merchants').select('owner_email').eq('id', merchantId).maybeSingle()
    const to = (m?.owner_email as string | null)?.trim()
    if (!to) {
      console.warn(`[admin/perk-submissions] merchant ${merchantId} has no owner_email — not notified`)
      return
    }
    if (!process.env.RESEND_API_KEY) {
      console.warn('[admin/perk-submissions] RESEND_API_KEY is not set — merchant not notified')
      return
    }
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({ from: FROM_EMAIL, to, subject, text })
    if (error) console.error('[admin/perk-submissions] merchant email failed:', error)
  } catch (err) {
    console.error('[admin/perk-submissions] merchant email threw:', err)
  }
}

export async function POST(req: NextRequest) {
  const adminEmail = await verifyAdmin()
  if (!adminEmail) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const id     = String(body.id ?? '')
  const action = String(body.action ?? '')
  if (!id || (action !== 'approve' && action !== 'decline')) {
    return NextResponse.json({ error: 'id and a valid action are required' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()
  const { data: sub } = await admin
    .from('perk_submissions')
    .select('id, merchant_id, title, description, status')
    .eq('id', id)
    .maybeSingle()

  if (!sub) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (sub.status !== 'pending') {
    return NextResponse.json({
      error: 'already_reviewed',
      message: `This submission was already ${sub.status}.`,
    }, { status: 409 })
  }

  const now = new Date().toISOString()

  // ── Decline ──────────────────────────────────────────────────────────────
  if (action === 'decline') {
    const reason = String(body.reason ?? '').trim()
    if (!reason) {
      return NextResponse.json({
        error: 'reason_required',
        message: 'Give a reason — the merchant is shown it word for word.',
      }, { status: 400 })
    }

    const { error } = await admin
      .from('perk_submissions')
      .update({ status: 'declined', decline_reason: reason, reviewed_at: now, reviewed_by: adminEmail })
      .eq('id', id)
      .eq('status', 'pending')
    if (error) {
      console.error('[admin/perk-submissions] decline failed:', error)
      return NextResponse.json({ error: 'update_failed' }, { status: 500 })
    }

    await notifyMerchant(
      admin,
      sub.merchant_id as string,
      'Update on your perk submission',
      `Your perk "${sub.title}" wasn't approved: ${reason}. `
      + `You can submit a new one anytime from your dashboard.\n`,
    )

    console.log(`[admin/perk-submissions] ${adminEmail} declined ${id}`)
    return NextResponse.json({ ok: true, status: 'declined' })
  }

  // ── Approve, with the reviewer's wording ─────────────────────────────────
  const title       = String(body.title       ?? sub.title).trim()
  const description = String(body.description ?? sub.description).trim()
  const groupName   = String(body.groupName   ?? '').trim()

  if (!title || !description || !groupName) {
    return NextResponse.json({
      error: 'missing_fields',
      message: 'An approved perk needs a title, a sentence and a group.',
    }, { status: 400 })
  }

  // Land at the end of its group, inheriting that group's order.
  const { data: sibling } = await admin
    .from('perk_menu')
    .select('group_order, display_order')
    .eq('group_name', groupName)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const { data: lastGroup } = await admin
    .from('perk_menu').select('group_order')
    .order('group_order', { ascending: false }).limit(1).maybeSingle()

  const { data: menuPerkRow, error: menuError } = await admin
    .from('perk_menu')
    .insert({
      group_name:    groupName,
      group_order:   sibling ? Number(sibling.group_order) : Number(lastGroup?.group_order ?? 0) + 1,
      title,
      description,
      display_order: Number(sibling?.display_order ?? 0) + 1,
    })
    .select(MENU_COLUMNS)
    .single()

  if (menuError || !menuPerkRow) {
    console.error('[admin/perk-submissions] menu insert failed:', menuError)
    return NextResponse.json({ error: 'approve_failed' }, { status: 500 })
  }

  const { error } = await admin
    .from('perk_submissions')
    .update({
      status: 'approved',
      menu_perk_id: menuPerkRow.id,
      reviewed_at: now,
      reviewed_by: adminEmail,
    })
    .eq('id', id)
    .eq('status', 'pending')
  if (error) {
    console.error('[admin/perk-submissions] approve failed:', error)
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }

  await notifyMerchant(
    admin,
    sub.merchant_id as string,
    'Your perk was approved',
    `Your perk "${title}" is now in your perk menu. `
    + `Sign in to your BinPerks dashboard and choose it for one of your perk slots.\n`,
  )

  console.log(`[admin/perk-submissions] ${adminEmail} approved ${id} as menu perk ${menuPerkRow.id}`)
  return NextResponse.json({ ok: true, status: 'approved', menuPerkId: menuPerkRow.id })
}
