/**
 * Title, description and Open Graph tags for the merchant landing page.
 *
 * ONE DEFINITION, TWO ROUTES — merchant.binperks.com/ (app/merchant/page.tsx)
 * and /merchant/signup — because the landing page itself is one component and
 * its metadata should not be able to differ by which address served it.
 *
 * WHY IT EXISTS AT ALL: neither route declared any, so both inherited the root
 * layout's "BinPerks" / "Loyalty rewards for bin stores" and had no Open Graph
 * tags, which meant a link to the page previewed with no title or image and a
 * description using the vocabulary this page is written to avoid. The root
 * default is left alone — it still serves the rest of the site.
 *
 * The house wording rules in MerchantLanding apply here too: no "loyalty
 * program", no "app". A store owner reads this text in a search result or a
 * shared link before they read anything else.
 *
 * Not a client module: it is imported by two server components.
 */

import type { Metadata } from 'next'
import { MERCHANT_SETUP_FEE, MERCHANT_PLATFORM_PRICE } from '@/lib/merchant-signup-session'
import { PWA_APPS } from '@/lib/pwa-manifest'

const URL_ORIGIN = PWA_APPS.merchant.origin

const TITLE = 'BinPerks for Bin Store Owners'

const DESCRIPTION =
  `Reward your regulars, get more Google reviews and win back shoppers — BinPerks runs it `
  + `for you. $${MERCHANT_SETUP_FEE.toFixed(2)} one-time setup fee, then `
  + `$${MERCHANT_PLATFORM_PRICE}/month. Cancel anytime with 30 days' notice.`

export const merchantLandingMetadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  metadataBase: new URL(URL_ORIGIN),
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: URL_ORIGIN,
    siteName: 'BinPerks',
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: '/icon.png', width: 512, height: 512, alt: 'BinPerks' }],
  },
  twitter: {
    card: 'summary',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/icon.png'],
  },
}
