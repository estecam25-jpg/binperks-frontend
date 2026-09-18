/**
 * /member/join/[storeKey]/[source] — the join landing page reached by a QR code
 * that records how it was reached.
 *
 * The live one is the register QR:
 *
 *   app.binperks.com/join/FL-Tampa-EstaBins/in-store_at-the_register
 *
 * which redirects here (next.config.ts) and whose signup awards the day's visit
 * stamp on the spot. The source is carried through the funnel and acted on by
 * /api/join/create; this page's only job is to resolve it and hand it over.
 *
 * STATIC SIBLINGS WIN. signup, vip and thankyou are real folders under
 * [storeKey], and Next matches a static segment ahead of a dynamic one, so this
 * route cannot swallow the funnel's own steps.
 *
 * AN UNKNOWN SOURCE IS NOT A 404. resolveJoinSource returns null for anything
 * it does not recognise and the member gets the ordinary landing page. These
 * URLs are printed on QR codes stuck to counters — a retired or mistyped source
 * has to keep working as a plain join link rather than becoming a dead end.
 */

import JoinLandingRoute from '../JoinLandingRoute'
import { resolveJoinSource } from '@/lib/join-source'

export default async function JoinLandingWithSourcePage({
  params,
  searchParams,
}: {
  params:       Promise<{ storeKey: string; source: string }>
  searchParams: Promise<{ ref?: string; referrer?: string }>
}) {
  const { storeKey, source } = await params
  const { ref, referrer } = await searchParams

  return (
    <JoinLandingRoute
      storeKey={storeKey}
      code={ref}
      referrerId={referrer}
      joinSource={resolveJoinSource(source)}
    />
  )
}
