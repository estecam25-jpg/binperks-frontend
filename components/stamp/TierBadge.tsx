import { getTier, TIER_DISPLAY_NAMES, TIER_EMOJI, TIER_LABELS } from '@/lib/tiers'
import type { TierName } from '@/lib/tiers'

interface TierBadgeProps {
  totalStamps: number
  tierName?: TierName        // pass 'Free' explicitly for free/Starter members
  subscriptionStatus?: string // if 'free', always renders Starter regardless of stamp count
  className?: string
  // V3 network identity: renders "🥇 BinPerks Gold Member" instead of "🥇 Gold".
  // Opt-in — the cashier stamp tool keeps the short badge, where the member is
  // already on screen in a single-store context and the long form is just noise.
  networkLabel?: boolean
}

const BADGE_STYLES: Record<TierName, string> = {
  Free:    'bg-gray-100 text-gray-500',
  Bronze:  'bg-orange-50 text-orange-800',
  Silver:  'bg-slate-100 text-slate-600',
  Gold:    'bg-yellow-50 text-yellow-800',
  Diamond: 'bg-indigo-50 text-indigo-700',
}

export default function TierBadge({ totalStamps, tierName, subscriptionStatus, className = '', networkLabel = false }: TierBadgeProps) {
  const tier: TierName = subscriptionStatus === 'free' ? 'Free' : (tierName ?? getTier(totalStamps).name)
  const label = networkLabel
    ? `${TIER_EMOJI[tier]} BinPerks ${TIER_LABELS[tier]} Member`
    : TIER_DISPLAY_NAMES[tier]
  return (
    <span
      className={`
        inline-block text-[10px] font-bold tracking-widest uppercase
        px-2.5 py-0.5 rounded-full
        ${BADGE_STYLES[tier]}
        ${className}
      `}
    >
      {label}
    </span>
  )
}
