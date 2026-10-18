/**
 * The optional store website, normalized once.
 *
 * CLIENT-SAFE — one pure function, no imports.
 *
 * Merchants type a website the way they say it out loud: "acmebins.com",
 * "www.acmebins.com", sometimes with a scheme, occasionally with a trailing
 * slash or a stray space. Three forms collect it (signup, pre-setup, Settings)
 * and all three store the same thing, so the normalising lives here rather
 * than three times.
 *
 * ALWAYS https. A merchant who types "http://" gets https anyway: every host
 * worth linking to serves it, and storing the insecure form would mean linking
 * members to it later.
 *
 * REJECTS RATHER THAN GUESSES. Something with no dot in it is a typo, not a
 * domain, and saving it would put a dead link in front of a member when this
 * eventually reaches the store card. Empty is not an error — the field is
 * optional, and null is the right answer for "not given".
 */

/** The result of normalising. `ok: false` carries a message for the form. */
export type WebsiteResult =
  | { ok: true; url: string | null }
  | { ok: false; message: string }

export function normalizeWebsiteUrl(input: unknown): WebsiteResult {
  const raw = String(input ?? '').trim()
  if (!raw) return { ok: true, url: null }      // optional

  // Strip a scheme if present; everything is re-prefixed with https below.
  const withoutScheme = raw.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '')
  if (!withoutScheme) return { ok: false, message: 'That does not look like a website address.' }

  let parsed: URL
  try {
    parsed = new URL(`https://${withoutScheme}`)
  } catch {
    return { ok: false, message: 'That does not look like a website address.' }
  }

  // A hostname with no dot is a single label — "localhost", or a typo like
  // "acmebins". Neither is a site a member could visit.
  if (!parsed.hostname.includes('.') || parsed.hostname.endsWith('.')) {
    return { ok: false, message: 'Include the full address, like acmebins.com.' }
  }
  // Spaces survive URL parsing as %20 and are always a mistake here.
  if (/\s/.test(withoutScheme)) {
    return { ok: false, message: 'A website address cannot contain spaces.' }
  }

  // Drop a bare trailing slash so "acmebins.com" and "acmebins.com/" store the
  // same, and keep any real path the merchant meant to include.
  const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '')
  return { ok: true, url: `https://${parsed.hostname.toLowerCase()}${path}${parsed.search}` }
}

/** Convenience for server code that has already validated, or does not care:
 *  returns the normalized URL or null, never throws. */
export function websiteUrlOrNull(input: unknown): string | null {
  const r = normalizeWebsiteUrl(input)
  return r.ok ? r.url : null
}
