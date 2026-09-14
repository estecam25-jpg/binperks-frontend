import type { Metadata } from 'next'

/**
 * The Merchant app's name on a home screen.
 *
 * iOS labels a home-screen web app from apple-mobile-web-app-title rather than
 * reliably from the manifest, so without this an iPhone user installing from
 * merchant.binperks.com would see "BinPerks" — the member app's name — under the icon.
 * Android takes short_name from the manifest (app/merchant.webmanifest).
 */
export const metadata: Metadata = {
  title: 'BinPerks Merchant',
  appleWebApp: { title: 'Merchant' },
}

export default function MerchantLoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
