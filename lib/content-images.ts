/**
 * Optional 1:1 artwork on the partner content cards — Sponsored Perks, Shop
 * From Home, Deals Near You.
 *
 * PATHS, NEVER URLS — the same rule as bin photos, scan photos and the social
 * graphics. `image_path` holds "<type-slug>/<uuid>.jpg" and every read mints a
 * signed URL that expires within the hour. A stored URL outlives its own
 * expiry and starts being treated as shareable.
 *
 * OPTIONAL THROUGHOUT. A null path is the normal case, and a card without one
 * renders exactly as it did before images existed. Nothing here ever turns an
 * absent image into an error.
 *
 * Paths are keyed by a fresh uuid rather than by the row id, because the image
 * is uploaded from the add/edit form BEFORE the row exists. Replacing an image
 * deletes the object the row used to point at, so the bucket does not
 * accumulate a copy per edit.
 */

import sharp from 'sharp'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import type { ContentType } from '@/lib/admin-content'

export const CONTENT_IMAGES_BUCKET = 'content-images'

/** Matches the other private buckets: long enough to browse, short enough that
 *  a URL copied out of the network tab stops working the same day. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60

/**
 * Square, because every card renders it 1:1.
 *
 * `fit: 'cover'` crops rather than letterboxes, and `withoutEnlargement` is
 * deliberately NOT set — with it, a 1600x900 upload comes out 800x450 instead
 * of square, because sharp refuses to scale the short edge up and cover then
 * has nothing to crop against. The contract is "always 1:1".
 *
 * 800px: these are 248px-wide carousel tiles, so this is generous at 2x and a
 * long way short of a full-size photo upload.
 */
const EDGE_PX = 800
const JPEG_QUALITY = 82

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024

/** Where a new image lands. The uuid keeps one object per upload. */
export function contentImagePath(slug: string, uuid: string): string {
  return `${slug}/${uuid}.jpg`
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
export async function encodeContentImage(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes)
    .rotate()
    .resize(EDGE_PX, EDGE_PX, { fit: 'cover', position: 'centre' })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer()
}

/** Sign several stored paths at once. Returns path -> URL, skipping whatever
 *  failed — a missing file costs one picture, never the card around it. */
export async function signContentImages(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  paths: string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const unique = [...new Set(paths.filter(Boolean))]
  if (unique.length === 0) return out

  const { data, error } = await admin.storage
    .from(CONTENT_IMAGES_BUCKET)
    .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS)

  if (error) {
    console.error('[content-images] batch sign failed:', error.message)
    return out
  }
  for (let i = 0; i < (data?.length ?? 0); i++) {
    const url = data?.[i]?.signedUrl
    if (url) out[unique[i]] = url
  }
  return out
}

/**
 * Add a signed `image_url` to every row that has an image_path.
 *
 * Used by the admin list, the admin write responses and the member feed, so
 * all three hand the client a usable URL and none of them hands out a path.
 * Rows of a type with no image field pass through untouched, which is what
 * keeps Promos and Suggested Perks out of this entirely.
 *
 * ONE round trip for the whole page rather than one per row.
 */
export async function attachImageUrls<T extends Record<string, unknown>>(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  type: ContentType,
  rows: T[],
): Promise<(T & { image_url?: string | null })[]> {
  if (!typeHasImage(type) || rows.length === 0) return rows

  const paths = rows
    .map(r => (typeof r.image_path === 'string' ? r.image_path : ''))
    .filter(Boolean)

  const signed = await signContentImages(admin, paths)

  return rows.map(r => ({
    ...r,
    image_url: typeof r.image_path === 'string' && r.image_path
      ? signed[r.image_path] ?? null
      : null,
  }))
}

/** Whether this content type carries artwork at all. */
export function typeHasImage(type: ContentType): boolean {
  return type.fields.some(f => f.kind === 'image')
}

/** Remove a stored object, ignoring failure. Called when an image is replaced
 *  or its row deleted; a leftover object is a cleanup task, never a reason to
 *  fail the write the admin actually asked for. */
export async function removeContentImage(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  path: string | null | undefined,
): Promise<void> {
  if (!path) return
  const { error } = await admin.storage.from(CONTENT_IMAGES_BUCKET).remove([path])
  if (error) console.error('[content-images] remove failed:', error.message)
}
