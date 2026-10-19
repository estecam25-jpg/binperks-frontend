/**
 * /api/admin/presetup-stores — the Pre-setup Stores tab's data
 *
 * GET     list every merchant still in 'presetup'
 * POST    create one (multipart: the form plus an optional logo)
 * PATCH   edit one, while it is still pre-setup
 * DELETE  remove one, merchant and store together
 *
 * WHAT CREATING ONE DOES AND DOES NOT DO. It writes a merchant row in
 * billing_status 'presetup' and a store row with the final canonical_key, so
 * the join links and QR codes on the printed materials are the real ones. It
 * does NOT touch Stripe, DocuSeal, GHL or auth — nobody has agreed to anything
 * yet. Those all happen when the owner opens the finish-setup link, through
 * exactly the machinery an organic signup uses.
 *
 * EDITING NEVER TOUCHES canonical_key. The join link and the QR codes on the
 * printed posters are derived from it, and Esteban prints before the visit, so
 * a key that moved when someone fixed a typo in the store name would silently
 * kill every poster already in the box. The store's DISPLAY name is free to
 * change; its key is fixed at creation and stays fixed. Everything the
 * finish-setup page and the agreement Order Form read — legal name, owner,
 * email, phone, locations, address, website, logo, store message — is editable.
 *
 * PATCH AND DELETE ARE ONLY EVER ALLOWED WHILE STILL 'presetup'. Once a merchant has paid
 * there is a Stripe customer and a subscription behind them, and once they have
 * signed there is an executed agreement; neither is something a tab button
 * should be able to erase. The status check is in the SQL, not just in the UI.
 *
 * Auth: admin allow-list. Data: admin client (RLS, no policies).
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin-auth'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import {
  PRESETUP, newPresetupToken, presetupCanonicalKey, validatePresetup,
  finishSetupUrl, type PresetupInput,
} from '@/lib/presetup'
import { websiteUrlOrNull } from '@/lib/store-website'

const LOGO_BUCKET = 'store-logos'
const MAX_LOGO_BYTES = 5 * 1024 * 1024
const LOGO_TYPES: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
}

type Supa = ReturnType<typeof createAdminSupabaseClient>

/**
 * Store the logo and return its public URL, or null if there was nothing
 * usable to store. Never throws: a store without a logo is fine, and a bad
 * upload must not fail the create or the edit around it.
 *
 * The file name is the store id plus the real extension, so replacing a PNG
 * with a JPEG leaves the PNG behind — the other two are removed afterwards.
 * A cache-busting suffix is added because the public URL is otherwise
 * identical after an upsert and browsers would keep showing the old image.
 */
async function uploadLogo(
  supabase: Supa, storeId: string, logo: unknown,
): Promise<string | null> {
  if (!(logo instanceof File) || logo.size === 0) return null

  const ext = LOGO_TYPES[logo.type]
  if (!ext) {
    console.warn(`[admin/presetup-stores] logo rejected for ${storeId}: type ${logo.type}`)
    return null
  }
  if (logo.size > MAX_LOGO_BYTES) {
    console.warn(`[admin/presetup-stores] logo rejected for ${storeId}: ${logo.size} bytes`)
    return null
  }

  const path = `presetup/${storeId}.${ext}`
  const { error: uploadError } = await supabase.storage
    .from(LOGO_BUCKET)
    .upload(path, new Uint8Array(await logo.arrayBuffer()), {
      contentType: logo.type, upsert: true,
    })
  if (uploadError) {
    console.error('[admin/presetup-stores] logo upload failed:', uploadError)
    return null
  }

  // Drop any copy of this logo under a different extension, so the bucket
  // holds one file per store and DELETE's fixed list still clears it.
  const stale = Object.values(LOGO_TYPES)
    .filter(e => e !== ext)
    .map(e => `presetup/${storeId}.${e}`)
  if (stale.length) await supabase.storage.from(LOGO_BUCKET).remove(stale)

  const { data: pub } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path)
  return `${pub.publicUrl}?v=${Date.now()}`
}

