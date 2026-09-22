'use client'

/**
 * The signing screen. Embeds DocuSeal's form and, when the merchant finishes,
 * asks the server to confirm with DocuSeal and activate them.
 *
 * onComplete IS A PROMPT, NOT A VERDICT. It fires in the browser, where anyone
 * could fire it; the server's /api/merchant/signup/confirm is what asks
 * DocuSeal whether the signature is real. DocuSeal can lag its own form by a
 * moment, so the confirm is retried a few times before settling on "your
 * dashboard will be ready shortly" — the DocuSeal webhook activates the merchant
 * independently of this page, so leaving it early loses nothing.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { DocusealForm } from '@docuseal/react'

type Phase = 'loading' | 'signing' | 'confirming' | 'done' | 'delayed'

const RETRIES = 6
const RETRY_MS = 2000

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="bg-[#4A4B98] px-6 pt-12 pb-16 flex flex-col items-center gap-4 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.png" alt="BinPerks" className="h-16 w-16 object-contain" />
      <h1 className="font-['Coiny'] text-3xl text-white leading-tight">{title}</h1>
      {subtitle && (
        <p className="text-[14px] text-white/75 font-medium leading-relaxed max-w-sm">{subtitle}</p>
      )}
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-lg mx-auto -mt-8 px-4 pb-16">
      <div className="bg-white rounded-2xl shadow-xl px-5 py-6 flex flex-col gap-4 items-center text-center">
        {children}
      </div>
    </div>
  )
}

function Spinner() {
  return <span className="w-8 h-8 border-[3px] border-[#EBEBF2] border-t-[#4A4B98] rounded-full animate-spin" />
}

const DASHBOARD = '/merchant/login'

export default function SignAgreement({
  state, slug, src, email,
}: {
  state: 'invalid' | 'signed' | 'sign'
  slug: string | null
  src: string | null
  email: string | null
}) {
  const [phase, setPhase] = useState<Phase>('loading')

  // If DocuSeal's embed never reports that it loaded, lift the overlay anyway
  // so whatever it IS showing — a form, or its own error — is visible, rather
  // than a spinner that never ends.
  useEffect(() => {
    const t = setTimeout(() => setPhase(p => (p === 'loading' ? 'signing' : p)), 15_000)
    return () => clearTimeout(t)
  }, [])

  const confirm = useCallback(async () => {
    setPhase('confirming')
    for (let attempt = 0; attempt < RETRIES; attempt++) {
      try {
        const res = await fetch('/api/merchant/signup/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug }),
        })
        const d = await res.json().catch(() => ({}))
        if (d.activated) {
          setPhase('done')
          setTimeout(() => { window.location.href = DASHBOARD }, 2500)
          return
        }
        if (d.retry === false) break
      } catch { /* network blip — retry */ }
      await new Promise(r => setTimeout(r, RETRY_MS))
    }
    // Signed, but not confirmed yet. The DocuSeal webhook will finish the job
    // on its own; the merchant does not need to stay on this page for it.
    setPhase('delayed')
  }, [slug])

  if (state === 'invalid' || !src) {
    return (
      <div className="min-h-dvh bg-[#F5F5F8]">
        <Header title="Link not found" />
        <Card>
          <p className="text-[14px] text-[#1A1A2E] font-semibold">This signing link isn&apos;t valid.</p>
          <p className="text-[13px] text-[#8E8EA8] font-medium leading-relaxed">
            If you&apos;ve just paid, go back to the confirmation page and use the button there, or
            email <a href="mailto:support@binperks.com" className="text-[#4A4B98] font-semibold underline">support@binperks.com</a> and
            we&apos;ll send you a fresh link.
          </p>
        </Card>
      </div>
    )
  }

  if (state === 'signed') {
    return (
      <div className="min-h-dvh bg-[#F5F5F8]">
        <Header title="Already signed" subtitle="Your Merchant Agreement is on file." />
        <Card>
          <Link href={DASHBOARD} className="w-full py-3.5 rounded-xl font-bold text-[14px] text-white bg-[#4A4B98]">
            Go to your dashboard →
          </Link>
        </Card>
      </div>
    )
  }

  if (phase === 'confirming' || phase === 'done' || phase === 'delayed') {
    return (
      <div className="min-h-dvh bg-[#F5F5F8]">
        <Header
          title="Agreement signed!"
          subtitle={phase === 'delayed'
            ? 'We\'re finishing your setup. Your dashboard will be ready in a few minutes.'
            : 'Setting up your dashboard...'}
        />
        <Card>
          {phase === 'delayed' ? (
            <>
              <p className="text-[13px] text-[#8E8EA8] font-medium leading-relaxed">
                You don&apos;t need to stay on this page. Sign in to your dashboard in a few minutes
                {email ? <> with <strong className="text-[#1A1A2E]">{email}</strong></> : null}.
              </p>
              <Link href={DASHBOARD} className="w-full py-3.5 rounded-xl font-bold text-[14px] text-white bg-[#4A4B98]">
                Go to sign in →
              </Link>
            </>
          ) : (
            <>
              <Spinner />
              <p className="text-[13px] text-[#8E8EA8] font-medium">
                {phase === 'done' ? 'All set — taking you to sign in…' : 'Confirming your signature…'}
              </p>
            </>
          )}
        </Card>
      </div>
    )
  }

  // FULL HEIGHT, NO OVERFLOW CLIPPING. DocuSeal pins its field panel (the
  // input and the Next / Complete button) to the bottom of the screen with
  // `position: sticky; bottom: 0`. Any ancestor with overflow hidden or auto
  // becomes the thing it sticks to instead — which used to be our rounded
  // card, so the panel sat at the very end of the document and the merchant
  // had to scroll down to it after every field. The form container below is
  // at least a full viewport tall and nothing around it clips, so the panel
  // stays on screen the whole way through.
  return (
    <div className="min-h-dvh bg-[#F5F5F8]">
      <Header
        title="Sign your agreement"
        subtitle="One last step. Review and sign your BinPerks Merchant Agreement to activate your account."
      />
      <p className="text-[11px] text-[#8E8EA8] font-medium text-center py-3 px-4 leading-relaxed bg-white border-b border-[#EBEBF2]">
        Questions about the agreement? Email{' '}
        <a href="mailto:support@binperks.com" className="text-[#4A4B98] font-semibold underline">support@binperks.com</a>.
      </p>
      <div className="relative w-full min-h-dvh bg-white">
        {phase === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white z-10">
            <Spinner />
            <p className="text-[13px] text-[#8E8EA8] font-medium">Loading your agreement…</p>
          </div>
        )}
        <DocusealForm
          src={src}
          email={email ?? undefined}
          withTitle={false}
          style={{ display: 'block', minHeight: '100dvh' }}
          onLoad={() => setPhase('signing')}
          onComplete={() => { void confirm() }}
        />
      </div>
    </div>
  )
}
