'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import StoreHeader from '@/components/stamp/StoreHeader'
import { cashierSession, storeSession, type CashierSession } from '@/lib/stamp-session'

const PIN_LENGTH = 4

const DEFAULT_STORE = {
  id: '',
  name: 'BinPerks',
  brandColor: '#4A4B98',
  logoUrl: null as string | null,
  merchantId: '',
}

type PageStatus = 'fetching' | 'store_error' | 'idle' | 'loading' | 'error'

export default function StampSignInPage() {
  const router = useRouter()
  const params = useParams()
  const storeKey = params.storeKey as string

  const [pin, setPin] = useState('')
  const [status, setStatus] = useState<PageStatus>('fetching')
  const [store, setStore] = useState(DEFAULT_STORE)

  // Fetch store data on mount and set storeSession for downstream stamp pages
  useEffect(() => {
    async function loadStore() {
      try {
        const res = await fetch(`/api/join/${storeKey}`)
        if (!res.ok) { setStatus('store_error'); return }
        const data = await res.json()
        const s = {
          id: data.id,
          name: data.storeName,
          brandColor: data.brandColor,
          logoUrl: data.logoUrl ?? null,
          merchantId: data.merchantId,
        }
        storeSession.set(s)
        setStore(s)
        setStatus('idle')
      } catch {
        setStatus('store_error')
      }
    }
    loadStore()
  }, [storeKey])

  const handleDigit = useCallback((digit: string) => {
    if (status === 'loading') return
    setPin(prev => {
      if (prev.length >= PIN_LENGTH) return prev
      const next = prev + digit
      if (next.length === PIN_LENGTH) {
        setTimeout(() => submitPin(next), 120)
      }
      return next
    })
    if (status === 'error') setStatus('idle')
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = useCallback(() => {
    if (status === 'loading') return
    setPin(prev => prev.slice(0, -1))
    if (status === 'error') setStatus('idle')
  }, [status])

  useEffect(() => {
    if (status === 'fetching' || status === 'store_error') return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key >= '0' && e.key <= '9') handleDigit(e.key)
      else if (e.key === 'Backspace') handleDelete()
      else if (e.key === 'Enter' && pin.length === PIN_LENGTH) submitPin(pin)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pin, handleDigit, handleDelete, status]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submitPin(enteredPin: string) {
    setStatus('loading')

    const supabase = createClient()

    // Filter by store_id so a PIN collision across stores never returns the
    // wrong cashier. store.id is loaded from the store fetch on mount and is
    // the UUID of the store whose /stamp/[storeKey] URL this tablet is on.
    const { data, error } = await supabase
      .from('staff_users')
      .select('id, name, role, merchant_id, store_id')
      .eq('pin', enteredPin)
      .eq('store_id', store.id)
      .eq('is_active', true)
      .single()

    if (error || !data) {
      setStatus('error')
      setPin('')
      return
    }

    const session: CashierSession = {
      id: data.id,
      name: data.name,
      role: data.role,
      merchantId: data.merchant_id,
      storeId: data.store_id,
    }
    cashierSession.set(session)
    router.push('/stamp/lookup')
  }

  // Loading store data
  if (status === 'fetching') {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#F5F5F8]">
        <span className="w-8 h-8 border-[3px] border-[#EBEBF2] border-t-[#4A4B98] rounded-full animate-spin" />
      </div>
    )
  }

  // Store not found
  if (status === 'store_error') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-[#F5F5F8] px-6 text-center gap-5">
        <span className="text-4xl">🏪</span>
        <div>
          <p className="font-['Coiny'] text-2xl text-[#1A1A2E] mb-1">Store not found</p>
          <p className="text-[14px] text-[#8E8EA8] font-medium max-w-xs">
            Check with your manager for the correct store link.
          </p>
        </div>
        <button
          onClick={() => router.replace('/stamp')}
          className="text-[13px] font-semibold text-[#4A4B98] underline"
        >
          Back to store list
        </button>
      </div>
    )
  }

  const isError = status === 'error'
  const isLoading = status === 'loading'

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">
      <StoreHeader
        storeName={store.name}
        brandColor={store.brandColor}
        logoUrl={store.logoUrl}
      />

      <main className="flex-1 flex flex-col items-center justify-center px-5 py-8 gap-8">
        <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-sm flex flex-col items-center gap-7">

          <span className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#8E8EA8]">
            Cashier Sign In
          </span>

          <div className="flex gap-4 items-center">
            {Array.from({ length: PIN_LENGTH }).map((_, i) => {
              const filled = i < pin.length
              return (
                <div
                  key={i}
                  className={`
                    w-5 h-5 rounded-full border-2 transition-all duration-100
                    ${isError
                      ? 'bg-[#DA1212] border-[#DA1212] animate-[shake_0.35s_ease]'
                      : filled
                        ? 'bg-[#FFB217] border-[#FFB217] scale-110'
                        : 'bg-transparent border-[#D1D1DC]'
                    }
                  `}
                />
              )
            })}
          </div>

          <p
            className={`
              text-[13px] font-semibold text-[#DA1212] text-center -mt-3 min-h-[18px]
              transition-opacity duration-200
              ${isError ? 'opacity-100' : 'opacity-0'}
            `}
          >
            Incorrect PIN. Try again.
          </p>

          <div className="grid grid-cols-3 gap-2.5 w-full">
            {['1','2','3','4','5','6','7','8','9'].map(d => (
              <KeypadButton key={d} label={d} onPress={() => handleDigit(d)} disabled={isLoading} />
            ))}
            <KeypadButton label="⌫" onPress={handleDelete} disabled={isLoading} isDelete />
            <KeypadButton label="0" onPress={() => handleDigit('0')} disabled={isLoading} />
            <div />
          </div>
        </div>

        <button
          onClick={() => pin.length === PIN_LENGTH && submitPin(pin)}
          disabled={pin.length !== PIN_LENGTH || isLoading}
          className="w-full max-w-sm py-5 rounded-2xl font-bold text-[17px] text-white font-['Montserrat'] tracking-wide transition-all duration-150 disabled:opacity-35 disabled:cursor-not-allowed active:scale-[0.97]"
          style={{ backgroundColor: store.brandColor }}
        >
          {isLoading ? 'Signing in…' : 'Sign In'}
        </button>
      </main>
    </div>
  )
}

interface KeypadButtonProps {
  label: string
  onPress: () => void
  disabled?: boolean
  isDelete?: boolean
}

function KeypadButton({ label, onPress, disabled, isDelete }: KeypadButtonProps) {
  return (
    <button
      onClick={onPress}
      disabled={disabled}
      className={`
        aspect-[1.15] rounded-2xl font-bold font-['Montserrat']
        flex items-center justify-center
        transition-all duration-100 select-none
        disabled:opacity-50
        active:scale-[0.93]
        ${isDelete
          ? 'text-[18px] text-[#8E8EA8] bg-[#F5F5F8] active:text-[#DA1212] active:bg-red-50'
          : 'text-[22px] text-[#1A1A2E] bg-[#F5F5F8] active:bg-indigo-50'
        }
      `}
    >
      {label}
    </button>
  )
}
