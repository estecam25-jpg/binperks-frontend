/**
 * /member/join/[storeKey] — Member join landing page, the plain link.
 *
 * Server component: resolves the store key at request time. Everything it
 * renders lives in JoinLandingRoute, shared with the /[source] variant that
 * QR codes point at — see lib/join-source.
 *
 * No source segment means no source: a member arriving here gets the ordinary
 * funnel and earns their first stamp on their next trip to the register.
 */

import JoinLandingRoute from './JoinLandingRoute'

export default async function JoinLandingPage({
  params,
  searchParams,
}: {
  params:       Promise<{ storeKey: string }>
  searchParams: Promise<{ ref?: string; referrer?: string }>
}) {
  const { storeKey } = await params
  const { ref, referrer } = await searchParams

  return (
    <JoinLandingRoute
      storeKey={storeKey}
      code={ref}
      referrerId={referrer}
      joinSource={null}
    />
  )
}
