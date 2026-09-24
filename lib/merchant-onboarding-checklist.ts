/**
 * The merchant onboarding checklist — ONE definition, two readers.
 *
 * The merchant sees it as a list on their Getting Started tab; the admin sees
 * it as a percentage on the merchant card. Those two used to be written out
 * separately, and drifted: the admin list counted two W-9 rows the merchant's
 * never had, missed the bin photos item, counted one slot as permanently done,
 * and divided by a hardcoded 13. A merchant could be at 8/13 on their own
 * screen while the admin card read 77%.
 *
 * So the items live here. A route's job is to gather the FACTS below — from
 * one merchant's rows, or from a bulk read across every merchant — and hand
 * them over. Adding an item means adding it once, in `onboardingChecklist`,
 * and both screens move together.
 *
 * WHAT IS NOT HERE: the W-9. It is reviewed in admin and has its own status on
 * the merchant card, and the checklist covers it inside the DocuSeal item
 * ("Merchant Agreement + W-9 signed"), which is where a merchant actually
 * signs it.
 */

/** Everything the checklist needs to know about one merchant. Booleans and
 *  counts only — no database rows — so the admin route can build them from a
 *  bulk query and the merchant route from its own. */
export interface OnboardingFacts {
  billingStatus:     string | null
  storeCount:        number
  /** Logo, brand colour and font, all set on the merchant's first store. */
  brandConfigured:   boolean
  reviewUrlSet:      boolean
  freePerks:         number
  vipPerks:          number
  staffCount:        number
  mktDownloaded:     boolean
  /** At least one stamp has ever been awarded. */
  stampsTested:      boolean
  trainingConfirmed: boolean
  posCouponsAdded:   boolean
  agreementSigned:   boolean
  binPhotosAdded:    boolean
}

export interface OnboardingItem {
  id:           string
  label:        string
  completed:    boolean
  /** True when BinPerks does this, not the merchant — the two groups are
   *  listed under separate headings on the merchant's tab. */
  binPerks:     boolean
  description?: string
  /** Deep link to wherever the item is actually done. */
  href?:        string
}

/** The checklist itself, in the order the merchant reads it. */
export function onboardingChecklist(f: OnboardingFacts): OnboardingItem[] {
  return [
    // BinPerks sets these up.
    { id: 'agreement_signed',  label: 'Merchant Agreement + W-9 signed (via DocuSeal)', completed: f.agreementSigned,              binPerks: true  },
    { id: 'store_provisioned', label: 'Store provisioned',                              completed: f.storeCount > 0,               binPerks: true  },
    { id: 'activated',         label: 'Merchant account activated',                     completed: f.billingStatus === 'active',   binPerks: true  },

    // The merchant's own.
    { id: 'brand_configured',  label: 'Brand configured (logo, color, font)',           completed: f.brandConfigured,              binPerks: false },
    { id: 'review_url',        label: 'Google Review URL added',                        completed: f.reviewUrlSet,                 binPerks: false },
    { id: 'free_perks',        label: 'Free member perk added',                         completed: f.freePerks >= 1,               binPerks: false },
    { id: 'vip_perks',         label: 'VIP perks added (3+ required)',                  completed: f.vipPerks >= 3,                binPerks: false },
    {
      id: 'pos_coupons',
      label: 'Add BinPerks coupons to your POS system',
      description: 'Add the BinPerks coupon amounts ($5, $7, $10, $12, $15) to your point-of-sale system so cashiers can apply them when members redeem rewards.',
      completed: f.posCouponsAdded,
      binPerks: false,
    },
    { id: 'cashier_pin',       label: 'Cashier PIN created',                            completed: f.staffCount > 0,               binPerks: false },
    { id: 'mkt_downloaded',    label: 'Marketing materials downloaded',                 completed: f.mktDownloaded,                binPerks: false },
    { id: 'stamp_tested',      label: 'Stamp tool tested',                              completed: f.stampsTested,                 binPerks: false },
    { id: 'cashier_training',  label: 'Cashier training completed',                     completed: f.trainingConfirmed,            binPerks: false },
    {
      id: 'bin_photos',
      label: 'Add photos of what’s in your bins',
      description: 'Show members what’s in stock this week to drive more visits.',
      completed: f.binPhotosAdded,
      binPerks: false,
      // Straight to the card rather than "go to Settings and scroll".
      href: '/merchant/dashboard?tab=settings#bin-photos',
    },
  ]
}

/** The same list as a whole-number percentage — what the admin card shows.
 *  Divided by the length of the list, never by a number typed beside it. */
export function onboardingPercent(f: OnboardingFacts): number {
  const items = onboardingChecklist(f)
  if (items.length === 0) return 0
  return Math.round(items.filter(i => i.completed).length / items.length * 100)
}
