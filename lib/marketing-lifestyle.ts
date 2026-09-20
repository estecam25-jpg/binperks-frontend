/**
 * Lifestyle photos — the example shot on each merchant marketing card.
 *
 * NOT THE PRINTABLE ARTWORK. marketing_templates holds what gets composed into
 * a download — the design, with its [STORE NAME] and [QR CODE] rectangles.
 * This holds a photograph of the finished thing in use, shown on the card in
 * the merchant's Marketing tab so they can see what they are about to print
 * before they print it. Nothing here is ever composited or downloaded.
 *
 * ONE PER MATERIAL, where base artwork is one per TEMPLATE. The five poster
 * designs are five templates but a single material, and one photo of a poster
 * on a wall stands for all five. That different grain is the whole reason this
 * is keyed on MATERIALS rather than living alongside the template rows.
 *
 * NO TABLE. The path is derived from the material slug, so whether an image
 * exists is a question about the bucket and one list() answers it for all six
 * at once. A row would only restate what storage already knows, and could
 * disagree with it.
 *
 * PRIVATE BUCKET. Every URL is signed per request and short-lived, which also
 * means replacing an image cannot serve a stale cached copy the way a public
 * URL can.
 *
 * JPEG, NOT PNG, and not only for the file size. The photo sits ON TOP of the
 * material's description and lifts to reveal it, so anything transparent in it
 * would leave the words showing through from the start and the reveal would
 * have nothing left to reveal. JPEG cannot carry an alpha channel at all,
 * which makes that impossible rather than merely unlikely.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Shares the bucket with the base artwork, under its own prefix — one bucket
 *  to keep private, and the prefix keeps the two kinds from colliding. */
export const LIFESTYLE_BUCKET = 'marketing-templates'
export const LIFESTYLE_PREFIX = 'lifestyle'

/** How long a signed preview URL lasts. Long enough to sit on an open tab. */
export const LIFESTYLE_SIGNED_TTL = 60 * 60

/** Normalised to JPEG on upload, so the extension is never in question. */
export const LIFESTYLE_EXT = '.jpg'

export function lifestylePath(materialSlug: string): string {
  return `${LIFESTYLE_PREFIX}/${materialSlug}${LIFESTYLE_EXT}`
}

export interface LifestyleEntry {
  path: string
  updatedAt: string | null
}

/**
 * Which materials have a lifestyle photo, from one storage listing.
 *
 * Returns an empty map rather than throwing when the prefix does not exist
 * yet — before the first upload there is simply no folder, and that is the
 * ordinary state, not an error. Callers fall back to plain description text.
 */
export async function lifestyleIndex(
  // The admin client — the bucket is private and has no policies.
  admin: SupabaseClient,
): Promise<Map<string, LifestyleEntry>> {
  const index = new Map<string, LifestyleEntry>()

  const { data, error } = await admin.storage
    .from(LIFESTYLE_BUCKET)
    .list(LIFESTYLE_PREFIX, { limit: 100 })

  if (error || !data) return index

  for (const obj of data) {
    if (!obj.name.endsWith(LIFESTYLE_EXT)) continue
    const slug = obj.name.slice(0, -LIFESTYLE_EXT.length)
    index.set(slug, {
      path: `${LIFESTYLE_PREFIX}/${obj.name}`,
      updatedAt: obj.updated_at ?? obj.created_at ?? null,
    })
  }

  return index
}

/**
 * Signed URLs for an index, keyed by material slug.
 *
 * One round trip for all of them. A path that fails to sign is left out rather
 * than returned as null, so a caller can treat "in the map" as "displayable".
 */
export async function signLifestyleUrls(
  admin: SupabaseClient,
  index: Map<string, LifestyleEntry>,
): Promise<Record<string, string>> {
  const slugs = [...index.keys()]
  if (slugs.length === 0) return {}

  const paths = slugs.map(s => index.get(s)!.path)
  const { data } = await admin.storage
    .from(LIFESTYLE_BUCKET)
    .createSignedUrls(paths, LIFESTYLE_SIGNED_TTL)

  const urls: Record<string, string> = {}
  for (let i = 0; i < slugs.length; i++) {
    const signed = data?.[i]?.signedUrl
    if (signed) urls[slugs[i]] = signed
  }
  return urls
}
