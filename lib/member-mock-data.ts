// MOCK DATA — connect to real API in Phase 2
//
// Everything in this file is placeholder content for sections that have no
// backend yet. It is deliberately isolated in one module so Phase 2 can swap
// each export for a real fetch WITHOUT touching any component markup.
//
// Nothing here is persisted, and nothing here is derived from a member. If you
// are looking for real member data it comes from /api/member/me.

export interface PromoCard {
  id: string
  title: string
  body: string
  cta: string
  href: string | null
  accent: string
}

export interface StorePromo {
  id: string
  storeName: string
  brandColor: string
  dealTitle: string
  detail: string
  cta: string
}

export interface Find {
  id: string
  itemName: string
  estimatedRetail: string
  storeName: string
  scannedAt: string
}

export interface OnlineStore {
  id: string
  storeName: string
  featuredProduct: string
  platform: string
  cta: string
}

export interface LocalEvent {
  id: string
  name: string
  location: string
  date: string
}

export interface BeyondBinsPartner {
  id: string
  partner: string
  description: string
  cta: string
}

/** BinPerks-owned promos. Phase 2: a promos table + admin scheduling. */
export const MOCK_PROMOS: PromoCard[] = [
  {
    id: 'promo-vip',
    title: 'Upgrade to VIP',
    body: 'Earn up to 5× faster and unlock bigger rewards every 20 stamps.',
    cta: 'See VIP',
    href: '/member/upgrade',
    accent: '#4A4B98',
  },
  {
    id: 'promo-invite',
    title: 'Invite Friends',
    body: 'Earn +5 stamps when a friend joins and earns their first stamp.',
    cta: 'Invite',
    href: '/member/rewards',
    accent: '#FFB217',
  },
  {
    id: 'promo-network',
    title: 'New Stores Joining',
    body: 'More BinPerks locations are opening near you every month.',
    cta: 'Browse stores',
    href: '/member/stores',
    accent: '#2A7D34',
  },
]

/** Phase 2: merchant-scheduled offers, filtered by member location. */
export const MOCK_STORE_DEALS: StorePromo[] = [
  {
    id: 'deal-1',
    storeName: 'EstaBins Tampa',
    brandColor: '#1b3d2f',
    dealTitle: '$3 Tuesday',
    detail: 'Every item in the blue bins is $3 all day Tuesday.',
    cta: 'View store',
  },
  {
    id: 'deal-2',
    storeName: 'WinBin Main St',
    brandColor: '#b13969',
    dealTitle: 'Restock Friday',
    detail: 'Fresh pallets hit the floor at 9am. VIP members shop first.',
    cta: 'View store',
  },
]

/** Phase 2: reads scanner_events for this member, newest first. */
export const MOCK_FINDS: Find[] = [
  {
    id: 'find-1',
    itemName: 'Beyerdynamic DT 770 PRO Studio Headphones',
    estimatedRetail: '$149 – $179',
    storeName: 'EstaBins Tampa',
    scannedAt: '2 days ago',
  },
  {
    id: 'find-2',
    itemName: 'DJI Osmo Pocket 3 with Extension Rod',
    estimatedRetail: '$519 – $549',
    storeName: 'EstaBins Tampa',
    scannedAt: '5 days ago',
  },
]

/** Phase 2: merchant-managed online storefront links. */
export const MOCK_ONLINE_STORES: OnlineStore[] = [
  {
    id: 'online-1',
    storeName: 'EstaBins Tampa',
    featuredProduct: 'Mystery Electronics Box',
    platform: 'Available on Whatnot',
    cta: 'Shop now',
  },
  {
    id: 'online-2',
    storeName: 'WinBin Main St',
    featuredProduct: 'Weekly Pallet Drop',
    platform: 'Available on Whatnot',
    cta: 'Shop now',
  },
]

/** Phase 2: an events table with location filtering. */
export const MOCK_EVENTS: LocalEvent[] = [
  {
    id: 'event-1',
    name: 'Grand Reopening — New Bins',
    location: 'EstaBins Tampa',
    date: 'Sat, Aug 23 · 9:00 AM',
  },
  {
    id: 'event-2',
    name: 'Bin Hunter Meetup',
    location: 'WinBin Main St',
    date: 'Sun, Aug 31 · 11:00 AM',
  },
]

/** Phase 2: industry partner directory. */
export const MOCK_BEYOND_BINS: BeyondBinsPartner[] = [
  {
    id: 'partner-1',
    partner: 'Reseller Toolkit',
    description: 'Pricing and inventory tools built for liquidation resellers.',
    cta: 'Learn more',
  },
  {
    id: 'partner-2',
    partner: 'Pallet Sourcing 101',
    description: 'A free guide to buying your first pallet without getting burned.',
    cta: 'Read guide',
  },
]
