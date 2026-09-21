/**
 * DocuSeal webhook signature verification.
 *
 * DocuSeal sends  X-Docuseal-Signature: <unix timestamp>.<hex signature>
 * where the signature is HMAC-SHA256 over "<timestamp>.<raw body>", keyed with
 * the whsec_… secret exactly as DocuSeal shows it (prefix included).
 * (docuseal.com/resources/use-webhooks)
 *
 * Its own module because a Next.js route file may export only its handlers.
 */

import { createHmac, timingSafeEqual } from 'crypto'

/** How old a signed request may be. DocuSeal's own recommendation. */
const TOLERANCE_SECONDS = 300

/**
 * Verifies X-Docuseal-Signature. `nowSeconds` is injectable so the time window can be
 * tested without waiting.
 */
export function verifyDocusealSignature(
  rawBody: string,
  header: string | null,
  secret: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret || !header) return false
  const dot = header.indexOf('.')
  if (dot <= 0) return false
  const timestamp = header.slice(0, dot)
  const signature = header.slice(dot + 1)
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > TOLERANCE_SECONDS) return false

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
  if (expected.length !== signature.length) return false
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

