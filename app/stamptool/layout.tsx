import type { Metadata } from 'next'

/**
 * The cashier stamp tool's name on a home screen.
 *
 * iOS labels a home-screen web app from apple-mobile-web-app-title rather than
 * reliably from the manifest, so without this an iPhone cashier installing from
 * stamptool.binperks.com would see "BinPerks" — the member app's name — under
 * the icon. Android takes short_name from the cashier manifest instead
 * (app/cashier.webmanifest).
 */
export const metadata: Metadata = {
  title: 'BinPerks Cashier',
  appleWebApp: { title: 'Cashier' },
}

export default function StamptoolLayout({ children }: { children: React.ReactNode }) {
  return children
}
