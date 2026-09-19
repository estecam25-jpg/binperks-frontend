/**
 * The caption half of the social post kit — the part the BROWSER needs.
 *
 * SEPARATE FROM lib/social-graphics ON PURPOSE. That module imports sharp and
 * the service-role Supabase client, both server-only; the merchant Marketing
 * tab is a client component and importing the token from there would pull a
 * native image library into the browser bundle. Everything here is plain
 * string work and is safe on either side.
 *
 * lib/social-graphics re-exports both of these, so server code has one import
 * to reach for and the two can never drift apart.
 */

/**
 * The token admin writes in the caption where each merchant's own join link
 * should appear.
 *
 * ONE CONSTANT, never retyped: it is shown to admin as the thing to type,
 * matched when substituting, and counted when warning that a caption has no
 * link in it. Three places that must agree exactly.
 */
export const REFERRAL_LINK_TOKEN = '[put your referral link here]'

/** Instagram's own caption ceiling. Enforced in the PATCH route, and counted
 *  down in the admin textarea so the limit is visible before it bites. */
export const MAX_CAPTION_LENGTH = 2200

/**
 * Put a merchant's own join link into the admin caption.
 *
 * Case-insensitive and global: admin is typing the token by hand into a
 * textarea, so "[Put your referral link here]" is the same intent, and a
 * caption that mentions the link twice should have both replaced.
 *
 * Returns the caption unchanged when there is no token — a caption without one
 * is still a valid caption, just one that carries no link.
 */
export function personalizeCaption(caption: string, joinUrl: string): string {
  if (!caption) return ''
  const escaped = REFERRAL_LINK_TOKEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return caption.replace(new RegExp(escaped, 'gi'), joinUrl)
}
