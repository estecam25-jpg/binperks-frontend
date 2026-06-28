/**
 * Layout for /member/join/[storeKey]/*
 *
 * Resolves store branding from canonical_key on first load,
 * stores it in sessionStorage, and passes it via CSS custom properties
 * so all child pages inherit the white-label branding.
 */

'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { signupStore, signupRef, type SignupStore } from '@/lib/signup-session'
import { headerTextColor } from '@/lib/branding'

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const storeKey = params.storeKey as string
  const [store, setStore] = useState<SignupStore | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function resolveStore() {
      // Use cached store if same storeKey
      const cached = signupStore.get()
      if (cached && cached.storeKey === storeKey) {
        setStore(cached)
        setLoading(false)
        resolveRef(searchParams.get('ref'))
        return
      }

      // Fetch store branding
      const res = await fetch(`/api/join/${storeKey}`)
      if (!res.ok) {
        router.replace('/404')
        return
      }
      const data: SignupStore = await res.json()
      signupStore.set(data)
      setStore(data)
      setLoading(false)

      // Resolve referral code if present
      resolveRef(searchParams.get('ref'))
    }

    async function resolveRef(code: string | null) {
      if (!code) return
      // Don't re-resolve if already cached
      const cached = signupRef.get()
      if (cached && cached.code === code) return

      const res = await fetch(`/api/join/ref/${code}`)
      if (!res.ok) return
      const data = await res.json()
      signupRef.set({ code, ...data })
    }

    resolveStore()
  }, [storeKey, searchParams, router])

  if (loading || !store) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#F5F5F8]">
        <span className="w-8 h-8 border-[3px] border-[#EBEBF2] border-t-[#4A4B98] rounded-full animate-spin" />
      </div>
    )
  }

  const textColor = headerTextColor(store.brandColor)

  return (
    <div
      style={{
        '--store-color': store.brandColor,
        '--store-text': textColor,
      } as React.CSSProperties}
    >
      {children}
    </div>
  )
}
