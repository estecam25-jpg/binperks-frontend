'use client'

/**
 * Sends a cashier straight to their remembered store when the Cashier app
 * opens at stamptool.binperks.com with no path — the installed app's start_url.
 *
 * ONLY AT "/". The store selector is also reached at /stamptool, and that is
 * how the stamp tool gets there on purpose: "Back to store list", "Return to
 * sign in" after a stamp, and every page whose cashier session has lapsed. If
 * those redirected too, a cashier could never reach the list to pick a
 * different store. "/" is only ever the selector on the stamptool subdomain
 * (middleware rewrites it there; on app.binperks.com "/" is the member home),
 * so this also leaves app.binperks.com/stamptool exactly as it was.
 *
 * While the redirect is decided and running it covers the list with a spinner,
 * so the cashier does not see the selector flash before their store appears.
 */

import { useEffect, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { readLastStore, isStoreKeyShape } from '@/lib/stamp-store-url'

const noopSubscribe = () => () => {}

/** Where to go, or null to show the selector. A string, so snapshots compare by value. */
function readTarget(): string | null {
  if (window.location.pathname !== '/') return null

  const key = readLastStore()
  if (!key) return null

  // The short /<storeKey> form keeps the bookmarkable URL in the address bar.
  // Anything that would not match the middleware rewrite falls back to the
  // long form rather than landing on a 404.
  return isStoreKeyShape(key)
    ? `/${encodeURIComponent(key)}`
    : `/stamptool/${encodeURIComponent(key)}`
}

export default function LastStoreRedirect() {
  const router = useRouter()
  // Server snapshot is null, so the server HTML and hydration always agree.
  const target = useSyncExternalStore(noopSubscribe, readTarget, () => null)

  useEffect(() => {
    if (target) router.replace(target)   // replace: Back must not return to "/" and bounce again
  }, [target, router])

  if (!target) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#F5F5F8]"
      role="status"
      aria-label="Opening your store"
    >
      <span className="w-8 h-8 border-[3px] border-[#EBEBF2] border-t-[#4A4B98] rounded-full animate-spin" />
    </div>
  )
}
