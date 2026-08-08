import type { MetadataRoute } from 'next'

/**
 * Web app manifest — what a member gets if they add BinPerks to their home
 * screen. This is the mechanism that makes the 192/512 icons meaningful;
 * metadata.icons alone only feeds browser tabs and iOS.
 *
 * theme_color is BinPerks blue and background_color is white, matching the
 * app's own chrome rather than the logo's red circle — the splash screen
 * should read as the app, not as the mark.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BinPerks',
    short_name: 'BinPerks',
    description: 'Loyalty rewards for bin stores',
    start_url: '/',
    display: 'standalone',
    background_color: '#FFFFFF',
    theme_color: '#4A4B98',
    icons: [
      { src: '/favicon.ico',  sizes: 'any',     type: 'image/x-icon' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon.png',     sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }
}
