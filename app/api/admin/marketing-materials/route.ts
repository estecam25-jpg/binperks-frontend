/**
 * GET    /api/admin/marketing-materials — every material, by category
 * POST   /api/admin/marketing-materials — create one, or upload its images
 * PATCH  /api/admin/marketing-materials — edit fields, or reorder
 * DELETE /api/admin/marketing-materials?id=… — remove one
 *
 * The content manager behind the merchant Marketing tab. Everything here is
 * live for every merchant on their next page load — materials are listed per
 * request and files built per download, so there is no cache to bust and
 * nothing to publish.
 *
 * WHAT ADMIN CANNOT CHANGE, and why. A material's RECIPE — sheet layout, print
 * size, fold lines, which join URL its QR encodes — stays in code, because it
 * is the rendering logic. A row picks a recipe; it cannot invent one. Picking
 * is enough to add a second poster set or a second tent with different
 * artwork, which is what "add a material" realistically means.
 *
 * FORMAT FOLLOWS THE RECIPE. A tiled sheet comes out of pdf-lib and a 4x6
 * print comes out of sharp; neither path can emit the other's file type, so a
 * format the recipe cannot produce is refused rather than written and then
 * served as a broken download.
 *
 * Auth: admin session. Data and storage: admin client — RLS with no policies.
 *
 * Responses:
 *   GET    200 { materials: [...], recipes: [...], templates: [...] }
 *   POST   201 { material } | { lifestyle: { id, previewUrl } }
 *   PATCH  200 { ok: true }
 *   DELETE 200 { ok: true }
 *   400    { error: 'invalid_request' | 'unknown_recipe' | 'bad_format' | ... }
 *   403    { error: 'forbidden' }
 *   404    { error: 'unknown_material' }
 */

import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { verifyAdmin } from '@/lib/admin-auth'
import {
  CATEGORIES, MATERIALS, recipeBySlug, formatsForRecipe,
  type MaterialCategory, type MaterialRow,
} from '@/lib/marketing-materials'
import {
  LIFESTYLE_BUCKET, LIFESTYLE_SIGNED_TTL, LIFESTYLE_PX,
  lifestylePathFor, signPaths,
} from '@/lib/marketing-lifestyle'

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

const CATEGORY_IDS = CATEGORIES.map(c => c.id) as MaterialCategory[]

const SELECT =
  'id, slug, category, title, description, render_recipe, template_slugs, ' +
  'lifestyle_image_path, download_format, display_order, active'

/** A URL-safe key from a title, made unique against what already exists. Slugs
 *  appear in the merchant download URL and are never reused. */
