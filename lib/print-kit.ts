/**
 * The professional print kit order.
 *
 * Every live location gets a printed kit — ten poster decals and a sheet of
 * countertop decals — and BinPerks orders it by emailing support@ with that
 * location's eleven ready-to-print PDFs attached. There is no vendor
 * integration and no tracking: a person reads the email, prints, and posts it.
 *
 * ── ONE EMAIL PER LOCATION, EVER ───────────────────────────────────────────
 * stores.print_kit_sent_at is CLAIMED with a compare-and-set before anything
 * is rendered, and released only if the send fails. Activation is genuinely
 * re-entrant — the DocuSeal webhook and the signing page both call it, and
 * DocuSeal retries — so without the claim a merchant who signed once could
 * have three kits posted to them.
 *
 * PER STORE AND NOT PER MERCHANT, because a two-location merchant needs two
 * kits at two addresses with two different QR codes on them.
 *
 * ── WHY ELEVEN SEPARATE PDFS ───────────────────────────────────────────────
 * The merchant-facing download is one ten-page PDF, which is right for an
 * office printer. A print shop producing decals wants one file per decal, so
 * the posters are rendered individually here. Both come from the same recipe
 * and the same artwork, so a poster in the kit and a poster the merchant
 * prints are the same design with the same QR.
 *
 * ── NEVER BLOCKS ACTIVATION ────────────────────────────────────────────────
 * Rendering eleven PDFs takes seconds. The caller runs this in waitUntil, and
 * nothing here throws: a merchant is live whether or not their stationery
 * order went out, and a failure releases the claim so admin can resend.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { recipeBySlug, type MaterialSpec } from '@/lib/marketing-materials'
import { renderMaterial } from '@/lib/marketing-render'

type Admin = SupabaseClient

/** Where kit orders go. A human prints and posts them. */
const ORDER_TO = 'support@binperks.com'
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'BinPerks <noreply@feedback.binperks.com>'

/** The ten poster designs, in order, taken from the recipe rather than listed
 *  again — admin can swap a design and the kit follows. */
function posterTemplateSlugs(): string[] {
  return recipeBySlug('store-posters')?.templates ?? []
}

export interface PrintKitStore {
  id: string
  display_name: string | null
  canonical_key: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
}

const STORE_COLUMNS = 'id, display_name, canonical_key, address, city, state, zip'

/**
 * The shipping line, exactly as the printer needs to read it.
 *
 * Missing parts are dropped rather than printed as "null" — an address with a
 * hole in it is a question someone can answer, "null, null FL" is not.
 */
export function shippingAddress(store: PrintKitStore): string {
  const cityState = [store.city, store.state].filter(Boolean).join(', ')
  return [
    store.display_name,
    store.address,
    [cityState, store.zip].filter(Boolean).join(' '),
  ].filter(s => s && s.trim()).join(', ')
}

export function printKitSubject(store: PrintKitStore): string {
  const where = [store.city, store.state].filter(Boolean).join(', ')
  return `Print kit order: ${store.display_name ?? 'BinPerks store'}${where ? `, ${where}` : ''}`
}

/** The body, verbatim. Two lines, no greeting, nothing to read past. */
export function printKitBody(store: PrintKitStore): string {
  return `Please print 1qty of each as decal (sticky on back) 8.5" x 11"\n`
       + `ship in flat rate padded envelope to: ${shippingAddress(store)}`
}

export interface KitAttachment { filename: string; content: Buffer }

/**
 * The eleven files.
 *
 * Each poster is rendered from the poster recipe with its template list cut
 * down to one design, which makes buildPdf lay out a single full-page design
 * instead of a ten-page document. The countertop decal is its own recipe,
 * unchanged — the kit sheet and the merchant's own download are the same file.
 *
 * Rendered one after another on purpose. Each is a few sharp pipelines over a
 * 1100px PNG; eleven at once on a serverless instance is how you find its
 * memory ceiling.
 */
