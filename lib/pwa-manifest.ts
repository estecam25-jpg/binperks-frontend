import type { MetadataRoute } from 'next'

/**
 * Icons shared by every installable app — the member app (app/manifest.ts) and
 * each subdomain app below. One list so they can never ship different artwork.
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
 * The subdomain apps: one installable PWA per audience, each on its own origin.
 *
 * WHY SEPARATE ORIGINS: a browser installs one app per manifest scope, and the
 * member app already claims app.binperks.com. Cashier, merchant and admin each
 * need their own origin to install alongside it with their own name and start
 * screen.
 *
 * ONE REGISTRY drives all three layers, so adding an app is one entry here:
 *   middleware.ts                  host → rewrite of / and /manifest.webmanifest
 *   app/<id>.webmanifest/route.ts  the manifest itself (pwaAppManifest)
 *   components/pwa/InstallAppBanner  the install prompt and its dismissal key
 *
 * `<id>.localhost` is for local testing: browsers resolve any *.localhost name
 * to 127.0.0.1, so http://merchant.localhost:3000 exercises the same host branch
 * as production without touching DNS.
 *
 * SESSIONS ARE PER-ORIGIN. Supabase auth cookies set on merchant.binperks.com
 * are not sent to app.binperks.com and vice versa, so a merchant signs in once
 * on the subdomain. That is also what finally separates the admin and merchant
 * sessions that used to overwrite each other in one browser.
 */
export type PwaAppId = 'cashier' | 'merchant' | 'admin'

export interface PwaApp {
  id:           PwaAppId
  name:         string
  shortName:    string
  /** Production origin; also the manifest's absolute start_url. */
  origin:       string
  hosts:        ReadonlySet<string>
  /** What `/` shows on the subdomain — and so what the installed app opens to. */
  homePath:     string
  /** Internal route serving this app's manifest (rewritten from /manifest.webmanifest). */
  manifestPath: string
  /** localStorage key recording that the install banner was dismissed. */
  dismissKey:   string
  bannerHeading: string
  bannerBody:    string
}

export const PWA_APPS: Record<PwaAppId, PwaApp> = {
  cashier: {
    id:            'cashier',
    name:          'BinPerks Cashier',
    shortName:     'Cashier',
    origin:        'https://stamptool.binperks.com',
    hosts:         new Set(['stamptool.binperks.com', 'stamptool.localhost']),
    homePath:      '/stamptool',
    manifestPath:  '/cashier.webmanifest',
    dismissKey:    'cashier-pwa-dismissed',
    bannerHeading: 'Install the Cashier App',
    bannerBody:    'Add BinPerks Cashier to your home screen for quick access during your shift.',
  },
  merchant: {
    id:            'merchant',
    name:          'BinPerks Merchant',
    shortName:     'Merchant',
    origin:        'https://merchant.binperks.com',
    hosts:         new Set(['merchant.binperks.com', 'merchant.localhost']),
    homePath:      '/merchant/dashboard',
    manifestPath:  '/merchant.webmanifest',
    dismissKey:    'merchant-pwa-dismissed',
    bannerHeading: 'Install the Merchant App',
    bannerBody:    'Add BinPerks Merchant to your home screen for quick access to your dashboard.',
  },
  admin: {
    id:            'admin',
    name:          'BinPerks Admin',
    shortName:     'Admin',
    origin:        'https://admin.binperks.com',
    hosts:         new Set(['admin.binperks.com', 'admin.localhost']),
    homePath:      '/admin/dashboard',
    manifestPath:  '/admin.webmanifest',
    dismissKey:    'admin-pwa-dismissed',
    bannerHeading: 'Install the Admin App',
    bannerBody:    'Add BinPerks Admin to your home screen for quick access to the admin dashboard.',
  },
}

/** The member app and everything not claimed by a subdomain app below. */
export const MEMBER_APP_ORIGIN = 'https://app.binperks.com'

/**
 * Which app a path belongs to, by its first segment — 'member' meaning the main
 * app.binperks.com site. null for paths every host shares: /api, /terms, the
 * manifests, static files, and the cashier store keys (/FL-Tampa-EstaBins).
 *
 * Exact-match or followed by "/" so sibling routes are not swallowed:
 * "/merchant.webmanifest" is not "/merchant/…" and must keep resolving.
 */
export function appForPath(pathname: string): PwaAppId | 'member' | null {
  const owns = (prefix: string) => pathname === prefix || pathname.startsWith(prefix + '/')
  if (owns('/stamptool')) return 'cashier'
  if (owns('/merchant'))  return 'merchant'
  if (owns('/admin'))     return 'admin'
  if (owns('/member'))    return 'member'
  return null
}

/** The subdomain app a hostname belongs to, or null (e.g. app.binperks.com). */
export function pwaAppForHost(hostname: string): PwaApp | null {
  const h = hostname.toLowerCase()
  return Object.values(PWA_APPS).find(app => app.hosts.has(h)) ?? null
}

/**
 * The manifest for one subdomain app.
 *
 * start_url is absolute and only valid when served from that app's own origin —
 * a browser ignores a cross-origin start_url — which is exactly what the
 * middleware rewrite guarantees.
 */
export function pwaAppManifest(id: PwaAppId): MetadataRoute.Manifest {
  const app = PWA_APPS[id]
  return {
    name:             app.name,
    short_name:       app.shortName,
    start_url:        app.origin,
    display:          'standalone',
    theme_color:      '#4A4B98',
    background_color: '#4A4B98',
    icons:            BINPERKS_MANIFEST_ICONS,
  }
}

/** A manifest Response with the right content type. */
export function pwaManifestResponse(id: PwaAppId): Response {
  return new Response(JSON.stringify(pwaAppManifest(id)), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' },
  })
}
