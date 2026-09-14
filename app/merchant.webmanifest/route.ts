/**
 * GET /merchant.webmanifest — the BinPerks Merchant app manifest.
 *
 * Not requested by this name in practice: middleware.ts rewrites
 * /manifest.webmanifest to here when the host is merchant.binperks.com, so
 * every page on that subdomain links this manifest through the same
 * <link rel="manifest"> Next already emits for app/manifest.ts. On
 * app.binperks.com that link still resolves to the member manifest.
 *
 * Contents live in lib/pwa-manifest (PWA_APPS.merchant).
 */

import { pwaManifestResponse } from '@/lib/pwa-manifest'

// Nothing here varies by request, so build it once.
export const dynamic = 'force-static'

export function GET() {
  return pwaManifestResponse('merchant')
}
