'use client'

import Image from 'next/image'
import { headerTextColor, storeInitials } from '@/lib/branding'

interface StoreHeaderProps {
  storeName: string
  brandColor: string
  logoUrl?: string | null
}

export default function StoreHeader({ storeName, brandColor, logoUrl }: StoreHeaderProps) {
  const textColor = headerTextColor(brandColor)
  const initials = storeInitials(storeName)

  return (
    <header
      className="flex flex-col items-center gap-1 px-5 py-3"
      style={{ backgroundColor: brandColor, color: textColor }}
    >
      <div className="flex items-center gap-2.5">
        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center flex-shrink-0 overflow-hidden">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={`${storeName} logo`}
              width={40}
              height={40}
              className="object-cover w-full h-full"
            />
          ) : (
            <span
              className="font-['Coiny'] text-lg leading-none"
              style={{ color: brandColor }}
            >
              {initials}
            </span>
          )}
        </div>
        <span className="font-['Coiny'] text-2xl tracking-wide leading-none">
          {storeName}
        </span>
      </div>
      <span
        className="text-[10px] font-semibold tracking-widest uppercase"
        style={{ color: textColor === '#FFFFFF' ? 'rgba(255,255,255,0.5)' : 'rgba(26,26,46,0.45)' }}
      >
        Powered by BinPerks
      </span>
    </header>
  )
}