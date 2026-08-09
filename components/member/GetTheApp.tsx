'use client'

/**
 * "Get the App" — install instructions for the member settings page.
 *
 * A reference section, so unlike the dashboard banner it is always visible and
 * cannot be dismissed. It stays on screen even when the app is already
 * installed: a member reading this in the installed app may well be setting it
 * up on a second device.
 *
 * Platform detection picks one set of steps. On desktop, where there is no
 * right answer, both are shown — the member is probably reading here to find
 * out what to do on their phone.
 */

import { useEffect, useState } from 'react'
import { detectPlatform, INSTALL_STEPS, type Platform } from '@/lib/pwa'

const BINPERKS_BLUE = '#4A4B98'

function Steps({ which }: { which: 'ios' | 'android' }) {
  const { label, icon, steps } = INSTALL_STEPS[which]
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[13px] font-bold text-[#1A1A2E]">
        {icon} {label}
      </p>
      <ol className="flex flex-col gap-2">
        {steps.map((step, i) => (
          <li key={step} className="flex items-start gap-2.5">
            <span
              className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white mt-px"
              style={{ backgroundColor: BINPERKS_BLUE }}
            >
              {i + 1}
            </span>
            <span className="text-[13px] text-[#1A1A2E] font-medium leading-snug">
              {step}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export default function GetTheApp() {
  // Detection is browser-only, so it happens after mount. Until then this
  // renders the desktop case (both platforms), which is also the correct
  // fallback if detection never resolves.
  const [platform, setPlatform] = useState<Platform>('other')

  useEffect(() => {
    setPlatform(detectPlatform())
  }, [])

  return (
    <div className="w-full bg-white rounded-2xl px-5 py-5 shadow-sm flex flex-col gap-4">
      <div>
        <p className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#8E8EA8]">
          Get the App
        </p>
        <p className="text-[12px] text-[#8E8EA8] font-medium mt-1 leading-snug">
          Add BinPerks to your home screen so it opens like an app — no app store needed.
        </p>
      </div>

      {platform === 'ios' && <Steps which="ios" />}
      {platform === 'android' && <Steps which="android" />}

      {platform === 'other' && (
        <div className="flex flex-col gap-4">
          <Steps which="ios" />
          <div className="border-t border-[#EBEBF2]" />
          <Steps which="android" />
        </div>
      )}
    </div>
  )
}
