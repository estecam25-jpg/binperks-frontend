/**
 * GET /cashier.webmanifest — the BinPerks Cashier app manifest.
 *
 * Not requested by this name in practice: middleware.ts rewrites
 * /manifest.webmanifest to here when the host is stamptool.binperks.com, so
 * every page on the subdomain links the cashier manifest through the same
 * <link rel="manifest"> Next already emits for app/manifest.ts. On
 * app.binperks.com that same link still resolves to the member manifest.
 *
 * WHY A SEPARATE ORIGIN AT ALL: a browser installs one app per manifest scope,
 * and the member app already claims app.binperks.com. The cashier app needs its
 * own origin to be installable next to it with its own name, icon label and
 * start screen.
 *
 * start_url is absolute and only valid when served from that origin — a
 * browser ignores a cross-origin start_url — which is exactly the case the
 * rewrite guarantees.
 */

import type { MetadataRoute } from 'next'
import { BINPERKS_MANIFEST_ICONS, STAMPTOOL_ORIGIN } from '@/lib/pwa-manifest'

// Nothing here varies by request, so build it once.
export const dynamic = 'force-static'

export function GET() {
  const manifest: MetadataRoute.Manifest = {
    name:             'BinPerks Cashier',
    short_name:       'Cashier',
    start_url:        STAMPTOOL_ORIGIN,
    display:          'standalone',
    theme_color:      '#4A4B98',
    background_color: '#4A4B98',
    icons:            BINPERKS_MANIFEST_ICONS,
  }

  return new Response(JSON.stringify(manifest), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' },
  })
}
