'use client'

import Link from 'next/link'

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">

      {/* Header */}
      <div className="bg-[#4A4B98] px-6 pt-10 pb-8 flex flex-col items-center gap-1 text-center">
        <Link href="/" className="font-['Coiny'] text-4xl text-white leading-none tracking-wide">BinPerks</Link>
        <h1 className="font-['Coiny'] text-2xl text-white/90 mt-1">Privacy Policy</h1>
        <p className="text-[12px] text-white/60 font-medium mt-1">Effective July 4, 2026 · BinPerks LLC · Tampa, FL</p>
        <a href="mailto:support@binperks.com" className="text-[12px] text-white/70 font-semibold underline mt-0.5">support@binperks.com</a>
      </div>

      <main className="flex-1 max-w-2xl mx-auto w-full px-5 py-8 flex flex-col gap-6">

        <Section title="1. Overview">
          <P>BinPerks LLC (&quot;BinPerks,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates a loyalty and rewards platform for bin stores and liquidation retailers. This Privacy Policy explains how we collect, use, store, and protect your personal information when you use our platform at app.binperks.com.</P>
          <P className="mt-1">By using BinPerks, you agree to the practices described in this policy.</P>
        </Section>

        <Section title="2. Information We Collect">
          <p className="text-[12px] font-extrabold text-[#1A1A2E] tracking-wide uppercase mb-1">From Members:</p>
          <Ul items={[
            'First and last name',
            'Phone number — used for account identification and SMS communications',
            'Email address — used for magic link sign-in and account communications',
            'Stamp and rewards history — your visit history, stamps earned, and coupons issued and redeemed',
            'Referral activity — if you referred others or were referred by someone',
          ]} />
          <p className="text-[12px] font-extrabold text-[#1A1A2E] tracking-wide uppercase mt-3 mb-1">From Merchants:</p>
          <Ul items={[
            'Business name and company information',
            'Owner name and contact information',
            'Store details — location, brand colors, logo',
            'Payment information — processed and stored securely by Stripe. BinPerks does not store your full card details.',
            'Cashier information — names and PINs of staff users added to the platform',
          ]} />
          <p className="text-[12px] font-extrabold text-[#1A1A2E] tracking-wide uppercase mt-3 mb-1">Automatically Collected:</p>
          <Ul items={[
            'Usage data — pages visited, actions taken within the platform',
            'Device and browser information — used for security and troubleshooting',
          ]} />
        </Section>

        <Section title="3. How We Use Your Information">
          <p className="text-[12px] font-extrabold text-[#1A1A2E] tracking-wide uppercase mb-1">For Members:</p>
          <Ul items={[
            'To operate your loyalty account and track stamps and rewards',
            'To send sign-in links via SMS and email',
            'To send SMS notifications about your rewards and account (if opted in)',
            'To calculate your membership tier and issue coupons',
          ]} />
          <p className="text-[12px] font-extrabold text-[#1A1A2E] tracking-wide uppercase mt-3 mb-1">For Merchants:</p>
          <Ul items={[
            'To operate your merchant dashboard and manage your store',
            'To process your monthly subscription via Stripe',
            'To send account notifications and billing communications',
            'To provision your store on the platform',
          ]} />
        </Section>

        <Section title="4. SMS Communications">
          <Ul items={[
            'BinPerks uses GoHighLevel and Twilio to deliver SMS messages.',
            'SMS messages are sent from the BinPerks dedicated phone number.',
            'You can opt out at any time by replying STOP to any message.',
            'Message and data rates may apply.',
            'BinPerks does not sell your phone number to third parties.',
          ]} />
        </Section>

        <Section title="5. Data Sharing">
          <P>BinPerks does not sell your personal information. We share data only in the following circumstances:</P>
          <Ul items={[
            'With merchants: Your name, stamp history, and tier are visible to the merchant whose store you are a member of. Your phone number is used for stamp lookup but is not shared for external use.',
            'With service providers: We use Supabase (database and authentication), Stripe (payments), GoHighLevel/Twilio (SMS), and Vercel (hosting). These providers process your data on our behalf and are bound by their own privacy policies.',
            'For legal compliance: We may disclose information if required by law, court order, or government request.',
          ]} />
        </Section>

        <Section title="6. Data Retention">
          <Ul items={[
            'Member data is retained indefinitely on the BinPerks platform, even if your home store closes or leaves the platform.',
            'Merchant data is retained after subscription cancellation for legal and compliance purposes.',
            'You may not request deletion of your BinPerks account or data.',
          ]} />
        </Section>

        <Section title="7. Data Security">
          <Ul items={[
            'BinPerks uses industry-standard security practices including encrypted connections (HTTPS), row-level security on our database, and secure authentication via magic links (no passwords).',
            'Payment information is processed by Stripe and never stored on BinPerks servers.',
            'We take reasonable measures to protect your data but cannot guarantee absolute security.',
          ]} />
        </Section>

        <Section title="8. Children's Privacy">
          <P>BinPerks is intended for users 18 years of age and older. We do not knowingly collect personal information from anyone under 18. If you believe a minor has created an account, contact support@binperks.com.</P>
        </Section>

        <Section title="9. Your Rights (Florida Residents)">
          <P>As a Florida resident, you have certain rights regarding your personal information under applicable Florida law. To exercise any of these rights, contact <a href="mailto:support@binperks.com" className="text-[#4A4B98] underline font-semibold">support@binperks.com</a>.</P>
        </Section>

        <Section title="10. Changes to This Policy">
          <P>BinPerks will provide at least 90 days notice before making material changes to this Privacy Policy. Notice will be delivered via SMS (for members) and email (for merchants).</P>
        </Section>

        <Section title="11. Contact">
          <P>If you have questions about this Privacy Policy or how your data is handled, contact us at:<br /><br />BinPerks LLC<br />9110 Oak Pride Ct, Tampa, FL 33647<br /><a href="mailto:support@binperks.com" className="text-[#4A4B98] underline font-semibold">support@binperks.com</a></P>
        </Section>

        <div className="pt-4 border-t border-[#EBEBF2] flex flex-col gap-1.5 text-center">
          <Link href="/terms/member" className="text-[13px] font-semibold text-[#4A4B98] underline">Member Terms of Service</Link>
          <Link href="/terms/merchant" className="text-[13px] font-semibold text-[#4A4B98] underline">Merchant Terms of Service</Link>
        </div>

      </main>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-['Montserrat'] text-[15px] font-extrabold text-[#1A1A2E] tracking-tight">{title}</h2>
      <div className="bg-white rounded-2xl px-5 py-4 shadow-sm flex flex-col gap-2">
        {children}
      </div>
    </div>
  )
}

function P({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-[13px] font-medium text-[#1A1A2E] leading-relaxed ${className}`}>{children}</p>
}

function Ul({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-[13px] font-medium text-[#1A1A2E] leading-relaxed">
          <span className="text-[#4A4B98] font-black flex-shrink-0 mt-0.5">·</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}
