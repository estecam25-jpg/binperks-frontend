'use client'

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
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={`${storeName} logo`}
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
      {/* The BinPerks landscape mark, replacing the "Powered by BinPerks" text.
          The store keeps its own name and colour above — V3 keeps BinPerks
          visible while merchant experiences stay customised.

          Legible on any brand colour: the wordmark is white-filled with a blue
          outline, so it reads as white letters on a dark header and as the
          outline on a light one. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/BinPerks_Landscape_Logo.png"
        alt="Powered by BinPerks"
        className="h-4 w-auto opacity-90"
      />
    </header>
  )
}