export async function GET(req: NextRequest) {
  if (!await verifyAdmin()) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const admin = createAdminSupabaseClient()

  const { data: merchants, error } = await admin
    .from('merchants')
    .select('id, company_name, owner_name, owner_email, phone, location_count, presetup_token, presetup_created_at, presetup_created_by')
    .eq('billing_status', PRESETUP)
    .order('presetup_created_at', { ascending: false })

  if (error) {
    console.error('[admin/presetup-stores] list failed:', error)
    return NextResponse.json({ error: 'list_failed' }, { status: 500 })
  }

  const ids = (merchants ?? []).map(m => m.id as string)
  const { data: storeRows } = ids.length
    ? await admin.from('stores')
        .select('id, merchant_id, display_name, brand_name, canonical_key, address, city, state, zip, logo_url, website_url, store_message')
        .in('merchant_id', ids)
    : { data: null }

  type StoreRow = {
    id: string; merchant_id: string; display_name: string | null; brand_name: string | null
    canonical_key: string | null; address: string | null; city: string | null
    state: string | null; zip: string | null; logo_url: string | null
    website_url: string | null; store_message: string | null
  }
  const storeByMerchant = new Map<string, StoreRow>()
  for (const s of (storeRows ?? []) as unknown as StoreRow[]) storeByMerchant.set(s.merchant_id, s)

  const origin = req.nextUrl.origin

  return NextResponse.json({
    stores: (merchants ?? []).map(m => {
      const s = storeByMerchant.get(m.id as string)
      return {
        merchantId:   m.id,
        companyName:  m.company_name,
        ownerName:    m.owner_name,
        ownerEmail:   m.owner_email,
        ownerPhone:   m.phone,
        locationCount: m.location_count ?? 1,
        createdAt:    m.presetup_created_at,
        createdBy:    m.presetup_created_by,
        storeId:      s?.id ?? null,
        storeName:    s?.display_name ?? null,
        brandName:    s?.brand_name ?? null,
        websiteUrl:   s?.website_url ?? null,
        storeKey:     s?.canonical_key ?? null,
        address:      [s?.address, s?.city, s?.state, s?.zip].filter(Boolean).join(', '),
        logoUrl:      s?.logo_url ?? null,
        // Broken out as well as joined: the edit form needs the separate parts,
        // the card above it needs the one-line version.
        street:       s?.address ?? null,
        city:         s?.city ?? null,
        state:        s?.state ?? null,
        zip:          s?.zip ?? null,
        storeMessage: s?.store_message ?? null,
        // The whole point of the tab — handed over ready to copy.
        finishSetupUrl: m.presetup_token ? finishSetupUrl(m.presetup_token as string, origin) : null,
      }
    }),
  })
}

