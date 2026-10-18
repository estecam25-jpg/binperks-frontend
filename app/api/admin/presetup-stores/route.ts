/**
 * /api/admin/presetup-stores — the Pre-setup Stores tab's data
 *
 * GET     list every merchant still in 'presetup'
 * POST    create one (multipart: the form plus an optional logo)
 * DELETE  remove one, merchant and store together
 *
 * WHAT CREATING ONE DOES AND DOES NOT DO. It writes a merchant row in
 * billing_status 'presetup' and a store row with the final canonical_key, so
 * the join links and QR codes on the printed materials are the real ones. It
 * does NOT touch Stripe, DocuSeal, GHL or auth — nobody has agreed to anything
 * yet. Those all happen when the owner opens the finish-setup link, through
 * exactly the machinery an organic signup uses.
 *
 * DELETE IS ONLY EVER ALLOWED WHILE STILL 'presetup'. Once a merchant has paid
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
        .select('id, merchant_id, display_name, brand_name, canonical_key, address, city, state, zip, logo_url, website_url')
        .in('merchant_id', ids)
    : { data: null }

  type StoreRow = {
    id: string; merchant_id: string; display_name: string | null; brand_name: string | null
    canonical_key: string | null; address: string | null; city: string | null
    state: string | null; zip: string | null; logo_url: string | null
    website_url: string | null
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
  const logo = form.get('logo')
  if (logo instanceof File && logo.size > 0) {
    const ext = LOGO_TYPES[logo.type]
    if (!ext) {
      console.warn(`[admin/presetup-stores] logo rejected for ${store.id}: type ${logo.type}`)
    } else if (logo.size > MAX_LOGO_BYTES) {
      console.warn(`[admin/presetup-stores] logo rejected for ${store.id}: ${logo.size} bytes`)
    } else {
      const path = `presetup/${store.id}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from(LOGO_BUCKET)
        .upload(path, new Uint8Array(await logo.arrayBuffer()), {
          contentType: logo.type, upsert: true,
        })
      if (uploadError) {
        console.error('[admin/presetup-stores] logo upload failed:', uploadError)
      } else {
        const { data: pub } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path)
        await supabase.from('stores').update({ logo_url: pub.publicUrl }).eq('id', store.id)
      }
    }
  }

  console.log(`[admin/presetup-stores] ${adminEmail} created pre-setup merchant ${merchant.id} (${canonicalKey})`)

  return NextResponse.json({
    merchantId: merchant.id,
    storeId: store.id,
    storeKey: canonicalKey,
    finishSetupUrl: finishSetupUrl(token, req.nextUrl.origin),
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
