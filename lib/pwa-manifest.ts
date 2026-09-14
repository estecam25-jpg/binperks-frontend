import type { MetadataRoute } from 'next'

/**
 * Icons shared by both installable apps — the member app (app/manifest.ts) and
 * the cashier app (app/cashier.webmanifest/route.ts). One list so the two can
 * never ship different artwork.
 */
export const BINPERKS_MANIFEST_ICONS: NonNullable<MetadataRoute.Manifest['icons']> = [
  { src: '/favicon.ico',  sizes: 'any',     type: 'image/x-icon' },
  { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/icon.png',     sizes: '512x512', type: 'image/png', purpose: 'any' },

  // Android needs a maskable icon or it ignores the ones above and falls
  // back to a generated glyph — which is why the icon appeared on iPhone
  // but not on Android. A launcher crops this to its own shape (circle,
  // squircle, rounded square), so the artwork is full-bleed #DA1212 with
  // the logo confined to the centre 80% safe zone. See public/icon-maskable.png.
  { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
]

/**
 * Hosts that serve the cashier stamp tool as its own installable app.
 *
 * stamptool.localhost is for local testing only: browsers resolve any
 * *.localhost name to 127.0.0.1, so http://stamptool.localhost:3000 exercises
 * the same host branch as production without touching DNS.
 */
export const STAMPTOOL_HOSTS: ReadonlySet<string> = new Set([
  'stamptool.binperks.com',
  'stamptool.localhost',
])

export const STAMPTOOL_ORIGIN = 'https://stamptool.binperks.com'
