'use client'

/**
 * Privacy Policy — Version 3.4A.
 *
 * Content mirrors D:\BinPerks\BinPerks_Privacy_Policy_v34A.md. The
 * "DRAFT FOR ATTORNEY REVIEW — NOT FOR EXECUTION" footer in the source is a
 * document-workflow marker, not policy text, and is deliberately not rendered.
 *
 * The source carries an unfilled "Effective Date: [DATE]". Rather than invent
 * one, the header shows the version and the Last Updated value the document
 * actually states. Fill the real effective date here once it is set.
 */

import Link from 'next/link'

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">

      {/* Header */}
      <div className="bg-[#4A4B98] px-6 pt-10 pb-8 flex flex-col items-center gap-1 text-center">
        <Link href="/" className="font-['Coiny'] text-4xl text-white leading-none tracking-wide">BinPerks</Link>
        <h1 className="font-['Coiny'] text-2xl text-white/90 mt-1">Privacy Policy</h1>
        <p className="text-[12px] text-white/60 font-medium mt-1">Version 3.4A · Last updated August 2026 · BinPerks LLC · Tampa, FL</p>
        <a href="mailto:support@binperks.com" className="text-[12px] text-white/70 font-semibold underline mt-0.5">support@binperks.com</a>
      </div>

      <main className="flex-1 max-w-2xl mx-auto w-full px-5 py-8 flex flex-col gap-6">

        <Section title="1. Introduction">
          <P>BinPerks LLC (&quot;BinPerks&quot;, &quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates the BinPerks membership network at app.binperks.com. This Privacy Policy explains how we collect, use, share, and protect your information when you use our platform as a member or merchant.</P>
        </Section>

        <Section title="2. Information We Collect">
          <Sub>2.1 Members</Sub>
          <Ul items={[
            'Name, phone number, email address',
            'Stamp history, coupon history, referral history',
            'Store visit activity and behavioral data',
            'AI product scanner data including: item photo hashes (not the photos themselves), identified products, product categories, retail price estimates, and Shopping Cart / Back to Bins choices',
            'Device type, browser type, and platform usage data',
          ]} />
          <Sub>2.2 Merchants</Sub>
          <Ul items={[
            'Business name, owner name, email address, phone number',
            'Billing and payment information (processed by Stripe — BinPerks does not store card numbers)',
            'Store information, branding assets, and merchant dashboard activity',
            'Stripe Connect account status and payout information',
            'Commission, settlement, and ledger data',
            'W-9 and tax compliance information',
          ]} />
          <Sub>2.3 Automatically Collected</Sub>
          <Ul items={[
            'Usage data, page views, and feature interactions',
            'IP address, device type, and browser type',
            'Session and authentication data',
          ]} />
        </Section>

        <Section title="3. How We Use Your Information">
          <Sub>Members</Sub>
          <Ul items={[
            'To operate your BinPerks membership and loyalty rewards',
            'To send authentication codes, operational membership notifications, and where separately consented, marketing communications via SMS and email',
            "To power the AI product scanner and build BinPerks' product intelligence database",
            'To calculate and distribute merchant commissions based on your Origin Store attribution (internal use)',
            'To generate network intelligence from aggregated, anonymized data',
            'To detect and prevent fraud and platform abuse',
          ]} />
          <Sub>Merchants</Sub>
          <Ul items={[
            'To operate your BinPerks participation and merchant dashboard',
            'To calculate and distribute monthly settlement payments via Stripe Connect',
            'To send authentication codes, platform notifications, and onboarding communications',
            'To verify identity and maintain Stripe Connect compliance',
            'To fulfill tax reporting obligations including issuance of tax forms where required by applicable law',
          ]} />
        </Section>

        <Section title="4. AI Product Scanner Data">
          <P><B>4.1</B> When you use the BinPerks AI scanner, your item photo is transmitted to Anthropic&apos;s Claude AI for product identification. BinPerks does not permanently retain the submitted item photograph — only a cryptographic hash is retained by BinPerks. The photograph is transmitted to Anthropic for processing and may be retained by Anthropic in accordance with Anthropic&apos;s then-current commercial API data-retention terms.</P>
          <P><B>4.2</B> Product identification results, categories, retail price estimates, and your Shopping Cart or Back to Bins choice are stored in BinPerks&apos; product intelligence database and used to improve identification accuracy over time.</P>
          <P><B>4.3</B> BinPerks uses the Brave Search API to retrieve representative product images. These images are displayed temporarily during your scan session and are not permanently stored by BinPerks.</P>
          <P><B>4.4</B> Scanner data is used for product intelligence, member preference insights, and network analytics. It is not sold to third parties.</P>
          <P><B>4.5</B> &quot;Shopping Cart&quot; selections represent declared member interest only — not verified purchases. BinPerks does not represent scanner data as verified sales information.</P>
          <P><B>4.6</B> BinPerks maintains a product intelligence catalog containing product names, brands, categories, and scan counts. Member-linked scanner records are subject to deletion rights described in Section 10. To the extent product intelligence has been deidentified in accordance with applicable law so that it can no longer reasonably be associated with a member or household, BinPerks may retain that deidentified information as a proprietary data asset. BinPerks will not attempt to reidentify information maintained as deidentified, except where permitted by applicable law for purposes of testing the effectiveness of deidentification safeguards.</P>
        </Section>

        <Section title="5. Payment Data">
          <P><B>5.1</B> BinPerks uses Stripe as its payment processor. BinPerks LLC is the merchant of record for all member VIP subscription payments.</P>
          <P><B>5.2</B> BinPerks does not store full credit card numbers, CVV codes, or raw bank account numbers. All payment card data is processed and stored by Stripe in accordance with PCI-DSS standards.</P>
          <P><B>5.3</B> As the merchant of record, BinPerks is responsible for managing payment disputes, chargebacks, and refunds on member VIP subscription payments.</P>
          <P><B>5.4</B> Merchant payout data is processed through Stripe Connect. Merchants&apos; bank account information is stored by Stripe, not by BinPerks.</P>
        </Section>

        <Section title="6. Information Sharing">
          <P><B>6.1</B> BinPerks does not sell your personal information to third parties.</P>
          <P><B>6.2</B> BinPerks shares information with the following service providers as necessary to operate the platform:</P>
          <Table
            headers={['Provider', 'Purpose']}
            rows={[
              ['Stripe',            'Payment processing, merchant payouts, fraud detection'],
              ['Anthropic',         'AI product identification (image transmitted for processing; see Section 4.1 for retention terms)'],
              ['Brave',             'Representative product image search (transient display only, not stored by BinPerks)'],
              ['GoHighLevel (GHL)', 'SMS and email communications delivery'],
              ['Resend',            'Transactional email delivery'],
              ['Supabase',          'Database, authentication, and file storage'],
              ['Vercel',            'Platform hosting and deployment'],
              ['Upstash Redis',     'Short-lived authentication token storage (automatic expiration)'],
            ]}
          />
          <Sub>6.3 Merchant Access to Member Information</Sub>
          <P>Participating merchants may access member information only as follows:</P>
          <Ul items={[
            'Cashier staff at any participating location may access only the information necessary to identify the member, determine tier and stamp status, award a stamp, or redeem a coupon at the moment of service',
            'Origin Merchants may view their enrolled member list (name, tier, stamps, join date) and their own commission and settlement reporting through the BinPerks merchant dashboard',
            "A Merchant whose location was visited may receive operational reporting about stamp and coupon activity that occurred at that Merchant's own location; this reporting does not include the member's activity history at other merchants' locations",
            'No merchant receives member phone numbers, email addresses, or the ability to export member contact information',
            "Merchants do not receive information about member activity at other merchants' locations",
          ]} />
          <P><B>6.4</B> BinPerks may disclose information when required by law, court order, or government authority, or to protect the safety of users or the integrity of the platform.</P>
        </Section>

        <Section title="7. SMS Communications">
          <P>BinPerks sends three categories of SMS messages:</P>
          <P><B>Authentication messages</B> — one-time sign-in codes required to access your account.</P>
          <P><B>Operational membership notifications</B> — stamp confirmations, coupon notifications, and other communications about your membership activity.</P>
          <P><B>Marketing and promotional messages</B> — promotional communications that require your separate consent where required by applicable law.</P>
          <P>You may revoke consent to marketing SMS messages at any time by replying STOP. Standard message and data rates may apply. Revoking marketing consent does not affect authentication or operational messages.</P>
        </Section>

        <Section title="8. Data Security">
          <P>BinPerks implements industry-standard security measures including:</P>
          <Ul items={[
            'Encrypted data transmission (HTTPS/TLS) for all platform communications',
            'Encrypted database storage via Supabase',
            'Bcrypt hashing for cashier PIN credentials',
            'Short-lived authentication codes with automatic expiration',
            'Row-level security policies restricting data access by role',
            'Admin access limited to an approved allowlist of email addresses',
          ]} />
          <P>No system is completely secure. Contact support@binperks.com immediately if you believe your account has been compromised.</P>
        </Section>

        <Section title="9. Data Retention">
          <P><B>Members:</B> Member personal information is retained for the life of the account and for a period following deactivation as required for audit, dispute resolution, and applicable legal obligations.</P>
          <P><B>Merchants:</B> Merchant data including settlement records, commission history, and tax compliance information is retained for the period required by applicable law and legitimate business purposes.</P>
          <P><B>Scanner records:</B> Member-linked scan records are subject to deletion as described in Section 10. To the extent product intelligence has been deidentified in accordance with applicable law so that it can no longer reasonably be associated with a member or household, BinPerks may retain that deidentified information as a proprietary data asset indefinitely. BinPerks will not attempt to reidentify such deidentified information except as permitted by applicable law.</P>
          <P><B>Authentication tokens:</B> OTP codes and short-lived authentication tokens are automatically deleted after use or expiration.</P>
        </Section>

        <Section title="10. Your Privacy Rights">
          <P>BinPerks offers the following rights regarding your personal information:</P>
          <P><B>Access:</B> You may request a copy of the personal information BinPerks holds about you.</P>
          <P><B>Correction:</B> You may request correction of inaccurate personal information.</P>
          <P><B>Deletion:</B> You may request deletion of your personal information. BinPerks will delete or deidentify member-linked personal information upon a valid deletion request, subject to legitimate legal retention requirements (such as tax records, dispute resolution, and fraud prevention).</P>
          <P><B>Opt-out of marketing SMS:</B> Reply STOP to any BinPerks marketing message.</P>
          <P>These rights are offered by BinPerks as a matter of policy. Additional rights may exist under applicable state or federal privacy laws. To exercise any of these rights, contact support@binperks.com.</P>
        </Section>

        <Section title="11. California Residents">
          <P>To the extent the California Consumer Privacy Act (CCPA) applies to BinPerks, California residents may have rights under applicable California law regarding their personal information. To exercise rights available under applicable California law, contact support@binperks.com.</P>
        </Section>

        <Section title="12. Florida Residents">
          <P>Florida&apos;s Information Protection Act (Fla. Stat. §501.171) imposes data security and breach notification obligations on businesses that maintain personal information of Florida residents. BinPerks will notify affected individuals in the event of a data breach involving personal information as required by applicable law.</P>
        </Section>

        <Section title="13. Minors">
          <P>BinPerks membership is intended only for individuals age 18 or older. BinPerks does not knowingly permit individuals under 18 to create member accounts. If BinPerks learns that an individual under 18 has provided personal information, BinPerks will take appropriate steps including removal of the account and deletion of associated personal information.</P>
        </Section>

        <Section title="14. Changes to This Policy">
          <P>BinPerks may update this Privacy Policy at any time. Material changes will be communicated via SMS or email to active members and merchants. Continued use of the platform after notice constitutes acceptance of the updated policy.</P>
        </Section>

        <Section title="15. Contact">
          <P><B>BinPerks LLC</B><br />9110 Oak Pride Ct, Tampa, FL 33647<br /><a href="mailto:support@binperks.com" className="text-[#4A4B98] underline font-semibold">support@binperks.com</a><br />binperks.com</P>
        </Section>

        <div className="pt-4 border-t border-[#EBEBF2] flex flex-col gap-1.5 text-center">
          <Link href="/terms/member" className="text-[13px] font-semibold text-[#4A4B98] underline">Member Terms</Link>
          <Link href="/terms/merchant" className="text-[13px] font-semibold text-[#4A4B98] underline">Merchant Terms</Link>
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

function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-extrabold">{children}</strong>
}

function Sub({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] font-extrabold text-[#1A1A2E] tracking-wide uppercase mt-2">{children}</p>
  )
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

/** Scrolls horizontally on a phone rather than crushing the columns. */
function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="mt-1 rounded-xl overflow-hidden border border-[#EBEBF2] overflow-x-auto">
      <table className="w-full min-w-[420px] text-[13px]">
        <thead className="bg-[#4A4B98] text-white">
          <tr>
            {headers.map(h => (
              <th key={h} className="px-4 py-2.5 text-left font-bold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#EBEBF2] bg-white">
          {rows.map(row => (
            <tr key={row[0]}>
              <td className="px-4 py-2.5 font-semibold text-[#1A1A2E] whitespace-nowrap">{row[0]}</td>
              {row.slice(1).map((cell, i) => (
                <td key={i} className="px-4 py-2.5 text-[#8E8EA8]">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