export async function buildPrintKit(
  admin: Admin,
  store: PrintKitStore,
): Promise<KitAttachment[]> {
  const posters = recipeBySlug('store-posters')
  const decal   = recipeBySlug('countertop-display')
  if (!posters || !decal) throw new Error('print kit recipes missing from this build')

  const storeKey  = store.canonical_key ?? ''
  const storeName = store.display_name ?? 'Your Store'
  const out: KitAttachment[] = []

  const slugs = posterTemplateSlugs()
  for (let i = 0; i < slugs.length; i++) {
    const single: MaterialSpec = { ...posters, templates: [slugs[i]] }
    const { body } = await renderMaterial({ admin, spec: single, storeKey, storeName })
    out.push({ filename: `poster-${String(i + 1).padStart(2, '0')}.pdf`, content: body })
  }

  const { body: decalPdf } = await renderMaterial({ admin, spec: decal, storeKey, storeName })
  out.push({ filename: 'countertop-decal.pdf', content: decalPdf })

  return out
}

export type PrintKitResult =
  | { sent: true; attachments: number }
  | { sent: false; reason: 'already_sent' | 'store_not_found' | 'not_configured' | 'failed' }

/**
 * Order the kit for one location.
 *
 * `force` is the admin resend: it skips the "already sent" check but still
 * re-stamps the timestamp, so the column always says when the last order went
 * out rather than when the first one did.
 */
export async function sendPrintKitEmail(
  admin: Admin,
  storeId: string,
  opts: { force?: boolean } = {},
): Promise<PrintKitResult> {
  try {
    const { data: store } = await admin
      .from('stores')
      .select(`${STORE_COLUMNS}, print_kit_sent_at`)
      .eq('id', storeId)
      .maybeSingle()

    if (!store) return { sent: false, reason: 'store_not_found' }
    if (store.print_kit_sent_at && !opts.force) return { sent: false, reason: 'already_sent' }

    if (!process.env.RESEND_API_KEY) {
      console.warn('[print-kit] RESEND_API_KEY is not set — kit order not sent')
      return { sent: false, reason: 'not_configured' }
    }

    // CLAIM FIRST. Rendering takes seconds, which is plenty of room for the
    // second activation call to arrive and start rendering its own copy.
    const claimedAt = new Date().toISOString()
    let claim = admin.from('stores').update({ print_kit_sent_at: claimedAt }).eq('id', storeId)
    if (!opts.force) claim = claim.is('print_kit_sent_at', null)
    const { data: won } = await claim.select('id')
    if (!won || won.length === 0) return { sent: false, reason: 'already_sent' }

    try {
      const kit = await buildPrintKit(admin, store as unknown as PrintKitStore)
      const resend = new Resend(process.env.RESEND_API_KEY)
      const { error } = await resend.emails.send({
        from:    FROM_EMAIL,
        to:      ORDER_TO,
        subject: printKitSubject(store as unknown as PrintKitStore),
        text:    printKitBody(store as unknown as PrintKitStore),
        attachments: kit.map(a => ({ filename: a.filename, content: a.content })),
      })
      if (error) throw new Error(`resend: ${error.message}`)

      console.log(`[print-kit] ordered for store ${storeId} (${kit.length} attachments)`)
      return { sent: true, attachments: kit.length }
    } catch (err) {
      // Release the claim so admin's resend — or the next activation call —
      // can try again. Only our own claim is released, never a later one.
      await admin.from('stores')
        .update({ print_kit_sent_at: null })
        .eq('id', storeId)
        .eq('print_kit_sent_at', claimedAt)
      console.error(`[print-kit] order failed for store ${storeId}:`, err)
      return { sent: false, reason: 'failed' }
    }
  } catch (err) {
    console.error(`[print-kit] unexpected failure for store ${storeId}:`, err)
    return { sent: false, reason: 'failed' }
  }
}

/**
 * Order kits for every location of a merchant that does not have one yet.
 *
 * Called on activation, which is the moment a merchant's first location goes
 * live. A location added later is covered by the same query the next time this
 * runs, and by the admin resend button in the meantime — there is no
 * self-serve "add a location" flow for it to hook into yet.
 */
export async function sendPrintKitsForMerchant(admin: Admin, merchantId: string): Promise<void> {
  try {
    const { data: stores } = await admin
      .from('stores')
      .select('id')
      .eq('merchant_id', merchantId)
      .is('print_kit_sent_at', null)

    for (const s of stores ?? []) {
      await sendPrintKitEmail(admin, s.id as string)
    }
  } catch (err) {
    console.error(`[print-kit] merchant sweep failed for ${merchantId}:`, err)
  }
}
