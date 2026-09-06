/**
 * "What's In The Bins" photo store.
 *
 * Merchants upload photos of what is actually in their bins this week; members
 * see them on the store's View Perks panel. One store, at most MAX_PHOTOS_PER_STORE
 * active photos.
 *
 * PATHS, NEVER URLS — the same rule as scan photos and representative images.
 * store_bin_photos.storage_path holds "<store_id>/<photo_id>.jpg" and every read
 * mints a signed URL that expires within the hour. A stored URL outlives its own
 * expiry and starts being treated as shareable.
 *
 * The path is keyed by store id, so the path itself carries ownership: a
 * merchant cannot write outside their own store's folder even if a store id
 * were spoofed, because the route verifies the store belongs to them first.
 */

import sharp from 'sharp'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

export const BIN_PHOTOS_BUCKET = 'bin-photos'

/** Matches the product/scan photo convention: long enough to browse, short
 *  enough that a URL copied out of the network tab stops working the same day. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60

/** Per the spec. Enforced in the POST route, not just the UI. */
export const MAX_PHOTOS_PER_STORE = 5

/** A bin photo is a wide shot of a table, not a gallery print. */
const MAX_EDGE_PX = 1024
const JPEG_QUALITY = 80

/** Ceiling on the upload before re-encoding. A modern phone photo is 3-8MB;
 *  this refuses something pathological without rejecting normal camera output. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024

export const MAX_CAPTION_LENGTH = 120

export function binPhotoPath(storeId: string, photoId: string): string {
  return `${storeId}/${photoId}.jpg`
}

/**
 * Re-encode an uploaded image to a bounded JPEG.
 *
 * Throws on anything sharp cannot read, which the caller turns into a 400 —
 * an unreadable upload is the member's file being wrong, not a server fault.
 *
 * EXIF AND GPS ARE DROPPED. sharp writes no metadata unless asked, and
 * .withMetadata() is deliberately not called: a merchant photographing their
 * own shop floor should not be publishing its coordinates to every member.
 * .rotate() consumes the orientation tag before the resize so the pixels come
 * out upright and the tag itself does not survive.
 */
export async function encodeBinPhoto(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes)
    .rotate()
    .resize(MAX_EDGE_PX, MAX_EDGE_PX, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer()
}

/** Sign one stored path. Null rather than throwing — a missing file costs a
 *  thumbnail, never the page around it. */
export async function signBinPhoto(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  path: string,
): Promise<string | null> {
  const { data, error } = await admin.storage
    .from(BIN_PHOTOS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error) {
    console.error('[bin-photos] sign failed:', error.message)
    return null
  }
  return data?.signedUrl ?? null
}

/** Sign several at once. Returns path -> URL, skipping whatever failed. */
export async function signBinPhotos(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  paths: string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  if (paths.length === 0) return out

  const { data, error } = await admin.storage
    .from(BIN_PHOTOS_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)

  if (error) {
    console.error('[bin-photos] batch sign failed:', error.message)
    return out
  }
  for (let i = 0; i < (data?.length ?? 0); i++) {
    const url = data?.[i]?.signedUrl
    if (url) out[paths[i]] = url
  }
  return out
}

/**
 * The store ids belonging to a merchant.
 *
 * Every bin-photo route resolves ownership through this rather than trusting a
 * storeId from the request body — otherwise a merchant could attach photos to,
 * or delete photos from, somebody else's location.
 */
export async function merchantStoreIds(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  merchantId: string,
): Promise<string[]> {
  const { data } = await admin
    .from('stores')
    .select('id')
    .eq('merchant_id', merchantId)
  return (data ?? []).map(s => s.id as string)
}
