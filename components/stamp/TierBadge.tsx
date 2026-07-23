import { getTier, TIER_DISPLAY_NAMES } from '@/lib/tiers'
import type { TierName } from '@/lib/tiers'

interface TierBadgeProps {
  totalStamps: number
  tierName?: TierName        // pass 'Free' explicitly for free/Starter members
  subscriptionStatus?: string // if 'free', always renders Starter regardless of stamp count
  className?: string
}

const BADGE_STYLES: Record<TierName, string> = {
  Free:    'bg-gray-100 text-gray-500',
  Bronze:  'bg-orange-50 text-orange-800',
  Silver:  'bg-slate-100 text-slate-600',
  Gold:    'bg-yellow-50 text-yellow-800',
  Diamond: 'bg-indigo-50 text-indigo-700',
}

export default function TierBadge({ totalStamps, tierName, subscriptionStatus, className = '' }: TierBadgeProps) {
  const tier: TierName = subscriptionStatus === 'free' ? 'Free' : (tierName ?? getTier(totalStamps).name)
  return (
    <span
      className={`
        inline-block text-[10px] font-bold tracking-widest uppercase
        px-2.5 py-0.5 rounded-full
        ${BADGE_STYLES[tier]}
        ${className}
      `}
    >
      {TIER_DISPLAY_NAMES[tier]}
    </span>
  )
}
