/**
 * Layout for /member/join/[storeKey]/*
 *
 * Renders children immediately (no blocking spinner) and caches store
 * branding + referral code in sessionStorage in the background so that
 * child pages (signup, vip, thankyou) can read them via signupStore.get().
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
        resolveRef(searchParams.get('ref'))
        return
      }

      const res = await fetch(`/api/join/${storeKey}`)
      if (!res.ok) return
      const data = await res.json()
      signupStore.set(data)
      resolveRef(searchParams.get('ref'))
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
