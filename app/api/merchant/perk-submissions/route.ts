/**
 * GET  /api/merchant/perk-submissions?storeId=…  this store's submissions
 * POST /api/merchant/perk-submissions            propose a new perk
 *
 * A merchant who wants a perk the menu does not carry proposes it here. It is
 * NOT live: it reaches a review queue, and only an approval puts it on the
 * shared menu, where this merchant — and every other — can then choose it.
 *
 * ── WHAT THE MERCHANT SEES BACK ────────────────────────────────────────────
 * Their own submissions and nobody else's, with the status and, for a
 * decline, the reason verbatim. A merchant is never shown another store's
 * submission, and a menu entry never shows who proposed it.
 *
 * ── THE ALERT IS FIRE-AND-FORGET ───────────────────────────────────────────
 * waitUntil, so a slow mail API cannot make the submit button hang. The row is
 * written first and the email is a notification about it, not the record —
 * a failed email leaves a submission sitting in the queue, which is visible,
 * rather than a lost one.
 *
 * Auth: merchant session. Data: admin client (RLS, no policies).
 */

import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { Resend } from 'resend'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { findMerchantForRequest } from '@/lib/merchant-auth'
import { PWA_APPS } from '@/lib/pwa-manifest'
import type { PerkSubmission } from '@/lib/perk-menu'

const REVIEW_TO  = 'support@binperks.com'
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'BinPerks <noreply@feedback.binperks.com>'

/** Where a reviewer goes. The dashboard does not take a tab in the URL, so the
 *  email names the tab rather than linking to one that would be ignored. */
const REVIEW_QUEUE_URL = `${PWA_APPS.admin.origin}/admin/dashboard`

const MAX_TITLE = 60
const MAX_DESC  = 280
const MAX_NOTE  = 500

const SUBMISSION_COLUMNS =
  'id, title, description, note, status, decline_reason, created_at, reviewed_at'

function shape(row: Record<string, unknown>): PerkSubmission {
  return {
    id:            row.id as string,
    title:         row.title as string,
    description:   row.description as string,
    note:          (row.note as string | null) ?? null,
    status:        row.status as PerkSubmission['status'],
    declineReason: (row.decline_reason as string | null) ?? null,
    createdAt:     row.created_at as string,
    reviewedAt:    (row.reviewed_at as string | null) ?? null,
  }
}

export async function GET(req: NextRequest) {
  const merchant = await findMerchantForRequest<{ id: string }>('id')
  if (!merchant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminSupabaseClient()
  const storeId = new URL(req.url).searchParams.get('storeId')

  // Scoped to the merchant, not just the store id the browser sent.
  let query = admin
    .from('perk_submissions')
    .select(SUBMISSION_COLUMNS)
    .eq('merchant_id', merchant.id)
    .order('created_at', { ascending: false })
    .limit(50)
  if (storeId) query = query.eq('store_id', storeId)

  const { data, error } = await query
  if (error) {
    console.error('[merchant/perk-submissions] list failed:', error)
    return NextResponse.json({ error: 'load_failed' }, { status: 500 })
  }

  return NextResponse.json({
    submissions: (data ?? []).map(r => shape(r as Record<string, unknown>)),
  })
}

export async function POST(req: NextRequest) {
  const merchant = await findMerchantForRequest<{ id: string; company_name: string }>(
    'id, company_name',
  )
  if (!merchant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const storeId     = String(body.storeId ?? '')
  const title       = String(body.title ?? '').trim().slice(0, MAX_TITLE)
  const description = String(body.description ?? '').trim().slice(0, MAX_DESC)
  const note        = String(body.note ?? '').trim().slice(0, MAX_NOTE)

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })
  if (!title || !description) {
    return NextResponse.json({
      error: 'missing_fields',
      message: 'Give your perk a title and a short description.',
    }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()

  const { data: store } = await admin
    .from('stores').select('id, display_name')
    .eq('id', storeId).eq('merchant_id', merchant.id).maybeSingle()
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

  const { data: created, error } = await admin
    .from('perk_submissions')
    .insert({
      store_id:    storeId,
      merchant_id: merchant.id,
      title,
      description,
      note:        note || null,
      status:      'pending',
    })
    .select(SUBMISSION_COLUMNS)
    .single()

  if (error || !created) {
    console.error('[merchant/perk-submissions] insert failed:', error)
    return NextResponse.json({ error: 'submit_failed' }, { status: 500 })
  }

  const storeName = (store.display_name as string) ?? 'BinPerks store'

  waitUntil((async () => {
    if (!process.env.RESEND_API_KEY) {
      console.warn('[merchant/perk-submissions] RESEND_API_KEY is not set — review alert not sent')
      return
    }
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const { error: sendError } = await resend.emails.send({
        from:    FROM_EMAIL,
        to:      REVIEW_TO,
        subject: `New perk submitted: ${storeName}`,
        text:
          `${storeName} submitted a new perk for review.\n\n`
          + `Title: ${title}\n`
          + `Description: ${description}\n`
          + (note ? `Note to BinPerks: ${note}\n` : '')
          + `\nReview it in the Perks tab: ${REVIEW_QUEUE_URL}\n`,
      })
      if (sendError) console.error('[merchant/perk-submissions] alert failed:', sendError)
    } catch (err) {
      console.error('[merchant/perk-submissions] alert threw:', err)
    }
  })())

  console.log(`[merchant/perk-submissions] ${merchant.id} submitted "${title}"`)
  return NextResponse.json({ submission: shape(created as Record<string, unknown>) })
}
