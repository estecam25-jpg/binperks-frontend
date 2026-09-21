/**
 * /merchant/signup/sign?session=<DocuSeal slug>
 *
 * Where a merchant who has paid signs the Merchant Agreement, embedded in the
 * app rather than sent out as an email link.
 *
 * Server component: resolves the slug to a merchant before rendering anything,
 * so a stale or mistyped link says so plainly instead of showing an empty
 * signing frame. The slug itself is DocuSeal's signing token — a bearer link by
 * DocuSeal's own design — and nothing here reveals more than whether it is
 * valid.
 *
 * BINPERKS BRANDING ONLY — no store name. The agreement is with BinPerks.
 */

import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { PENDING_SIGNATURE, docusealFormUrl } from '@/lib/merchant-onboarding'
import SignAgreement from './sign-agreement'

export const dynamic = 'force-dynamic'

export default async function MerchantSignPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { session } = await searchParams
  const slug = typeof session === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(session) ? session : null

  let state: 'invalid' | 'signed' | 'sign' = 'invalid'
  let email: string | null = null

  if (slug) {
    const admin = createAdminSupabaseClient()
    const { data: m } = await admin
      .from('merchants')
      .select('billing_status, owner_email')
      .eq('docuseal_slug', slug)
      .maybeSingle()
    if (m) {
      state = m.billing_status === PENDING_SIGNATURE ? 'sign' : 'signed'
      email = (m.owner_email as string | null) ?? null
    }
  }

  return (
    <SignAgreement
      state={state}
      slug={slug}
      src={slug ? docusealFormUrl(slug) : null}
      email={email}
    />
  )
}
