'use client'

/**
 * Persistent 5-tab bottom navigation for the member app.
 *
 * Fixed to the viewport so it never scrolls away. Every tab page therefore
 * needs bottom padding — the layout that renders this supplies it, so pages
 * don't each have to remember.
 *
 * SCAN is deliberately not a peer of the other four: it is the action the
 * whole app exists to make easy, so it is a raised pill rather than an icon
 * over a label.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const BINPERKS_BLUE = '#4A4B98'

/**
 * Height a page must keep clear at the bottom, exported so layouts pad by the
 * same amount.
 *
 * This is NOT just the bar. The bar measures 58px, but the SCAN pill is raised
 * with -mt-4 and overhangs 15px ABOVE it, so 73px of the viewport bottom is
 * actually covered. The old value of 68 was under that, which is why the last
 * element on a tab still sat under the pill.
 */
export const BOTTOM_NAV_HEIGHT_PX = 73

interface Tab {
  href: string
  label: string
  icon: string
}

const LEFT_TABS: Tab[] = [
  { href: '/member/home',   label: 'Home',   icon: '🏠' },
  { href: '/member/stores', label: 'Stores', icon: '📍' },
]

const RIGHT_TABS: Tab[] = [
  { href: '/member/rewards', label: 'Rewards', icon: '🎟️' },
  // Account moved to the gear in AppHeader — the fifth slot is worth more as a
  // destination than as settings. Labelled MORE rather than "Beyond the Bins":
  // the tab bar has ~60px per label and the longer name wrapped or truncated.
  // The page itself still leads with the Beyond the Bins heading.
  { href: '/member/more',    label: 'More',    icon: '⋯' },
]

export default function BottomNavigation() {
  const pathname = usePathname()

  // startsWith, not equality: a tab may gain sub-routes later (a store detail
  // under /member/stores) and should stay highlighted.
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  const scanActive = isActive('/member/scan')

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[#EBEBF2]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Member navigation"
    >
      <div className="max-w-md mx-auto flex items-stretch justify-around px-2">
        {LEFT_TABS.map(tab => <TabLink key={tab.href} tab={tab} active={isActive(tab.href)} />)}

        {/* SCAN — raised pill, centred, emphasised */}
        <Link
          href="/member/scan"
          aria-label="Scan an item"
          aria-current={scanActive ? 'page' : undefined}
          className="flex flex-col items-center justify-center flex-1 min-w-0 -mt-4"
        >
          <span
            className="w-14 h-14 rounded-full flex items-center justify-center text-[22px] shadow-lg transition-transform active:scale-95"
            style={{
              backgroundColor: scanActive ? '#3A3B80' : BINPERKS_BLUE,
              boxShadow: '0 6px 16px rgba(74,75,152,0.35)',
            }}
          >
            📷
          </span>
          <span
            className="text-[10px] font-bold tracking-wide mt-0.5"
            style={{ color: BINPERKS_BLUE }}
          >
            SCAN
          </span>
        </Link>

        {RIGHT_TABS.map(tab => <TabLink key={tab.href} tab={tab} active={isActive(tab.href)} />)}
      </div>
    </nav>
  )
}

function TabLink({ tab, active }: { tab: Tab; active: boolean }) {
  return (
    <Link
      href={tab.href}
      aria-current={active ? 'page' : undefined}
      className="flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 py-2.5"
    >
      <span className={`text-[19px] leading-none ${active ? '' : 'opacity-45 grayscale'}`}>
        {tab.icon}
      </span>
      <span
        className="text-[10px] font-bold tracking-wide"
        style={{ color: active ? BINPERKS_BLUE : '#8E8EA8' }}
      >
        {tab.label.toUpperCase()}
      </span>
    </Link>
  )
}
