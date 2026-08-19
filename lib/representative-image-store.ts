/**
 * Representative image store.
 *
 * A representative image is a reference photo of a PRODUCT — not of the item in
 * the bin. One copy is kept per product_catalog row, so a hundred members
 * scanning the same DEWALT drill cost one download and one stored file.
 *
 * ── WHAT CHANGED, AND WHY IT IS NOT THE SAME AS BEFORE ──
 * The provider's URL is still never written anywhere. What is stored is a copy
 * BinPerks downloads, re-encodes, and hosts itself, keyed by catalog id — a
 * different act from persisting a provider result, and the reason the provider
 * contract in lib/providers/brave-images is unchanged.
 *
 * That distinction is about the provider's terms. It says nothing about who
 * owns the picture: representative images are third-party product photography,
 * so this belongs in the standing attorney review package alongside the scan
 * photo retention note (see /api/member/scan/photo).
 *
 * PATHS, NEVER URLS. product_catalog.representative_image_path holds
 * "<catalog_id>.jpg"; every read mints a signed URL that expires within the
 * hour. A stored URL outlives its own expiry and starts looking shareable.
 */

import sharp from 'sharp'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

export const REPRESENTATIVE_BUCKET = 'representative-images'

/** Same hour as the member's own scan photos, for the same reason: long enough
 *  to browse a page of history, short enough to be useless tomorrow. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60

/** Reference photos, not gallery images. 512px is plenty at the sizes these
 *  render, and quality 75 is where JPEG stops paying for itself. */
const MAX_EDGE_PX = 512
const JPEG_QUALITY = 75

/** Ceiling on what is pulled off the network before re-encoding. Generous for a
 *  product photo, small enough that a mislabelled 40MB TIFF cannot sit in
 *  memory. Matched by the bucket's own 1MB limit on the way out, which the
 *  re-encode lands well inside. */
const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024

const DOWNLOAD_TIMEOUT_MS = Number(process.env.REPRESENTATIVE_IMAGE_TIMEOUT_MS ?? 5000)

/** "<catalog id>.jpg" — one file per product, overwritten rather than
 *  accumulating versions. */
export function representativeImagePath(catalogId: string): string {
  return `${catalogId}.jpg`
}

/**
 * Mint a signed URL for an already-stored image.
 *
 * Returns null rather than throwing: a missing file costs a thumbnail, never a
 * scan result or a page of history.
 */
export async function signRepresentativeImage(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  path: string,
): Promise<string | null> {
  const { data, error } = await admin.storage
    .from(REPRESENTATIVE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error) {
    console.error('[representative-image] sign failed:', error.message)
    return null
  }
  return data?.signedUrl ?? null
}

/** Sign several at once. Returns a path → URL map, skipping whatever failed. */
export async function signRepresentativeImages(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  paths: string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  if (paths.length === 0) return out

  const { data, error } = await admin.storage
    .from(REPRESENTATIVE_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)

  if (error) {
    console.error('[representative-image] batch sign failed:', error.message)
    return out
  }
  for (let i = 0; i < (data?.length ?? 0); i++) {
    const url = data?.[i]?.signedUrl
    if (url) out[paths[i]] = url
  }
  return out
}

/**
 * Download an image, re-encode it, store it, and record the path.
 *
 * Returns the signed URL on success and null on any failure — a dead link, a
 * timeout, an oversized body, an image sharp cannot read, a storage error. The
 * caller falls back to showing the provider's transient URL for that one
 * render, which is what happened before this existed.
 *
 * The catalog row is only updated AFTER the upload succeeds. A path written for
 * a file that is not there produces a broken thumbnail on every future scan of
 * that product, and nothing would retry it.
 */
export async function storeRepresentativeImage(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  catalogId: string,
  sourceUrl: string,
): Promise<string | null> {
  // https only. The URL comes from a third-party API response, so it is treated
  // as untrusted input and not as a resource we trust to be well-behaved.
  if (!sourceUrl.startsWith('https://')) return null

  let bytes: Buffer
  try {
    const res = await fetch(sourceUrl, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      // No cookies, no referrer — this is a fetch of a public asset, not a
      // request made on anyone's behalf.
      referrerPolicy: 'no-referrer',
      redirect: 'follow',
    })
    if (!res.ok) return null

    const declared = Number(res.headers.get('content-length') ?? 0)
    if (declared > MAX_DOWNLOAD_BYTES) return null

    const buf = Buffer.from(await res.arrayBuffer())
    // Checked again: content-length is a claim, not a guarantee.
    if (buf.byteLength === 0 || buf.byteLength > MAX_DOWNLOAD_BYTES) return null
    bytes = buf
  } catch {
    return null
  }

  let encoded: Buffer
  try {
    encoded = await sharp(bytes)
      .rotate()                                   // honour EXIF before resizing
      .resize(MAX_EDGE_PX, MAX_EDGE_PX, { fit: 'inside', withoutEnlargement: true })
      // JPEG has no alpha. Transparent PNGs — common for product cut-outs —
      // would otherwise composite onto black.
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer()
  } catch (err) {
    console.error('[representative-image] re-encode failed:', err)
    return null
  }

  const path = representativeImagePath(catalogId)

  const { error: uploadError } = await admin.storage
    .from(REPRESENTATIVE_BUCKET)
    .upload(path, encoded, { contentType: 'image/jpeg', upsert: true })

  if (uploadError) {
    console.error('[representative-image] upload failed:', uploadError.message)
    return null
  }

  const { error: updateError } = await admin
    .from('product_catalog')
    .update({ representative_image_path: path })
    .eq('id', catalogId)

  if (updateError) {
    // The file is stored but unreferenced. Logged loudly: the next scan of this
    // product will simply store it again over the same key, so this
    // self-corrects rather than leaking a new file each time.
    console.error('[representative-image] catalog update failed:', updateError.message)
  }

  return signRepresentativeImage(admin, path)
}
