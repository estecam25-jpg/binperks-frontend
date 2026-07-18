'use client'

import Link from 'next/link'

export default function MerchantTermsPage() {
  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">

      {/* Header */}
      <div className="bg-[#4A4B98] px-6 pt-10 pb-8 flex flex-col items-center gap-1 text-center">
        <Link href="/" className="font-['Coiny'] text-4xl text-white leading-none tracking-wide">BinPerks</Link>
        <h1 className="font-['Coiny'] text-2xl text-white/90 mt-1">Merchant Terms of Service</h1>
        <p className="text-[12px] text-white/60 font-medium mt-1">Effective July 4, 2026 · BinPerks LLC · Tampa, FL</p>
        <a href="mailto:support@binperks.com" className="text-[12px] text-white/70 font-semibold underline mt-0.5">support@binperks.com</a>
      </div>

      <main className="flex-1 max-w-2xl mx-auto w-full px-5 py-8 flex flex-col gap-6">

        <Section title="1. Acceptance of Terms">
          <P>By applying for and activating a BinPerks merchant account, you agree to these Terms of Service. If you do not agree, do not proceed with your application. These terms are governed by the laws of the State of Florida.</P>
        </Section>

        <Section title="2. The BinPerks Platform">
          <P>BinPerks provides a managed loyalty and retention platform for bin stores and liquidation retailers. BinPerks handles the technology, member communications, and reporting. You, the merchant, are responsible for training your staff, honoring member coupons, and maintaining accurate store information.</P>
        </Section>

        <Section title="3. Subscription and Billing">
          <Ul items={[
            'The base subscription is $299.99/month for your first location.',
            'Each additional location is $79.99/month.',
            'Billing is processed monthly via Stripe on your subscription anniversary date.',
            'There is no free trial and no setup fee.',
            'Subscriptions are non-refundable. There are no prorated refunds under any circumstances.',
            'If you cancel your subscription, your access continues until the end of your current paid billing period. Your subscription will not renew after that date.',
          ]} />
        </Section>

        <Section title="4. Payment Failure">
          <Ul items={[
            'If a payment fails, BinPerks will notify you and allow a 30-day grace period to resolve the billing issue.',
            'If payment is not received within 30 days, your account will be deactivated. Member data is retained and not deleted.',
            'To reactivate a deactivated account, you must pay your outstanding balance in full.',
            'There is no option to pause your subscription.',
          ]} />
        </Section>

        <Section title="5. Your Responsibilities">
          <P>As a BinPerks merchant, you agree to:</P>
          <Ul items={[
            'Honor all valid member coupons presented at your store.',
            'Ensure your cashiers are properly trained on the stamp tool.',
            'Keep your store information (brand colors, logo, cashier PINs) accurate and up to date.',
            'Not manipulate, falsify, or abuse the stamp or coupon system.',
            'Comply with all applicable federal, state, and local laws in the operation of your business.',
          ]} />
        </Section>

        <Section title="6. Member Data">
          <Ul items={[
            'BinPerks collects and stores member data on your behalf.',
            'Member data (names, phone numbers, stamp history) belongs to BinPerks and remains on the BinPerks platform.',
            'If you cancel your subscription, member data is retained by BinPerks and is not transferred to you.',
            'You may not export, download, or transfer member data outside of the BinPerks platform.',
            'You may not use member data for any purpose outside of BinPerks, including but not limited to third-party marketing, resale, or contact outside the platform.',
          ]} />
        </Section>

        <Section title="7. Member Management">
          <Ul items={[
            'You may blacklist a member from your store. A reason must be documented when blacklisting.',
            'Blacklisted members are blocked from earning stamps at your locations but their account is not deleted.',
            'BinPerks reserves the right to review blacklisting decisions.',
          ]} />
        </Section>

        <Section title="8. Store Branding and White Labeling">
          <Ul items={[
            'You may customize your store\'s logo, primary brand color, and heading font through your merchant dashboard.',
            'BinPerks retains the right to display "Powered by BinPerks" on all member-facing pages.',
            'You may not use BinPerks branding, trademarks, or intellectual property outside of the platform without written permission.',
          ]} />
        </Section>

        <Section title="9. Perks and Promotions">
          <Ul items={[
            'You may offer up to 2 perks to Free members and up to 5 perks to VIP members through your merchant dashboard.',
            'At least 1 Free member perk and at least 3 VIP member perks must be active at all times.',
            'You are solely responsible for delivering any perks or promotions you advertise to members.',
            'BinPerks is not liable for your failure to deliver advertised perks or promotions.',
          ]} />
        </Section>

        <Section title="10. Canonical Store URL">
          <Ul items={[
            'Each store is assigned a unique canonical URL (e.g. app.binperks.com/member/join/FL-Tampa-YourStore).',
            'This URL is used on QR codes, referral links, and member communications.',
            'If you need to change your canonical URL (e.g. due to a rebrand), contact support@binperks.com. URL changes may affect existing QR codes and referral links.',
          ]} />
        </Section>

        <Section title="11. Account Termination by Merchant">
          <Ul items={[
            'You may cancel your subscription at any time by contacting support@binperks.com.',
            'Upon cancellation, your store will be deactivated and removed from the BinPerks store directory.',
            'Member data is retained by BinPerks.',
          ]} />
        </Section>

        <Section title="12. Account Termination by BinPerks">
          <Ul items={[
            'BinPerks will provide at least 30 days written notice before terminating your account, except in cases of egregious violations.',
            'Grounds for immediate termination include but are not limited to: fraud, abuse of the platform, illegal activity, or violations of member privacy.',
            'Members will be given advance notice if their home store is being removed from the platform.',
          ]} />
        </Section>

        <Section title="13. Disputes">
          <Ul items={[
            'Billing disputes must be submitted to support@binperks.com within 30 days of the charge.',
            'BinPerks will review billing disputes within 5 business days.',
            'Billing errors will be corrected and credited to your next billing cycle. No cash refunds are issued.',
            'Technical issues will be addressed within 1 business day of being reported.',
          ]} />
        </Section>

        <Section title="14. Pricing and Platform Changes">
          <Ul items={[
            'BinPerks will provide at least 90 days notice before making material changes to subscription pricing, tier structure, or coupon values.',
            'Notice will be delivered via email to your registered merchant email address.',
          ]} />
        </Section>

        <Section title="15. Limitation of Liability">
          <Ul items={[
            'BinPerks provides the platform on an "as is" basis.',
            'BinPerks is not liable for lost revenue, lost members, or business interruption resulting from platform downtime, technical issues, or changes to the platform.',
            'BinPerks is not liable for your failure to honor member coupons or deliver advertised perks.',
          ]} />
        </Section>

        <Section title="16. Governing Law">
          <P>These terms are governed by the laws of the State of Florida. Any disputes shall be resolved in a court of competent jurisdiction in Hillsborough County, Florida.</P>
        </Section>

        <Section title="17. Contact">
          <P>BinPerks LLC<br />9110 Oak Pride Ct, Tampa, FL 33647<br /><a href="mailto:support@binperks.com" className="text-[#4A4B98] underline font-semibold">support@binperks.com</a></P>
        </Section>

        <div className="pt-4 border-t border-[#EBEBF2] flex flex-col gap-1.5 text-center">
          <Link href="/terms/privacy" className="text-[13px] font-semibold text-[#4A4B98] underline">Privacy Policy</Link>
          <Link href="/terms/member" className="text-[13px] font-semibold text-[#4A4B98] underline">Member Terms</Link>
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
