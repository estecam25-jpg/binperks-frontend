/**
 * Layout for /member/join/[storeKey]/*
 *
 * Renders children immediately (no blocking spinner) and caches store
 * branding + the referrer in sessionStorage in the background so that child
 * pages (signup, vip, thankyou) can read them via signupStore.get().
 *
 * The referrer arrives as ?ref=<referral_code> on legacy links or
 * ?referrer=<member id> from the short /join/XXXXXX link. /api/join/ref accepts
 * both shapes, so this only has to pick whichever one is present.
 *
 * The join landing page (page.tsx) fetches branding server-side, so it
 * doesn't depend on this layout for its initial render.
 */

'use client'

import { useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { signupStore, signupRef } from '@/lib/signup-session'

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const searchParams = useSearchParams()
  const storeKey = params.storeKey as string

  useEffect(() => {
    async function prime() {
      // Skip if already cached for this store
      const cached = signupStore.get()
      if (cached && cached.storeKey === storeKey) {
        resolveRef(referrerParam())
        return
      }

      const res = await fetch(`/api/join/${storeKey}`)
      if (!res.ok) return
      const data = await res.json()
      // Only the functional fields, even though the route returns branding too.
      // Storing the whole response would put a store's colour back into session
      // for a future page to find — the same leak SignupStore was trimmed to
      // prevent. A member who opens /signup directly gets the same three fields
      // JoinLanding caches.
      signupStore.set({ id: data.id, storeKey: data.storeKey, merchantId: data.merchantId })
      resolveRef(referrerParam())
    }

    /** ?referrer= wins over ?ref= when both are somehow present — it is the
     *  newer, unambiguous form. */
    function referrerParam(): string | null {
      return searchParams.get('referrer') ?? searchParams.get('ref')
    }

    async function resolveRef(code: string | null) {
      if (!code) return
      const cached = signupRef.get()
      if (cached && cached.code === code) return
      const res = await fetch(`/api/join/ref/${code}`)
      if (!res.ok) return
      const data = await res.json()
      signupRef.set({ code, ...data })
    }

    prime()
  }, [storeKey, searchParams])

  return <>{children}</>
}
