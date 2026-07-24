'use client'

interface Store {
  id: string
  storeName: string
  storeKey: string    // canonical_key — used to build the /join/[storeKey] URL
  city: string
  state: string
  brandColor?: string | null
  logoUrl?: string | null
}

type TabId = 'start' | 'overview' | 'members' | 'redemptions' | 'perks' | 'marketing' | 'settings'

const BASE_TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'overview',     label: 'Overview',     icon: '📊' },
  { id: 'members',      label: 'Members',      icon: '👥' },
  { id: 'redemptions',  label: 'Redemptions',  icon: '🎟️' },
  { id: 'perks',        label: 'Perks',        icon: '✨' },
  { id: 'marketing',    label: 'Marketing',    icon: '📣' },
  { id: 'settings',     label: 'Settings',     icon: '⚙️' },
]

interface MerchantNavProps {
  companyName: string
  stores: Store[]
  activeStoreId: string | null   // null = ALL locations
  activeTab: TabId
  onStoreChange: (storeId: string | null) => void
  onTabChange: (tab: TabId) => void
  showStart?: boolean
  brandColor?: string | null
  logoUrl?: string | null
}

export default function MerchantNav({
  companyName, stores, activeStoreId, activeTab, onStoreChange, onTabChange,
  showStart = false, brandColor, logoUrl,
}: MerchantNavProps) {
  const TABS = showStart
    ? [{ id: 'start' as TabId, label: 'Get Started', icon: '🚀' }, ...BASE_TABS]
    : BASE_TABS
  const isMulti = stores.length > 1
  const navBg = brandColor || '#1A1A2E'

  return (
    <div className="sticky top-0 z-20" style={{ backgroundColor: navBg }}>
      {/* Top bar */}
      <div className="px-4 py-3 flex items-center gap-3">
        {logoUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={logoUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
        )}
        <span className="font-['Coiny'] text-xl text-white leading-none flex-1 truncate">
          {companyName}
        </span>

        {/* Location switcher — only shown for multi-location merchants */}
        {isMulti && (
          <select
            value={activeStoreId ?? 'all'}
            onChange={e => onStoreChange(e.target.value === 'all' ? null : e.target.value)}
            className="bg-white/10 text-white text-[12px] font-bold border border-white/20 rounded-lg px-2.5 py-1.5 outline-none max-w-[160px] truncate appearance-none"
          >
            <option value="all">All locations</option>
            {stores.map(s => (
              <option key={s.id} value={s.id}>
                {s.storeName}
              </option>
            ))}
          </select>
        )}

        {!isMulti && stores[0] && (
          <span className="text-[12px] font-semibold text-white/50 truncate max-w-[140px]">
            {stores[0].storeName}
          </span>
        )}
      </div>

      {/* Tab bar — horizontally scrollable */}
      <div className="flex overflow-x-auto scrollbar-hide border-t border-white/10">
        {TABS.map(tab => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`
                flex flex-col items-center gap-0.5 px-4 py-2.5 flex-shrink-0
                transition-colors border-b-2
                ${isActive
                  ? 'border-[#FFB217] text-[#FFB217]'
                  : 'border-transparent text-white/50 active:text-white/80'
                }
              `}
            >
              <span className="text-base leading-none">{tab.icon}</span>
              <span className="text-[10px] font-bold tracking-wide whitespace-nowrap">
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export type { TabId, Store }