function slugify(title: string, taken: Set<string>): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'material'
  if (!taken.has(base)) return base
  for (let n = 2; n < 500; n++) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}-${Date.now()}`
}

export async function GET() {
  const email = await verifyAdmin()
  if (!email) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const admin = createAdminSupabaseClient()

  const [{ data: rows }, { data: templateRows }] = await Promise.all([
    admin.from('marketing_materials').select(SELECT)
      .order('category', { ascending: true })
      .order('display_order', { ascending: true }),
    admin.from('marketing_templates').select('slug, label, bucket, storage_path')
      .order('display_order', { ascending: true }),
  ])

  const materials = (rows ?? []) as unknown as MaterialRow[]
  const templates = (templateRows ?? []) as unknown as
    { slug: string; label: string; bucket: string; storage_path: string | null }[]

  // Lifestyle previews, one signing call for all of them.
  const lifestylePaths = materials
    .map(m => m.lifestyle_image_path)
    .filter((p): p is string => !!p)
  const lifestyleUrls = await signPaths(admin, LIFESTYLE_BUCKET, lifestylePaths)

  // Base artwork thumbnails, grouped by the bucket they live in.
  const artworkUrls: Record<string, string> = {}
  const byBucket = new Map<string, string[]>()
  for (const t of templates) {
    if (!t.storage_path) continue
    byBucket.set(t.bucket, [...(byBucket.get(t.bucket) ?? []), t.storage_path])
  }
  for (const [bucket, paths] of byBucket) {
    const signed = await signPaths(admin, bucket, paths)
    for (const [p, url] of Object.entries(signed)) artworkUrls[`${bucket}/${p}`] = url
  }

  return NextResponse.json({
    categories: CATEGORIES,
    materials: materials.map(m => ({
      ...m,
      lifestyleUrl: m.lifestyle_image_path ? lifestyleUrls[m.lifestyle_image_path] ?? null : null,
      // One thumbnail per design this material prints from — five for posters.
      artwork: m.template_slugs.map(slug => {
        const t = templates.find(x => x.slug === slug)
        return {
          slug,
          label: t?.label ?? slug,
          hasArtwork: !!t?.storage_path,
          previewUrl: t?.storage_path ? artworkUrls[`${t.bucket}/${t.storage_path}`] ?? null : null,
        }
      }),
      // What the recipe can actually produce, so the form cannot offer a
      // format that would build a broken file.
      allowedFormats: formatsForRecipe(m.render_recipe),
      recipeMissing: !recipeBySlug(m.render_recipe) && m.category !== 'social_media_post',
    })),
    // Offered when adding a material: the geometries that exist in code.
    recipes: MATERIALS.map(r => ({
      slug: r.slug,
      label: r.label,
      output: r.output,
      templateCount: r.templates.length,
      qrTarget: r.qrTarget,
    })),
    templates: templates.map(t => ({ slug: t.slug, label: t.label, hasArtwork: !!t.storage_path })),
  })
}

export async function POST(req: NextRequest) {
  const email = await verifyAdmin()
  if (!email) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const admin = createAdminSupabaseClient()
  const contentType = req.headers.get('content-type') ?? ''

  // A multipart body is an image upload for an existing material; JSON creates
  // a new one.
  if (contentType.includes('multipart/form-data')) {
    return uploadLifestyle(admin, req)
  }

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const title = String(body.title ?? '').trim()
  const category = String(body.category ?? '') as MaterialCategory
  const recipeSlug = String(body.renderRecipe ?? '').trim()

  if (!title) return NextResponse.json({ error: 'title_required' }, { status: 400 })
  if (!CATEGORY_IDS.includes(category) || category === 'social_media_post') {
    return NextResponse.json({ error: 'invalid_category' }, { status: 400 })
  }

  const recipe = recipeBySlug(recipeSlug)
  if (!recipe) return NextResponse.json({ error: 'unknown_recipe' }, { status: 400 })

  const { data: existing } = await admin.from('marketing_materials').select('slug, display_order, category')
  const rows = (existing ?? []) as { slug: string; display_order: number; category: string }[]
  const slug = slugify(title, new Set(rows.map(r => r.slug)))

  // Appended to its category rather than inserted, so adding one never
  // renumbers the materials a merchant already knows the order of.
  const lastInCategory = rows
    .filter(r => r.category === category)
    .reduce((max, r) => Math.max(max, r.display_order), 0)

  const { data, error } = await admin
    .from('marketing_materials')
    .insert({
      slug,
      category,
      title,
      description: String(body.description ?? '').trim(),
      render_recipe: recipe.slug,
      // Starts on the recipe's own designs. Admin uploads artwork against
      // those template rows, or points the material at different ones later.
      template_slugs: recipe.templates,
      download_format: recipe.output,
      display_order: lastInCategory + 1,
      active: body.active === undefined ? true : !!body.active,
      updated_at: new Date().toISOString(),
      updated_by: email,
    })
    .select(SELECT)
    .single()

  if (error) {
    console.error('[admin/marketing-materials] create failed:', error.message)
    return NextResponse.json({ error: 'create_failed' }, { status: 500 })
  }

  return NextResponse.json({ material: data }, { status: 201 })
}

/** The reveal photo for one material. Squared, flattened and re-encoded — see
 *  lib/marketing-lifestyle for why it must not carry transparency. */
async function uploadLifestyle(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  req: NextRequest,
) {
  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const id = String(form.get('id') ?? '').trim()
  const file = form.get('file')

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'no_file' }, { status: 400 })
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 400 })
  }

  const { data: row } = await admin
    .from('marketing_materials').select('id, slug').eq('id', id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'unknown_material' }, { status: 404 })

  let jpeg: Buffer
  try {
    jpeg = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize(LIFESTYLE_PX, LIFESTYLE_PX, { fit: 'cover', position: 'centre' })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 82 })
      .toBuffer()
  } catch (err) {
    console.error('[admin/marketing-materials] lifestyle re-encode failed:', err)
    return NextResponse.json({ error: 'unreadable_image' }, { status: 400 })
  }

  const path = lifestylePathFor(row.slug as string)
  const { error: upErr } = await admin.storage
    .from(LIFESTYLE_BUCKET)
    .upload(path, jpeg, { contentType: 'image/jpeg', upsert: true })

  if (upErr) {
    console.error('[admin/marketing-materials] lifestyle upload failed:', upErr.message)
    return NextResponse.json({ error: 'upload_failed' }, { status: 500 })
  }

  await admin.from('marketing_materials')
    .update({ lifestyle_image_path: path, updated_at: new Date().toISOString() })
    .eq('id', id)

  const { data: urls } = await admin.storage
    .from(LIFESTYLE_BUCKET).createSignedUrls([path], LIFESTYLE_SIGNED_TTL)

  return NextResponse.json({
    lifestyle: { id, previewUrl: urls?.[0]?.signedUrl ?? null },
  }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const email = await verifyAdmin()
  if (!email) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const admin = createAdminSupabaseClient()

  // Reorder is its own shape: a whole category's ids in their new order, so
  // two rows can never end up claiming the same position.
  if (Array.isArray(body.order)) {
    const ids = (body.order as unknown[]).filter((v): v is string => typeof v === 'string')
    for (let i = 0; i < ids.length; i++) {
      await admin.from('marketing_materials')
        .update({ display_order: i + 1, updated_at: new Date().toISOString(), updated_by: email })
        .eq('id', ids[i])
    }
    return NextResponse.json({ ok: true })
  }

  const id = String(body.id ?? '').trim()
  if (!id) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const { data: row } = await admin
    .from('marketing_materials').select('id, render_recipe').eq('id', id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'unknown_material' }, { status: 404 })

  const updates: Record<string, unknown> = {}

  if (typeof body.title === 'string') {
    const title = body.title.trim()
    if (!title) return NextResponse.json({ error: 'title_required' }, { status: 400 })
    updates.title = title
  }
  if (typeof body.description === 'string') updates.description = body.description.trim()
  if (typeof body.active === 'boolean') updates.active = body.active

  if (typeof body.category === 'string') {
    const category = body.category as MaterialCategory
    if (!CATEGORY_IDS.includes(category) || category === 'social_media_post') {
      return NextResponse.json({ error: 'invalid_category' }, { status: 400 })
    }
    updates.category = category
  }

  if (typeof body.downloadFormat === 'string') {
    const allowed = formatsForRecipe(row.render_recipe as string | null)
    // Refused rather than stored: the renderer would build a PDF and hand it
    // over labelled as a JPEG, which downloads as a file that will not open.
    if (!allowed.includes(body.downloadFormat as never)) {
      return NextResponse.json({
        error: 'bad_format',
        allowed,
      }, { status: 400 })
    }
    updates.download_format = body.downloadFormat
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no_fields' }, { status: 400 })
  }

  updates.updated_at = new Date().toISOString()
  updates.updated_by = email

  const { error } = await admin.from('marketing_materials').update(updates).eq('id', id)
  if (error) {
    console.error('[admin/marketing-materials] update failed:', error.message)
    return NextResponse.json({ error: 'save_failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const email = await verifyAdmin()
  if (!email) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const admin = createAdminSupabaseClient()

  // The row goes; the base artwork does not. Template rows are shared between
  // materials, so deleting a second poster set must not take the posters'
  // artwork with it. The lifestyle photo is this material's own, and is left
  // in place too — harmless, and it comes back if the material is recreated
  // under the same slug.
  const { error } = await admin.from('marketing_materials').delete().eq('id', id)
  if (error) {
    console.error('[admin/marketing-materials] delete failed:', error.message)
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