export async function POST(req: NextRequest) {
  const adminEmail = await verifyAdmin()
  if (!adminEmail) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const form = await req.formData()
  const str = (k: string) => String(form.get(k) ?? '').trim()

  const input: PresetupInput = {
    companyName:   str('companyName'),
    websiteUrl:    websiteUrlOrNull(str('websiteUrl')) ?? '',
    ownerName:     str('ownerName'),
    ownerEmail:    str('ownerEmail').toLowerCase(),
    ownerPhone:    str('ownerPhone'),
    storeName:     str('storeName'),
    address:       str('address'),
    city:          str('city'),
    state:         str('state').toUpperCase(),
    zip:           str('zip'),
    locationCount: Math.max(1, Number(form.get('locationCount')) || 1),
  }

  const problem = validatePresetup(input)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const supabase = createAdminSupabaseClient()

  // ── Guardrail: never a second merchant for an address already in the system
  const { data: clash } = await supabase
    .from('merchants')
    .select('id, billing_status, presetup_token')
    .ilike('owner_email', input.ownerEmail)
    .maybeSingle()
  if (clash) {
    return NextResponse.json({
      error: 'email_in_use',
      message: clash.billing_status === PRESETUP
        ? 'That email already has a pre-setup store. Use its finish-setup link instead of making a second one.'
        : 'That email already belongs to a merchant.',
      existingMerchantId: clash.id,
    }, { status: 409 })
  }

  const canonicalKey = presetupCanonicalKey(input)
  const { data: keyClash } = await supabase
    .from('stores').select('id').eq('canonical_key', canonicalKey).maybeSingle()
  if (keyClash) {
    return NextResponse.json({
      error: 'store_key_in_use',
      message: `A store already uses the join link /join/${canonicalKey}. Change the store name, city or state.`,
    }, { status: 409 })
  }

  const now = new Date().toISOString()
  const token = newPresetupToken()

  const { data: merchant, error: merchantError } = await supabase
    .from('merchants')
    .insert({
      owner_email:         input.ownerEmail,
      owner_name:          input.ownerName,
      phone:               input.ownerPhone.replace(/\D/g, '') || null,
      company_name:        input.companyName,
      name:                input.companyName,
      // Inert on every axis until the owner pays and signs.
      billing_status:      PRESETUP,
      subscription_status: 'inactive',
      plan:                'standard',
      location_count:      input.locationCount,
      commission_eligible: false,
      implementation_fee_paid: false,
      presetup_token:      token,
      presetup_created_at: now,
      presetup_created_by: adminEmail,
      created_at:          now,
    })
    .select('id')
    .single()

  if (merchantError || !merchant) {
    console.error('[admin/presetup-stores] merchant insert failed:', merchantError)
    return NextResponse.json({ error: 'create_failed' }, { status: 500 })
  }

  const { data: store, error: storeError } = await supabase
    .from('stores')
    .insert({
      merchant_id:       merchant.id,
      canonical_key:     canonicalKey,
      // brand_name is no longer asked for separately; the store name is the
      // brand unless something else sets it later.
      brand_name:        input.storeName,
      display_name:      input.storeName,
      website_url:       input.websiteUrl || null,
      address:           input.address,
      city:              input.city,
      state:             input.state,
      zip:               input.zip,
      timezone:          'America/New_York',
      brand_color:       '#4A4B98',
      fiscal_week_start: 'friday',
      // Hidden and inert, exactly as a paid-but-unsigned store is.
      is_active:          false,
      network_visible:    false,
      enrollment_enabled: false,
      created_at:         now,
    })
    .select('id')
    .single()

  if (storeError || !store) {
    // A merchant with no store is useless and nothing else points at it yet,
    // so take it back out rather than leaving a half-made record in the tab.
    console.error('[admin/presetup-stores] store insert failed, rolling back merchant:', storeError)
    await supabase.from('merchants').delete().eq('id', merchant.id).eq('billing_status', PRESETUP)
    return NextResponse.json({ error: 'create_failed' }, { status: 500 })
  }

  // ── Logo, last: a store without one is fine, so this never fails the create
  const logoUrl = await uploadLogo(supabase, store.id as string, form.get('logo'))
  if (logoUrl) await supabase.from('stores').update({ logo_url: logoUrl }).eq('id', store.id)

  console.log(`[admin/presetup-stores] ${adminEmail} created pre-setup merchant ${merchant.id} (${canonicalKey})`)

  return NextResponse.json({
    merchantId: merchant.id,
    storeId: store.id,
    storeKey: canonicalKey,
    finishSetupUrl: finishSetupUrl(token, req.nextUrl.origin),
  })
}

/**
 * PATCH — edit a pre-setup store before the visit.
 *
 * Same multipart shape as POST, plus merchantId, and with one rule on top:
 * canonical_key is never recalculated. Changing the store name here renames
 * the store everywhere it is shown; it does not move the join link, so the
 * posters already printed keep working. There is deliberately no way to change
 * the key from this tab — a store that needs a different one is a new store.
 *
 * Omitting the logo leaves the existing one alone; there is no "remove logo",
 * only "replace it".
 *
 * Responses:
 *   200 { merchantId, storeId, storeKey, logoUrl }
 *   400 { error }                    validation, same rules as create
 *   403 { error: 'forbidden' }
 *   404 { error: 'not_found' }
 *   409 { error: 'not_presetup' }    already paid — edit is closed
 *   409 { error: 'email_in_use' }    another merchant has that email
 */
