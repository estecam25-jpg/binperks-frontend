/**
 * Lifestyle photos — the example shot on each merchant marketing card.
 *
 * NOT THE PRINTABLE ARTWORK. marketing_templates holds what gets composed into
 * a download — the design, with its [STORE NAME] and [QR CODE] rectangles.
 * This is a photograph of the finished thing in use, shown on the card in the
 * merchant's Marketing tab so they can see what they are about to print before
 * they print it. Nothing here is ever composited or downloaded.
 *
 * ONE PER MATERIAL, where base artwork is one per DESIGN. The five poster
 * designs are five templates but a single material, and one photo of a poster
 * on a wall stands for all five.
 *
 * THE PATH IS STORED, NOT DERIVED. It was derived from the slug while the six
 * materials were fixed in code. Now that admin can rename and add materials,
 * marketing_materials.lifestyle_image_path is the record — a rename must not
 * silently detach a photo that is still sitting in the bucket.
 *
 * PRIVATE BUCKET. Every URL is signed per request and short-lived, which also
 * means replacing a photo cannot serve a stale cached copy the way a public
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
export const LIFESTYLE_EXT = '.jpg'

/** How long a signed preview URL lasts. Long enough to sit on an open tab. */
export const LIFESTYLE_SIGNED_TTL = 60 * 60

/**
 * Stored square at this size.
 *
 * The photo lands in a box about 230px wide on the card, so 1024 is generous
 * even on a retina screen, and a merchant on a phone should not download a
 * 12MP camera original to see a picture of a table tent.
 */
export const LIFESTYLE_PX = 1024

/** Where a material's photo lives. Keyed on the material slug, which is unique
 *  and never reused, so two materials cannot overwrite each other. */
export function lifestylePathFor(materialSlug: string): string {
  return `${LIFESTYLE_PREFIX}/${materialSlug}${LIFESTYLE_EXT}`
}

/**
 * Signed URLs for a set of paths in one bucket, keyed by path.
 *
 * One round trip however many are asked for. A path that fails to sign is left
 * out rather than returned as null, so "in the map" means "displayable".
 * Returns empty for an empty list instead of calling out at all.
 */
export async function signPaths(
  // The admin client — these buckets are private and have no policies.
  admin: SupabaseClient,
  bucket: string,
  paths: string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(paths)]
  if (unique.length === 0) return {}

  const { data } = await admin.storage.from(bucket).createSignedUrls(unique, LIFESTYLE_SIGNED_TTL)

  const urls: Record<string, string> = {}
  for (let i = 0; i < unique.length; i++) {
    const signed = data?.[i]?.signedUrl
    if (signed) urls[unique[i]] = signed
  }
  return urls
}
