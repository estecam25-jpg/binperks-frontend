/**
 * Validation for the scanner's representative product image URL.
 *
 * Lives here rather than inline in /api/member/scan because it is the guard
 * between a model-generated string and an <img src> in a member's browser,
 * and that is worth being able to test on its own.
 *
 * What this can and cannot do: the scanner model has no web access, so the
 * URL it returns is recalled from training, not looked up. We cannot confirm
 * it resolves, and we cannot confirm it depicts the right product. What we
 * can do is refuse anything that should never reach an <img> at all. The
 * client hides whatever survives if it fails to load, and labels it as
 * representative rather than the actual item.
 */

/** Hosts a hallucinated URL lands on often enough to be worth dropping before
 *  the browser ever requests them. */
const PLACEHOLDER_HOSTS = ['example.com', 'example.org', 'example.net', 'localhost']

/** Longer than any real image URL; a longer string is malformed or an attempt
 *  to smuggle a payload. */
const MAX_URL_LENGTH = 2000

/**
 * Return a plausible public https image URL, or '' to mean "show nothing".
 *
 * Rejects: non-https schemes (data:, javascript:, file:, http:), unparseable
 * strings, placeholder hosts, and absurd lengths.
 */
export function sanitizeImageUrl(raw: unknown): string {
  if (raw === null || raw === undefined) return ''

  const value = String(raw).trim()
  // The model sometimes writes the word rather than a JSON null.
  if (!value || value === 'null' || value === 'undefined') return ''
  if (value.length > MAX_URL_LENGTH) return ''

  try {
    const url = new URL(value)
    // https only. This is what rules out data: and javascript: payloads, and
    // it keeps a member's browser from making a plaintext request.
    if (url.protocol !== 'https:') return ''

    const host = url.hostname.toLowerCase()
    if (PLACEHOLDER_HOSTS.some(h => host === h || host.endsWith(`.${h}`))) return ''

    return url.toString()
  } catch {
    return ''   // not a parseable absolute URL
  }
}
