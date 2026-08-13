'use client'

/**
 * /member/scan — the Scan tab.
 *
 * The scanner itself is components/member/MemberScanner, which carries the
 * whole existing pipeline across unchanged: capture, /api/member/scan,
 * representative-image lookup, and the choice write.
 *
 * BinPerks blue rather than a store colour — the scanner belongs to the
 * network, not to whichever store the member enrolled through.
 */

import MemberScanner from '@/components/member/MemberScanner'

const BINPERKS_BLUE = '#4A4B98'

export default function MemberScanPage() {
  return <MemberScanner brandColor={BINPERKS_BLUE} />
}
