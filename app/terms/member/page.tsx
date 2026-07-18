'use client'

import Link from 'next/link'

export default function MemberTermsPage() {
  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">

      {/* Header */}
      <div className="bg-[#4A4B98] px-6 pt-10 pb-8 flex flex-col items-center gap-1 text-center">
        <Link href="/" className="font-['Coiny'] text-4xl text-white leading-none tracking-wide">BinPerks</Link>
        <h1 className="font-['Coiny'] text-2xl text-white/90 mt-1">Member Terms of Service</h1>
        <p className="text-[12px] text-white/60 font-medium mt-1">Effective July 4, 2026 · BinPerks LLC · Tampa, FL</p>
        <a href="mailto:support@binperks.com" className="text-[12px] text-white/70 font-semibold underline mt-0.5">support@binperks.com</a>
      </div>

      {/* Body */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-5 py-8 flex flex-col gap-6">

        <Section title="1. Acceptance of Terms">
          <P>By creating a BinPerks member account, you agree to these Terms of Service. If you do not agree, do not create an account. These terms are governed by the laws of the State of Florida.</P>
        </Section>

        <Section title="2. Eligibility">
          <P>You must be at least 18 years of age to create a BinPerks account. By signing up, you confirm that you are 18 or older.</P>
        </Section>

        <Section title="3. Your Account">
          <Ul items={[
            'Your BinPerks account is personal and non-transferable.',
            'You are responsible for keeping your phone number current. If you lose access to your phone number, contact support@binperks.com for assistance.',
            'You may only have one account per participating store location.',
            'You may not share your account, phone number, or sign-in link with anyone else.',
          ]} />
        </Section>

        <Section title="4. Earning Stamps">
          <Ul items={[
            'You earn one (1) stamp per visit, per store location, per day.',
            'Stamps are awarded at the time of your visit by the store cashier.',
            'Stamps may be earned at any location operated by your home store\'s merchant.',
            'Stamps cannot be earned at stores operated by a different merchant, even if they also use BinPerks.',
            'BinPerks reserves the right to reverse stamps awarded in error, before midnight on the day they were awarded.',
            'Stamps do not expire.',
          ]} />
        </Section>

        <Section title="5. Rewards and Coupons">
          <Ul items={[
            'Coupons are earned when you reach the stamp threshold for your membership tier.',
            'Coupons have no expiration date once earned.',
            'Coupons cannot be transferred, exchanged for cash, or used at a different merchant\'s locations.',
            'Free tier members earn one (1) lifetime coupon. To continue earning rewards, you must upgrade to VIP.',
            'BinPerks is not responsible for a merchant\'s refusal to honor a coupon. Contact support@binperks.com if this occurs.',
          ]} />
        </Section>

        <Section title="6. Membership Tiers">
          <P>Your tier is calculated automatically based on your lifetime stamp total:</P>
          <div className="mt-3 rounded-xl overflow-hidden border border-[#EBEBF2]">
            <table className="w-full text-[13px]">
              <thead className="bg-[#4A4B98] text-white">
                <tr>
                  <th className="px-4 py-2.5 text-left font-bold">Tier</th>
                  <th className="px-4 py-2.5 text-left font-bold">Lifetime Stamps</th>
                  <th className="px-4 py-2.5 text-left font-bold">Coupon Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBEBF2] bg-white">
                {[
                  ['Starter', '0 – 199',     '$5.00'],
                  ['Silver',  '200 – 749',   '$10.00'],
                  ['Gold',    '750 – 1,999', '$12.00'],
                  ['Diamond', '2,000+',      '$15.00'],
                ].map(([tier, stamps, value]) => (
                  <tr key={tier}>
                    <td className="px-4 py-2.5 font-semibold text-[#1A1A2E]">{tier}</td>
                    <td className="px-4 py-2.5 text-[#8E8EA8]">{stamps}</td>
                    <td className="px-4 py-2.5 font-bold text-[#4A4B98]">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="7. VIP Membership">
          <Ul items={[
            'VIP membership is $29.99/month and provides accelerated stamp earning and higher coupon values.',
            'VIP membership is billed monthly via Stripe.',
            'If you cancel VIP, any earned but unredeemed coupons issued under your VIP membership are forfeited.',
            'There is no pause option for VIP membership.',
          ]} />
        </Section>

        <Section title="8. SMS Communications">
          <Ul items={[
            'By creating an account, you consent to receive SMS messages related to your rewards, sign-in links, and account updates.',
            'You may opt out at any time by replying STOP to any SMS message.',
            'Opting out of SMS does not affect your ability to earn stamps or redeem coupons. However, you will no longer receive sign-in links via text and must contact support to access your account.',
            'Message and data rates may apply.',
          ]} />
        </Section>

        <Section title="9. Account Suspension and Termination">
          <Ul items={[
            'BinPerks will issue a warning before suspending or terminating your account, except in cases of egregious violations as determined under applicable Florida law.',
            'Grounds for termination include but are not limited to: fraud, abuse of the rewards system, providing false information, or harassment of store staff.',
            'Blacklisted accounts cannot be reinstated.',
            'You may not delete your own account or request deletion of your data.',
          ]} />
        </Section>

        <Section title="10. Store Closures and Merchant Departures">
          <Ul items={[
            'If your home store closes or the merchant ends their BinPerks subscription, your account and accumulated stamps are not transferable to another store.',
            'You would need to create a new account at a new participating store location.',
            'BinPerks is not responsible for a merchant\'s decision to leave the platform.',
          ]} />
        </Section>

        <Section title="11. Privacy">
          <Ul items={[
            'BinPerks collects your name, phone number, and email address to operate your rewards account.',
            'Your data is never sold to third parties.',
            'SMS messages are delivered via GoHighLevel/Twilio using the BinPerks phone number.',
          ]} />
          <P className="mt-2">Please review our <Link href="/terms/privacy" className="text-[#4A4B98] font-semibold underline">Privacy Policy</Link> for full details.</P>
        </Section>

        <Section title="12. Disputes">
          <Ul items={[
            'If you believe stamps or coupons were lost due to a system error, contact support@binperks.com within 30 days.',
            'BinPerks will review your claim within 3 business days.',
            'If your dispute involves a merchant refusing to honor a coupon, BinPerks will notify the merchant and give them 5 business days to resolve it. If unresolved, BinPerks may issue a courtesy credit at its sole discretion.',
          ]} />
        </Section>

        <Section title="13. Changes to These Terms">
          <P>BinPerks will provide at least 90 days notice before making material changes to these terms, including changes to pricing, tier structure, or coupon values. Notice will be sent via SMS.</P>
        </Section>

        <Section title="14. Governing Law">
          <P>These terms are governed by the laws of the State of Florida. Any disputes shall be resolved in a court of competent jurisdiction in Hillsborough County, Florida.</P>
        </Section>

        <Section title="15. Contact">
          <P>BinPerks LLC<br />9110 Oak Pride Ct, Tampa, FL 33647<br /><a href="mailto:support@binperks.com" className="text-[#4A4B98] underline font-semibold">support@binperks.com</a></P>
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
