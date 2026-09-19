/**
 * The BinPerks social media post kit.
 *
 * ONE SET FOR THE WHOLE NETWORK, written by admin. Every merchant's Marketing
 * tab shows the same artwork and the same caption; only the join link differs,
 * substituted per store when the caption is rendered. That is the whole reason
 * this is admin-managed rather than per-merchant — BinPerks controls the
 * wording, the merchant supplies nothing but their own link.
 *
 * PATHS, NEVER URLS — the same rule as bin photos, scan photos and
 * representative images. binperks_social_graphics.storage_path holds
 * "<image_id>.jpg" and every read mints a signed URL that expires within the
 * hour. A stored URL outlives its own expiry and starts being treated as
 * shareable.
 */

import sharp from 'sharp'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

/**
 * Re-exported from lib/social-caption, which is the browser-safe half.
 *
 * THIS MODULE IS SERVER-ONLY — it imports sharp and the service-role client —
 * so the merchant Marketing tab, a client component, imports the token and the
 * substitution from there instead. Re-exporting keeps one import for server
 * code without giving anyone a reason to define a second copy of the token.
 */
export { REFERRAL_LINK_TOKEN, MAX_CAPTION_LENGTH, personalizeCaption } from '@/lib/social-caption'

export const SOCIAL_GRAPHICS_BUCKET = 'social-media-graphics'

/** Matches the bin-photo convention: long enough to browse, short enough that
 *  a URL copied out of the network tab stops working the same day. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60

/** Per the spec. Enforced in the POST route, not just the UI. */
export const MAX_SOCIAL_GRAPHICS = 10

/**
 * Square, because the strip is 1:1 and Instagram's feed is.
 *
 * `fit: 'cover'` crops rather than letterboxes: a graphic that arrives at 4:5
 * should fill its tile, not sit in grey bars. Admin supplies the artwork, so
 * cropping to the centre is the predictable behaviour to give them.
 *
 * NO `withoutEnlargement`. It reads like a sensible guard but it silently
 * breaks the square: with it set, a 1600x900 upload came out 1080x900, because
 * sharp refuses to scale the short edge up and cover then has nothing to crop
 * against. The contract here is "always 1:1", so an undersized graphic is
 * upscaled rather than returned the wrong shape.
 */
const EDGE_PX = 1080
const JPEG_QUALITY = 85

/** Ceiling before re-encoding. Refuses something pathological without
 *  rejecting a normal export from a design tool. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024

export function socialGraphicPath(imageId: string): string {
  return `${imageId}.jpg`
}

/**
 * Re-encode an upload to a bounded square JPEG.
 *
 * Throws on anything sharp cannot read, which the caller turns into a 400 —
 * an unreadable upload is the file being wrong, not a server fault.
 *
 * EXIF IS DROPPED. sharp writes no metadata unless asked, and .withMetadata()
 * is deliberately not called. .rotate() consumes the orientation tag before
 * the resize so the pixels come out upright and the tag does not survive.
 */
export async function encodeSocialGraphic(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes)
    .rotate()
    .resize(EDGE_PX, EDGE_PX, { fit: 'cover', position: 'centre' })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer()
}

/** Sign several stored paths at once. Returns path -> URL, skipping whatever
 *  failed — a missing file costs one tile, never the section around it. */
export async function signSocialGraphics(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  paths: string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  if (paths.length === 0) return out

  const { data, error } = await admin.storage
    .from(SOCIAL_GRAPHICS_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)

  if (error) {
    console.error('[social-graphics] batch sign failed:', error.message)
    return out
  }
  for (let i = 0; i < (data?.length ?? 0); i++) {
    const url = data?.[i]?.signedUrl
    if (url) out[paths[i]] = url
  }
  return out
}

export interface SocialGraphicRow {
  id: string
  storage_path: string
  display_order: number | null
  created_at: string | null
}

/**
 * The whole kit: ordered images with signed URLs, and the raw caption.
 *
 * Shared by the admin route and the merchant route so the two can never
 * disagree about the order or about which images are live. The caption comes
 * back RAW, token and all — substitution is the caller's job, because only the
 * merchant route knows whose link to put in.
 */
export async function loadSocialKit(
  admin: ReturnType<typeof createAdminSupabaseClient>,
): Promise<{ images: { id: string; url: string | null; displayOrder: number }[]; caption: string | null }> {
  const [{ data: rows }, { data: settings }] = await Promise.all([
    admin
      .from('binperks_social_graphics')
      .select('id, storage_path, display_order, created_at')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true }),
    admin
      .from('binperks_social_settings')
      .select('caption')
      .eq('id', 'default')
      .maybeSingle(),
  ])

  const list = (rows ?? []) as SocialGraphicRow[]
  const signed = await signSocialGraphics(admin, list.map(r => r.storage_path))

  return {
    images: list.map(r => ({
      id:           r.id,
      url:          signed[r.storage_path] ?? null,
      displayOrder: r.display_order ?? 0,
    })),
    caption: (settings?.caption as string | null) ?? null,
  }
}
