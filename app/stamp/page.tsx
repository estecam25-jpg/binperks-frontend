'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import StoreHeader from '@/components/stamp/StoreHeader'
import { cashierSession, storeSession, type CashierSession } from '@/lib/stamp-session'

const PIN_LENGTH = 4

const DEFAULT_STORE = {
  id: '',
  name: 'BinPerks',
  brandColor: '#4A4B98',
  logoUrl: null,
  merchantId: '',
}

export default function StampSignInPage() {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [store, setStore] = useState(DEFAULT_STORE)

  useEffect(() => {
    const s = storeSession.get()
    if (s) setStore(s)
  }, [])

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
    setStatus('idle')
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = useCallback(() => {
    if (status === 'loading') return
    setPin(prev => prev.slice(0, -1))
    setStatus('idle')
  }, [status])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key >= '0' && e.key <= '9') handleDigit(e.key)
      else if (e.key === 'Backspace') handleDelete()
      else if (e.key === 'Enter' && pin.length === PIN_LENGTH) submitPin(pin)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pin, handleDigit, handleDelete]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submitPin(enteredPin: string) {
    setStatus('loading')

    const supabase = createClient()
    const { data, error } = await supabase
      .from('staff_users')
      .select('id, name, role, merchant_id, store_id')
      .eq('pin', enteredPin)
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
          className={`
            w-full max-w-sm py-5 rounded-2xl font-bold text-[17px] text-white
            font-['Montserrat'] tracking-wide
            transition-all duration-150
            disabled:opacity-35 disabled:cursor-not-allowed
            active:scale-[0.97]
          `}
          style={{ backgroundColor: '#4A4B98' }}
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