export async function PATCH(req: NextRequest) {
  const adminEmail = await verifyAdmin()
  if (!adminEmail) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const form = await req.formData()
  const str = (k: string) => String(form.get(k) ?? '').trim()

  const merchantId = str('merchantId')
  if (!merchantId) return NextResponse.json({ error: 'merchantId is required' }, { status: 400 })

  const input: PresetupInput = {
    companyName:   str('companyName'),
    websiteUrl:    websiteUrlOrNull(str('websiteUrl')) ?? '',
    ownerName:     str('ownerName'),
    ownerEmail:    str('ownerEmail').toLowerCase(),
    ownerPhone:    str('ownerPhone'),
    storeName:     str('storeName'),
    address:       str('address'),
    city:          str('city'),
    state:         str('state').toUpperCase(),
    zip:           str('zip'),
    locationCount: Math.max(1, Number(form.get('locationCount')) || 1),
  }
  const storeMessage = str('storeMessage')

  const problem = validatePresetup(input)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const supabase = createAdminSupabaseClient()

  // Read first so a refusal can explain itself. The status is re-checked in
  // both UPDATE statements below, which is the guard that actually holds.
  const { data: merchant } = await supabase
    .from('merchants').select('id, billing_status').eq('id', merchantId).maybeSingle()
  if (!merchant) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (merchant.billing_status !== PRESETUP) {
    return NextResponse.json({
      error: 'not_presetup',
      message: 'This merchant has already started setup and can no longer be edited here.',
    }, { status: 409 })
  }

  // Same uniqueness rule as create, minus this merchant — re-saving the form
  // without touching the email must not collide with itself.
  const { data: clash } = await supabase
    .from('merchants')
    .select('id, billing_status')
    .ilike('owner_email', input.ownerEmail)
    .neq('id', merchantId)
    .maybeSingle()
  if (clash) {
    return NextResponse.json({
      error: 'email_in_use',
      message: clash.billing_status === PRESETUP
        ? 'Another pre-setup store already uses that email.'
        : 'That email already belongs to a merchant.',
      existingMerchantId: clash.id,
    }, { status: 409 })
  }

  const { data: updatedMerchant, error: merchantError } = await supabase
    .from('merchants')
    .update({
      owner_email:    input.ownerEmail,
      owner_name:     input.ownerName,
      phone:          input.ownerPhone.replace(/\D/g, '') || null,
      company_name:   input.companyName,
      name:           input.companyName,
      location_count: input.locationCount,
    })
    .eq('id', merchantId)
    .eq('billing_status', PRESETUP)
    .select('id')

  if (merchantError || !updatedMerchant || updatedMerchant.length === 0) {
    console.error('[admin/presetup-stores] merchant update failed:', merchantError)
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }

  const { data: store } = await supabase
    .from('stores').select('id, canonical_key').eq('merchant_id', merchantId)
    .order('created_at', { ascending: true }).limit(1).maybeSingle()

  if (!store) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // canonical_key is absent from this object on purpose. See the note above.
  const { error: storeError } = await supabase
    .from('stores')
    .update({
      brand_name:    input.storeName,
      display_name:  input.storeName,
      website_url:   input.websiteUrl || null,
      address:       input.address,
      city:          input.city,
      state:         input.state,
      zip:           input.zip,
      store_message: storeMessage || null,
    })
    .eq('id', store.id)

  if (storeError) {
    console.error('[admin/presetup-stores] store update failed:', storeError)
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }

  const logoUrl = await uploadLogo(supabase, store.id as string, form.get('logo'))
  if (logoUrl) await supabase.from('stores').update({ logo_url: logoUrl }).eq('id', store.id)

  console.log(
    `[admin/presetup-stores] ${adminEmail} edited pre-setup merchant ${merchantId} ` +
    `(key unchanged: ${store.canonical_key})`
  )

  return NextResponse.json({
    merchantId,
    storeId:  store.id,
    storeKey: store.canonical_key,
    logoUrl,
  })
}

export async function DELETE(req: NextRequest) {
  const adminEmail = await verifyAdmin()
  if (!adminEmail) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { merchantId } = await req.json().catch(() => ({ merchantId: null }))
  if (!merchantId || typeof merchantId !== 'string') {
    return NextResponse.json({ error: 'merchantId is required' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()

  // Read first, so a refusal can say why rather than silently deleting nothing.
  const { data: merchant } = await supabase
    .from('merchants').select('id, billing_status, company_name').eq('id', merchantId).maybeSingle()
  if (!merchant) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (merchant.billing_status !== PRESETUP) {
    return NextResponse.json({
      error: 'not_presetup',
      message: 'This merchant has already started setup and can no longer be deleted here.',
    }, { status: 409 })
  }

  const { data: stores } = await supabase
    .from('stores').select('id').eq('merchant_id', merchantId)

  // Nothing can reference these rows — a pre-setup store cannot stamp, so it
  // has no activity, members, rewards or ledger. Deleting the store first
  // keeps the foreign key happy without relying on a cascade.
  for (const s of stores ?? []) {
    await supabase.storage.from(LOGO_BUCKET)
      .remove([`presetup/${s.id}.png`, `presetup/${s.id}.jpg`, `presetup/${s.id}.webp`])
  }
  await supabase.from('stores').delete().eq('merchant_id', merchantId)

  const { data: deleted, error } = await supabase
    .from('merchants').delete()
    .eq('id', merchantId)
    .eq('billing_status', PRESETUP)   // the real guard, not the read above
    .select('id')

  if (error || !deleted || deleted.length === 0) {
    console.error('[admin/presetup-stores] delete failed:', error)
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 })
  }

  console.log(`[admin/presetup-stores] ${adminEmail} deleted pre-setup merchant ${merchantId}`)
  return NextResponse.json({ deleted: true })
}
