/**
 * GET /api/member/content/[type]
 *
 * Home-feed content for signed-in members. Serves the four feed paths:
 *   /api/member/content/promos
 *   /api/member/content/shop-from-home
 *   /api/member/content/beyond-the-bins
 *   /api/member/content/deals-near-you
 *
 * ACTIVE rows only, pinned first then display_order — the admin management
 * view (/api/admin/content/[type]) is the one that returns everything.
 *
 * ?pinned=true narrows further to pinned rows, which is what the Home feed
 * uses; the MORE tab omits it and gets the full active list.
 *
 * suggested-perks is deliberately NOT reachable here: it is merchant-facing
 * content and has no business on a member's feed. The allow-list below is what
 * enforces that, rather than relying on nobody guessing the slug.
 *
 * Auth: member session (server client for identity), admin client for the read.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { contentTypeBySlug, columnsFor, applyFeedOrder } from '@/lib/admin-content'

/** Feed types only. */
const MEMBER_VISIBLE = new Set(['promos', 'shop-from-home', 'beyond-the-bins', 'deals-near-you'])

/** Enough for a feed section; the carousels show a handful at a time. */
const MAX_ITEMS = 20

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const { type: slug } = await params
  if (!MEMBER_VISIBLE.has(slug)) {
    return NextResponse.json({ error: 'unknown_type' }, { status: 404 })
  }

  const type = contentTypeBySlug(slug)
  if (!type) return NextResponse.json({ error: 'unknown_type' }, { status: 404 })

  // ?pinned=true — the Home feed carries only pinned items, while the MORE tab
  // lists everything. Filtered here rather than in the browser so Home is not
  // downloading rows it will never show.
  const pinnedOnly = req.nextUrl.searchParams.get('pinned') === 'true'

  const admin = createAdminSupabaseClient()
  let base = admin.from(type.table).select(columnsFor(type).join(', ')).eq('active', true)
  if (pinnedOnly && type.pinned) base = base.eq('pinned', true)

  const { data, error } = await applyFeedOrder(base, type).limit(MAX_ITEMS)

  if (error) {
    // An empty list is what the caller falls back on, so a failure here is not
    // worth a 500 that would blank a feed section — the Home tab renders its
    // built-in copy instead.
    console.error(`[member/content/${slug}] query failed:`, error)
    return NextResponse.json({ items: [] })
  }

  return NextResponse.json({ items: data ?? [] })
}
