'use client'

/**
 * Member Terms of Service — Version 3.4A.
 *
 * Content mirrors D:\BinPerks\BinPerks_Member_Terms_v34A.md. Two things in the
 * source are document-workflow markers rather than terms and are deliberately
 * not rendered: the "Sections 1–5, 8–14 are unchanged from Version 3.4" review
 * annotation, and the "DRAFT FOR ATTORNEY REVIEW — NOT FOR EXECUTION" footer.
 *
 * The source carries an unfilled "Effective Date: [DATE]". Rather than invent
 * one, the header shows the version and the Last Updated value the document
 * actually states. Fill the real effective date here once it is set.
 */

import Link from 'next/link'

export default function MemberTermsPage() {
  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">

      {/* Header */}
      <div className="bg-[#4A4B98] px-6 pt-10 pb-8 flex flex-col items-center gap-1 text-center">
        <Link href="/" className="font-['Coiny'] text-4xl text-white leading-none tracking-wide">BinPerks</Link>
        <h1 className="font-['Coiny'] text-2xl text-white/90 mt-1">Member Terms of Service</h1>
        <p className="text-[12px] text-white/60 font-medium mt-1">Version 3.4A · Last updated August 2026 · BinPerks LLC · Tampa, FL</p>
        <a href="mailto:support@binperks.com" className="text-[12px] text-white/70 font-semibold underline mt-0.5">support@binperks.com</a>
      </div>

      {/* Body */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-5 py-8 flex flex-col gap-6">

        <Section title="1. What BinPerks Is">
          <P>BinPerks is a branded membership network for liquidation shoppers. When you join BinPerks, you become a member of the BinPerks LLC network — not a loyalty program owned by any individual store.</P>
          <P>Your BinPerks membership is with <B>BinPerks LLC</B>, a Florida limited liability company. The store where you enrolled is recorded as your Origin Store, but your membership belongs to BinPerks, not to that store.</P>
        </Section>

        <Section title="2. Membership">
          <P><B>2.1</B> By creating a BinPerks account, you agree to these Terms of Service.</P>
          <P><B>2.2</B> BinPerks membership is available in two tiers:</P>
          <Ul items={[
            'Starter (free) — earn stamps toward one lifetime coupon, then stamp earning pauses until upgrade',
            'VIP ($29.99/month) — earn stamps with tier-based multipliers, earn unlimited coupons, access to all VIP perks',
          ]} />
          <P><B>2.3</B> BinPerks membership is intended only for individuals age 18 or older. BinPerks does not knowingly permit individuals under 18 to create member accounts. If BinPerks learns that an individual under 18 has created an account, BinPerks will take appropriate steps including account removal and deletion of associated personal information.</P>
          <P><B>2.4</B> One account per person. One phone number per account.</P>
          <P><B>2.5</B> Your $29.99 monthly VIP payment is billed by BinPerks LLC. BinPerks is the merchant of record for your membership payment.</P>
        </Section>

        <Section title="3. Origin Store">
          <P><B>3.1</B> When you join BinPerks, the participating location through which you enrolled is permanently recorded as your <B>Origin Store</B>. This is an internal attribution record used by BinPerks to determine merchant commission eligibility.</P>
          <P><B>3.2</B> Your Origin Store does not limit where you can shop, earn stamps, or redeem coupons. You may visit any participating BinPerks location and earn rewards.</P>
          <P><B>3.3</B> You cannot select, change, or transfer your Origin Store. There is no member-facing store preference setting that affects how BinPerks determines merchant compensation.</P>
        </Section>

        <Section title="4. How Your Membership Payment Is Applied">
          <P><B>4.1</B> Your $29.99 monthly VIP membership payment is a payment to BinPerks LLC for your BinPerks network membership. BinPerks is the merchant of record for this transaction.</P>
          <P><B>4.2</B> BinPerks separately compensates participating merchants through its Merchant Commission program, based on Origin Store attribution. The specific merchant that receives a commission is determined by BinPerks&apos; eligibility rules — not by where you shop.</P>
          <P><B>4.3</B> If your Origin Store is not eligible for a Merchant Commission, no Merchant Commission accrues for that payment. Your membership payment remains a payment to BinPerks, and your membership benefits are completely unaffected.</P>
          <P><B>4.4</B> BinPerks&apos; commission program is a contractual arrangement between BinPerks and participating merchants. It has no effect on your stamps, coupons, perks, or any other member benefit.</P>
          <Sub>4.5 Refunds and Disputes</Sub>
          <P>BinPerks, as the merchant of record, is responsible for processing refunds and managing payment disputes on member VIP subscription payments. If you have a billing question or dispute, contact support@binperks.com before initiating a chargeback with your card issuer.</P>
        </Section>

        <Section title="5. Stamps and Rewards">
          <P><B>5.1</B> Stamps are awarded by participating BinPerks merchants during qualifying in-store visits. One qualifying visit per participating location per day.</P>
          <P><B>5.2</B> Stamps never expire.</P>
          <P><B>5.3</B> Every 20 effective stamps earns a coupon. Effective stamps reflect the member&apos;s tier multiplier applied to each qualifying visit. Coupon values vary by membership tier:</P>
          <Table
            headers={['Tier', 'Eligibility', 'Coupon Value', 'Stamp Multiplier']}
            rows={[
              ['Starter',     'Free membership',              '$5.00',  '1x'],
              ['Bronze VIP',  'VIP, 0–199 lifetime stamps',   '$7.00',  '2x'],
              ['Silver VIP',  'VIP, 200–749 lifetime stamps', '$10.00', '3x'],
              ['Gold VIP',    'VIP, 750–1,999 lifetime stamps', '$12.00', '4x'],
              ['Diamond VIP', 'VIP, 2,000+ lifetime stamps',  '$15.00', '5x'],
            ]}
          />
          <P><B>5.4</B> Starter members earn one lifetime coupon. After that coupon has been redeemed, stamp earning pauses. Upgrading to VIP immediately restores stamp earning.</P>
          <P><B>5.5</B> Coupons are valid at any participating BinPerks location, not just your Origin Store.</P>
          <P><B>5.6</B> Coupons have no cash value and cannot be exchanged for cash.</P>
          <P><B>5.7</B> BinPerks reserves the right to void coupons or stamps obtained through fraud, manipulation, or abuse of the platform.</P>
        </Section>

        <Section title="6. VIP Membership — Billing and Cancellation">
          <P><B>6.1</B> VIP membership is billed monthly at $29.99. Your subscription renews automatically each billing cycle.</P>
          <Sub>6.2 VIP Cancellation</Sub>
          <P>You may cancel your VIP membership at any time through the Member Settings page in the app. When you cancel:</P>
          <Ul items={[
            'Recurring billing stops at the end of your current billing period',
            'You retain full VIP access and all VIP benefits through the end of the period you have paid for',
            'At the end of that period, your account automatically downgrades to Starter tier',
            'Cancellation of VIP alone does not delete your stamps or account history; retention and deletion of personal information remains subject to the BinPerks Privacy Policy and any valid deletion request you make',
          ]} />
          <Sub>6.3 Account Deactivation by VIP Member</Sub>
          <P>If you choose to deactivate your BinPerks account while a VIP subscription is active:</P>
          <Ul items={[
            'Your VIP subscription is automatically scheduled for cancellation at the end of your current billing period',
            'Your account is deactivated immediately — you will not have access to your membership during the remaining paid period',
            'No refund is issued for the unused portion of the current billing period',
          ]} />
          <P><B>6.4</B> BinPerks does not issue partial refunds for unused portions of a billing period under either cancellation scenario described above.</P>
        </Section>

        <Section title="7. Account Termination by BinPerks">
          <P><B>7.1</B> BinPerks may suspend or terminate your account for:</P>
          <Ul items={[
            'Abuse of the stamp, coupon, or referral system',
            'Fraudulent activity',
            'Initiating fraudulent payment disputes',
            'Violation of these Terms',
          ]} />
          <P><B>7.2</B> When BinPerks permanently terminates a member account for cause:</P>
          <Ul items={[
            'Future recurring VIP billing will be cancelled',
            'Access to the membership account is terminated immediately',
            'Unused stamps and unredeemed coupons are forfeited and have no cash value',
            'Treatment of any remaining paid VIP period and eligibility for any refund is subject to the nature of the violation and applicable law',
          ]} />
          <P><B>7.3</B> BinPerks will use commercially reasonable efforts to provide notice of termination except where immediate termination is necessary to prevent ongoing harm, fraud, or abuse.</P>
        </Section>

        <Section title="8. SMS Communications">
          <P><B>8.1</B> BinPerks sends the following categories of SMS messages:</P>
          <P><B>Authentication messages</B> — one-time sign-in codes necessary to access your account. These are security messages required for account access.</P>
          <P><B>Operational membership notifications</B> — notifications about your membership activity, including stamp confirmations and coupon notifications. These are sent as part of your membership.</P>
          <P><B>Marketing and promotional messages</B> — communications about BinPerks offers, network announcements, and participating merchant promotions. These require your separate consent where required by applicable law.</P>
          <P><B>8.2</B> By enrolling in BinPerks membership, you consent to receive authentication and operational membership SMS messages as described above.</P>
          <P><B>8.3</B> Marketing SMS consent is obtained separately in the enrollment flow where required by applicable law.</P>
          <P><B>8.4</B> You may revoke consent to marketing SMS messages at any time by replying STOP to any BinPerks marketing message. Standard message and data rates may apply. Revoking marketing consent does not affect authentication or operational messages.</P>
        </Section>

        <Section title="9. AI Product Scanner">
          <P><B>9.1</B> BinPerks offers an AI-powered product scanner feature for use inside participating bin stores.</P>
          <P><B>9.2</B> The scanner uses artificial intelligence to attempt to identify products. Results are best guesses and are not guaranteed to be accurate. Always inspect the item before purchasing.</P>
          <P><B>9.3</B> The scanner records your scan activity including a compressed copy of your item photo, the AI identification result, the estimated retail price, and your Shopping Cart or Back to Bins choice. This data is used to improve the BinPerks network and member experience. Your stored scan photos are private to you, are deleted when you deactivate your account, and are described further in Section 4 of the BinPerks Privacy Policy.</P>
          <P><B>9.4</B> Scan results are for informational purposes only. BinPerks does not guarantee the accuracy of product identification, retail price estimates, or representative product images shown.</P>
          <P><B>9.5</B> &quot;Shopping Cart&quot; selections represent your declared interest in an item. They do not represent a verified purchase.</P>
          <P><B>9.6</B> Representative product images are sourced from third-party image search and shown for general reference only. The image shown may not match the exact item in the bin.</P>
        </Section>

        <Section title="10. Your Data">
          <P><B>10.1</B> BinPerks maintains the direct membership relationship and controls access to the BinPerks member database. BinPerks does not sell your personal contact information to third parties.</P>
          <P><B>10.2</B> BinPerks shares relevant membership activity with participating merchants only as described in the BinPerks Privacy Policy. Merchants do not receive your phone number, email address, or the ability to export your membership data.</P>
          <P><B>10.3</B> BinPerks may use aggregated, anonymized data for network intelligence and platform improvement.</P>
          <P><B>10.4</B> You may request access to, correction of, or deletion of your personal information by contacting support@binperks.com. Deletion requests are subject to legitimate legal retention requirements. Additional rights may exist under applicable state privacy laws.</P>
          <P className="mt-1">Please review our <Link href="/terms/privacy" className="text-[#4A4B98] font-semibold underline">Privacy Policy</Link> for full details.</P>
        </Section>

        <Section title="11. Limitation of Liability">
          <P><B>11.1</B> BinPerks&apos; total liability to you for any claim shall not exceed the total membership fees paid by you in the three months preceding the claim.</P>
          <P><B>11.2</B> BinPerks is not liable for indirect, incidental, or consequential damages.</P>
          <P><B>11.3</B> BinPerks does not guarantee the accuracy of AI product identification, retail price estimates, or representative images shown in the scanner feature.</P>
        </Section>

        <Section title="12. Governing Law">
          <P>These Terms are governed by the laws of the State of Florida. Disputes shall be resolved in Hillsborough County, Florida.</P>
        </Section>

        <Section title="13. Changes to These Terms">
          <P>BinPerks may update these Terms at any time. Material changes will be communicated via SMS or email. Continued use of the platform after notice constitutes acceptance.</P>
        </Section>

        <Section title="14. Contact">
          <P>BinPerks LLC<br />9110 Oak Pride Ct, Tampa, FL 33647<br /><a href="mailto:support@binperks.com" className="text-[#4A4B98] underline font-semibold">support@binperks.com</a><br />binperks.com</P>
        </Section>

        <div className="pt-4 border-t border-[#EBEBF2] flex flex-col gap-1.5 text-center">
          <Link href="/terms/privacy" className="text-[13px] font-semibold text-[#4A4B98] underline">Privacy Policy</Link>
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

/** Inline emphasis for clause numbers and defined terms. */
function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-extrabold">{children}</strong>
}

/** Lettered sub-heading inside a section, e.g. "6.2 VIP Cancellation". */
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
              {row.map((cell, i) => (
                <td
                  key={i}
                  className={
                    i === 0 ? 'px-4 py-2.5 font-semibold text-[#1A1A2E] whitespace-nowrap'
                    : i === row.length - 2 ? 'px-4 py-2.5 font-bold text-[#4A4B98] whitespace-nowrap'
                    : 'px-4 py-2.5 text-[#8E8EA8]'
                  }
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
