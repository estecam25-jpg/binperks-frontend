/**
 * POST /api/member/scan/photo
 *
 * Stores the member's own scan photo, after the AI result is already on screen.
 *
 * ── THIS REVERSES AN EARLIER PRIVACY POSITION ──
 * The scanner previously kept a SHA-256 hash of the photo and nothing else,
 * deliberately: the hash proves two scans were the same picture without the
 * picture ever being retained. Photos are now retained so members can see
 * their own history in My Finds. The hash is still written alongside.
 *
 * What that costs, stated plainly so it is not rediscovered later:
 *   - BinPerks now holds member-generated images, which it did not before
 *   - the bucket is PRIVATE and every read is a short-lived signed URL
 *   - a photo is reachable only by the member who took it
 *   - photos are removed when a member deactivates their account
 *   - the Privacy Policy needs updating — flagged for attorney review
 *
 * EVERY PHOTO IS RE-ENCODED SERVER-SIDE before it is stored. The browser
 * already re-encodes through a canvas, which drops EXIF (and with it GPS) as a
 * side effect of how canvas works — but that is the client's behaviour, and a
 * request to this route does not have to come from that client. sharp reads the
 * pixels and writes a fresh JPEG with no metadata, so location data cannot
 * reach the bucket even if the upload was hand-made. Defence in depth, not a
 * replacement for the client-side downscale.
 *
 * Never blocks the scan: the client fires this after the result renders and
 * ignores the outcome.
 *
 * Auth: member session. Storage: admin client — the bucket is private and has
 * no public policies.
 */

import sharp from 'sharp'
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

/** Matches the bucket's own file_size_limit. Anything larger is a bug in the
 *  client-side downscale, not something to quietly accept. */
const MAX_BYTES = 1_048_576

/** Longest edge of the stored photo. Above what the client sends (1024px), so
 *  a normal upload is re-encoded but never upscaled. */
const MAX_EDGE_PX = 1200
const JPEG_QUALITY = 85

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const admin = createAdminSupabaseClient()
  const { data: member } = await admin
    .from('members')
    .select('id, is_blacklisted, status')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!member || member.is_blacklisted || member.status !== 'active') {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const body = await req.json().catch(() => null) as
    { scanEventId?: string; image?: string } | null

  const scanEventId = body?.scanEventId
  const image = body?.image
  if (!scanEventId || !image) {
    return NextResponse.json({ error: 'scanEventId and image required' }, { status: 400 })
  }

  // The scan must belong to THIS member. Without this check a member could
  // overwrite someone else's photo by passing their scan id.
  const { data: scan } = await admin
    .from('scanner_events')
    .select('id, member_id')
    .eq('id', scanEventId)
    .maybeSingle()

  if (!scan || scan.member_id !== member.id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const match = /^data:image\/jpe?g;base64,(.+)$/.exec(image)
  if (!match) {
    return NextResponse.json({ error: 'expected a base64 JPEG data URL' }, { status: 400 })
  }

  const bytes = Buffer.from(match[1], 'base64')
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'image_too_large' }, { status: 413 })
  }

  // Keyed by member AND scan, so the path itself carries ownership and a member
  // can never write outside their own folder.
  const path = `${member.id}/${scanEventId}.jpg`

  // Re-encode from the decoded pixels. No .withMetadata(): that would copy the
  // EXIF block — including GPS — straight into the stored file, which is the
  // opposite of the point. .rotate() applies the orientation tag first, so the
  // picture stays the right way up once that tag is gone.
  let encoded: Buffer
  try {
    encoded = await sharp(bytes)
      .rotate()
      .resize(MAX_EDGE_PX, MAX_EDGE_PX, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer()
  } catch (err) {
    console.error('[member/scan/photo] re-encode failed:', err)
    return NextResponse.json({ error: 'unreadable_image' }, { status: 400 })
  }

  // The bucket enforces this too; failing here gives a clearer log line than a
  // storage rejection would.
  if (encoded.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'image_too_large' }, { status: 413 })
  }

  const { error: uploadError } = await admin.storage
    .from('scan-photos')
    .upload(path, encoded, { contentType: 'image/jpeg', upsert: true })

  if (uploadError) {
    console.error('[member/scan/photo] upload failed:', uploadError)
    return NextResponse.json({ error: 'upload_failed' }, { status: 500 })
  }

  // The PATH, never a URL: a signed URL expires, and a stored one would outlive
  // its own expiry and become a dead link — or worse, be treated as shareable.
  const { error: updateError } = await admin
    .from('scanner_events')
    .update({ photo_storage_path: path })
    .eq('id', scanEventId)

  if (updateError) {
    console.error('[member/scan/photo] path write failed:', updateError)
    return NextResponse.json({ error: 'save_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
