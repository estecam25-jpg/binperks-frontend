'use client'

/**
 * Merchant Participation Agreement — Version 3.4A.
 *
 * Content mirrors D:\BinPerks\BinPerks_Merchant_Agreement_v34A.md. Three parts
 * of the source are execution artefacts rather than agreement terms and are
 * handled differently here:
 *
 *   - The [MERCHANT LEGAL NAME] / [DBA/STORE NAME] placeholders in PARTIES are
 *     filled per merchant on the executed DocuSeal copy. Rendering the raw
 *     brackets on a public page would just look broken, so the parties clause
 *     describes them instead.
 *   - The blank signature block is omitted; this page is the reference copy,
 *     not the instrument. The E-SIGN paragraph is kept because it is
 *     substantive.
 *   - The "DRAFT FOR ATTORNEY REVIEW — NOT FOR EXECUTION" footer is a
 *     document-workflow marker and is not rendered.
 *
 * The source carries an unfilled "Effective Date: [DATE]". Rather than invent
 * one, the header shows the version and the Last Updated value the document
 * actually states. Fill the real effective date here once it is set.
 */

import Link from 'next/link'

export default function MerchantTermsPage() {
  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">

      {/* Header */}
      <div className="bg-[#4A4B98] px-6 pt-10 pb-8 flex flex-col items-center gap-1 text-center">
        <Link href="/" className="font-['Coiny'] text-4xl text-white leading-none tracking-wide">BinPerks</Link>
        <h1 className="font-['Coiny'] text-2xl text-white/90 mt-1">Merchant Participation Agreement</h1>
        <p className="text-[12px] text-white/60 font-medium mt-1">Version 3.4A · Last updated August 2026 · BinPerks LLC · Tampa, FL</p>
        <a href="mailto:support@binperks.com" className="text-[12px] text-white/70 font-semibold underline mt-0.5">support@binperks.com</a>
      </div>

      <main className="flex-1 max-w-2xl mx-auto w-full px-5 py-8 flex flex-col gap-6">

        <Section title="Parties">
          <P>This Merchant Participation Agreement (&quot;Agreement&quot;) is entered into between <B>BinPerks LLC</B>, a Florida limited liability company (&quot;BinPerks&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;), with its principal place of business at 9110 Oak Pride Ct, Tampa, FL 33647, and the participating merchant (&quot;Merchant&quot;, &quot;you&quot;, or &quot;your&quot;), whose legal business name and trade name are identified on the executed copy of this Agreement.</P>
        </Section>

        <Section title="1. What BinPerks Is">
          <P>BinPerks is a branded membership network for liquidation shoppers. BinPerks owns and operates the platform, maintains the direct membership relationship with members, and controls access to the BinPerks member database and proprietary platform and derived data, subject to applicable privacy law and the BinPerks Privacy Policy.</P>
          <P>By participating in the BinPerks network, the Merchant gains access to BinPerks&apos; membership infrastructure, loyalty tools, automated marketing, referral system, review automation, and monthly commission opportunities — in exchange for a recurring participation fee.</P>
        </Section>

        <Section title="2. Independent Business Relationship">
          <P><B>2.1 No Franchise.</B> This Agreement is a services and network participation agreement, not a franchise agreement. Nothing in this Agreement creates a franchise, joint venture, partnership, agency, or employment relationship between BinPerks and the Merchant.</P>
          <P><B>2.2 Merchant Independence.</B> The Merchant independently owns and operates its retail business and independently controls all of the following without direction from BinPerks:</P>
          <Ul items={[
            'Inventory selection, sourcing, and pricing',
            'Staffing, wages, hours, and employment policies',
            'Suppliers, freight, and purchasing decisions',
            'Accounting, point-of-sale systems, and financial management',
            'Advertising and marketing outside the BinPerks platform',
            'Store policies, store layout, and customer service practices',
            'All general retail business operations',
          ]} />
          <P><B>2.3 BinPerks Network Standards.</B> BinPerks&apos; contractual control under this Agreement is limited to the operation and protection of the BinPerks membership network, including:</P>
          <Ul items={[
            'The BinPerks technology platform, loyalty rules, and stamp system',
            'Network coupon rules and cross-network coupon settlement',
            'Settlement mechanics and commission eligibility determinations',
            'Member communications conducted through the BinPerks platform',
            'Reasonable standards necessary to protect BinPerks members and the integrity of the network',
          ]} />
          <P>BinPerks&apos; contractual control does not extend to the Merchant&apos;s general retail operations.</P>
        </Section>

        <Section title="3. Membership Relationship and Data">
          <P><B>3.1</B> All BinPerks memberships belong to BinPerks LLC, not to the Merchant.</P>
          <P><B>3.2</B> Members join BinPerks through the Merchant&apos;s enrollment channels (QR codes, referral links, in-store signage). The Merchant that originally enrolls a member is permanently recorded as that member&apos;s <B>Origin Store</B>.</P>
          <P><B>3.3</B> BinPerks maintains the direct membership relationship and controls access to the BinPerks member database. BinPerks retains membership and platform records in accordance with the Privacy Policy, applicable law, legitimate business requirements, and valid privacy requests.</P>
          <P><B>3.4</B> The Merchant is granted access to the BinPerks platform and member information only as described in Section 10 (Data Access and Permissions) while their subscription remains active.</P>
          <P><B>3.5</B> The Merchant may not export, download, copy, or transmit member contact information or membership data for use outside the BinPerks platform, subject to the ordinary-course records exception in Section 10.5.</P>
          <P><B>3.6</B> The Merchant acquires no ownership rights in member personal information through participation in the BinPerks network.</P>
          <P><B>3.7</B> Upon cancellation, the Merchant loses access to the BinPerks platform and member engagement tools. BinPerks retains membership and platform records in accordance with the Privacy Policy, applicable law, legitimate business requirements, and valid privacy requests.</P>
        </Section>

        <Section title="4. Origin Store Attribution">
          <P><B>4.1</B> The Merchant location that originally enrolls a BinPerks member is permanently recorded as that member&apos;s <B>Origin Store</B>. This attribution is permanent and never changes based on where the member shops, how frequently they visit other locations, member preference, or any other factor.</P>
          <P><B>4.2</B> Origin Store attribution is an internal BinPerks acquisition record. It determines Merchant Commission eligibility as described in Section 5. It does not limit where members may shop, earn stamps, or redeem coupons.</P>
          <P><B>4.3</B> Enrollment through valid BinPerks enrollment paths (QR codes, referral links, marketing materials) may continue even while a Merchant account is inactive. Members enrolled during inactivity remain permanently attributed to the Merchant as their Origin Store.</P>
        </Section>

        <Section title="5. Merchant Commission">
          <Sub>5.1 Commission Eligibility</Sub>
          <P>While the Merchant account remains active and in good standing, the Merchant is eligible to receive a <B>Merchant Commission of $19.99</B> for each successfully collected full-price VIP membership payment ($29.99/month) from members whose Origin Store is attributed to the Merchant.</P>
          <Sub>5.2 Allocation of Member Payments</Sub>
          <P>Each collected $29.99 VIP membership payment is allocated as follows:</P>
          <Ul items={[
            'When the Origin Merchant is eligible: $19.99 constitutes the Merchant Commission payable to the eligible Origin Merchant, and $10.00 remains BinPerks platform revenue.',
            'When the Origin Merchant is ineligible: No Merchant Commission accrues. The full $29.99 membership payment remains BinPerks revenue.',
          ]} />
          <P>Member VIP payments are payments to BinPerks LLC for BinPerks network memberships. They are not received by BinPerks on the Merchant&apos;s behalf, are not held in trust or escrow for the Merchant, and do not give the Merchant any ownership interest in those payments. Merchant Commissions are separate contractual compensation payable by BinPerks from BinPerks&apos; own revenue.</P>
          <Sub>5.3 No Commission During Inactivity</Sub>
          <P>No Merchant Commission accrues during any period in which the Merchant account is inactive, cancelled, suspended, or otherwise ineligible. During such periods, BinPerks retains the membership payment as its own revenue. Commissions are not held in reserve, transferred to another merchant, or paid retroactively upon reactivation.</P>
          <Sub>5.4 Commission Resumption</Sub>
          <P>When the same Merchant reactivates, Merchant Commission eligibility resumes from the official reactivation date. No Merchant Commission accrues for the inactive period regardless of when reactivation occurs.</P>
        </Section>

        <Section title="6. Monthly Settlement">
          <Sub>6.1 Settlement Model</Sub>
          <P>BinPerks is the merchant of record for all member VIP subscription payments. Member VIP payments are charged by BinPerks as merchant of record for BinPerks memberships. A Merchant&apos;s right to compensation arises solely under the Merchant Commission provisions of this Agreement and not through any ownership interest in a member payment.</P>
          <Sub>6.2 Net Monthly Distribution Formula</Sub>
          <P>Each eligible Merchant&apos;s monthly net distribution is calculated as:</P>
          <Formula lines={[
            'Merchant Commissions earned',
            '− Coupon debits (face value of valid coupons funded by this Merchant for its originated members redeemed at other participating locations, as described in Exhibit A)',
            '+ Coupon credits (face value of valid coupons honored by this Merchant for members originated by other merchants)',
            '− Reversed or unearned commissions (commissions associated with reversed, refunded, or charged-back member payments)',
            '− Other approved adjustments',
            '= Net monthly distribution',
          ]} />
          <Sub>6.3 Payment Processor Costs</Sub>
          <P>Payment processor dispute fees associated with member VIP subscription payments are BinPerks operating expenses and are not charged to the Merchant, except where a dispute arises directly from Merchant fraud or misconduct.</P>
          <Sub>6.4 Admin Approval Required</Sub>
          <P>Monthly distributions require explicit approval by a BinPerks administrator before any transfer is initiated. No automatic transfers occur.</P>
          <Sub>6.5 Stripe Connect Transfers</Sub>
          <P>Distributions are made via separate Stripe Connect transfers to the Merchant&apos;s connected bank account. BinPerks collects member payments into BinPerks&apos; platform account and initiates separate transfers to Merchant connected accounts following monthly settlement approval. The Merchant is responsible for maintaining a valid, verified Stripe Connect payout account in good standing.</P>
          <Sub>6.6 Negative Balances</Sub>
          <P>If the Merchant&apos;s net monthly distribution is negative, the negative balance is carried forward to the next settlement period. BinPerks does not issue negative payouts.</P>
          <P>If the Merchant cancels while carrying a negative balance, BinPerks will seek to recover the outstanding amount from the Merchant. The Merchant hereby authorizes BinPerks to charge the payment method on file for amounts properly due under this Section 6.6, subject to applicable payment-network rules and applicable law. Unresolved negative balances must be satisfied before reactivation is approved.</P>
          <Sub>6.7 Post-Termination Settlement</Sub>
          <P>Termination of this Agreement does not extinguish settlement obligations arising from activity before the termination date. Refunds, reversals, chargebacks, settlement corrections, and other valid adjustments relating to pre-termination periods may be reconciled after termination. Outstanding amounts properly owed by either party as of termination, or arising from pre-termination activity, survive termination and remain due and payable.</P>
        </Section>

        <Section title="7. Pricing and Billing">
          <Sub>7.1 Implementation &amp; Launch Fee</Sub>
          <P>The first billing cycle for the Merchant&apos;s first location is <B>$299.99</B>, covering platform setup, onboarding, and launch support. This fee replaces the first month&apos;s platform subscription fee for the first location.</P>
          <Sub>7.2 Platform Subscription</Sub>
          <P>Beginning with the second billing cycle, the Merchant is billed <B>$99.00 per month</B> for the first location.</P>
          <Sub>7.3 Additional Locations</Sub>
          <P>Each additional active location is billed at <B>$49.99 per month</B>, beginning with the first billing cycle.</P>
          <Sub>7.4 FOUNDING100 Promotion</Sub>
          <P>The first 100 activated Merchants may apply the promotional code <B>FOUNDING100</B> to waive the $299.99 Implementation &amp; Launch fee. The promotional code does not apply to platform subscription fees or additional location fees. The promotion expires December 31, 2026.</P>
          <Sub>7.5 Billing Authorization</Sub>
          <P>All fees are billed automatically via Stripe. The Merchant authorizes BinPerks to charge the payment method on file on a recurring monthly basis for platform fees described in this Section 7, and for amounts due under Section 6.6 (Negative Balances) as provided therein.</P>
          <Sub>7.6 Failed Payments</Sub>
          <P>If a payment fails, the Merchant enters a grace period while Stripe retries the payment according to Stripe&apos;s configured retry schedule. If payment is not recovered after the grace period, the Merchant&apos;s account becomes inactive and Merchant Commission eligibility is suspended.</P>
          <Sub>7.7 Merchant Subscription Disputes</Sub>
          <P>If a Merchant initiates a payment dispute on their own BinPerks platform subscription payment, BinPerks reserves the right to immediately suspend the Merchant&apos;s account pending resolution.</P>
        </Section>

        <Section title="8. Material Changes to Financial Terms">
          <P><B>8.1</B> BinPerks may update platform policies and non-financial terms with 30 days written notice to the Merchant&apos;s email address on file. Continued use of the platform after the notice period constitutes acceptance.</P>
          <P><B>8.2</B> Material changes to any of the following require advance written notice and an opportunity for the Merchant to cancel before the change takes effect:</P>
          <Ul items={[
            'Merchant subscription fees (Sections 7.1, 7.2, 7.3)',
            'Merchant Commission amount (Section 5.1)',
            'Coupon face values (Exhibit A)',
            'Stamp-to-coupon threshold (Exhibit A)',
            'Stamp multipliers (Exhibit A)',
            'Membership tier qualification thresholds (Exhibit A)',
            'Other reward mechanics that materially affect coupon-generation frequency or Merchant coupon liability',
            "Other material changes to the Merchant's financial obligations under this Agreement",
          ]} />
          <P><B>8.3</B> Notice of material financial changes will be delivered to the Merchant&apos;s email address on file. The Merchant may cancel their subscription without penalty during the notice period if they do not accept the change. After the notice period expires, continued use of the platform constitutes acceptance.</P>
        </Section>

        <Section title="9. Stripe Connect and Payout Account">
          <P><B>9.1</B> To receive monthly Merchant Commission distributions, the Merchant must maintain a valid Stripe Connect Express account connected to the BinPerks platform.</P>
          <P><B>9.2</B> The Merchant is responsible for completing and maintaining Stripe&apos;s identity verification and bank account requirements. The Merchant&apos;s use of Stripe Connect is subject to Stripe&apos;s Connected Account Agreement in addition to this Agreement.</P>
          <P><B>9.3</B> BinPerks is not responsible for delays or failures in payout delivery caused by the Merchant&apos;s failure to maintain a valid, verified Stripe Connect account.</P>
          <P><B>9.4</B> If the Merchant&apos;s Stripe Connect account becomes restricted or payouts are disabled, payment of an otherwise payable Net Monthly Distribution will be deferred while the Merchant lacks an eligible payout account. If the Merchant remains unable to receive payment for an extended period, BinPerks will handle any unpaid distribution in accordance with applicable law, including applicable unclaimed-property requirements.</P>
          <P><B>9.5</B> In the event of a conflict between this Agreement and Stripe&apos;s requirements with respect to payment processing, Stripe&apos;s requirements govern.</P>
        </Section>

        <Section title="10. Data Access and Permissions">
          <Sub>10.1 Serving Merchant / Cashier Access</Sub>
          <P>When serving a BinPerks member at a participating location, the Merchant&apos;s cashier staff may access only the minimum information necessary to:</P>
          <Ul items={[
            'Identify the member by name',
            "Determine the member's tier and stamp status",
            'Award a valid stamp',
            'Verify and redeem an available coupon',
          ]} />
          <Sub>10.2 Origin Merchant Reporting Access</Sub>
          <P>The Origin Merchant may access through the BinPerks merchant dashboard:</P>
          <Ul items={[
            'A list of members attributed to the Merchant as their Origin Store, including name, tier, total stamps, and join date',
            'Commission and settlement reporting for originated members',
            'Coupon settlement credits and debits',
          ]} />
          <P>The Origin Merchant may not access member phone numbers, email addresses, raw contact exports, or member activity history at other merchants&apos; locations.</P>
          <Sub>10.3 Location Visit Reporting</Sub>
          <P>A Merchant whose location was visited may access operational reporting about stamp and coupon activity that occurred at its own location. This reporting does not include the member&apos;s activity history at other merchants&apos; locations.</P>
          <Sub>10.4 No Exportable Member Database</Sub>
          <P>No Merchant receives the ability to export, download, or otherwise obtain a portable database of member contact information. Participation in the BinPerks network does not give any Merchant a portable member or contact database.</P>
          <Sub>10.5 Ordinary-Course Merchant Records Exception</Sub>
          <P>Nothing in this Agreement prohibits the Merchant from maintaining its own ordinary-course business records, including receipts, accounting records, tax records, transaction records, and records of coupons and stamps processed at the Merchant&apos;s own locations, where reasonably necessary to operate the Merchant&apos;s business or comply with applicable law. This exception does not permit the Merchant to:</P>
          <Ul items={[
            'Obtain member phone numbers or email addresses from BinPerks',
            'Create or export a BinPerks member database',
            'Use BinPerks member information for independent marketing purposes',
            'Obtain cross-merchant activity history',
          ]} />
          <Sub>10.6 BinPerks Admin</Sub>
          <P>BinPerks administrators may access network-wide information according to administrative permissions.</P>
        </Section>

        <Section title="11. Merchant Tax Obligations">
          <P><B>11.1</B> The Merchant is solely responsible for all federal, state, and local taxes arising from Merchant Commissions, Net Monthly Distributions, and any other compensation received under this Agreement.</P>
          <P><B>11.2</B> The Merchant agrees to provide BinPerks with accurate taxpayer identification information upon request, including a completed IRS Form W-9 or equivalent.</P>
          <P><B>11.3</B> BinPerks may report payments to applicable tax authorities and issue tax forms (including informational returns) as required by applicable law. BinPerks may withhold amounts from distributions when required by applicable law.</P>
          <P><B>11.4</B> The Merchant acknowledges that BinPerks has not provided tax advice, and the Merchant should consult its own tax advisor regarding the tax treatment of amounts received under this Agreement.</P>
        </Section>

        <Section title="12. Reactivation">
          <P><B>12.1</B> Reactivation within 90 days of deactivation: no reactivation fee; recurring platform billing resumes.</P>
          <P><B>12.2</B> Reactivation after 90 days: <B>$200.00 Reactivation &amp; Relaunch fee</B> plus resumption of recurring platform charges.</P>
          <P><B>12.3</B> More than one reactivation within any rolling 12-month period: <B>$200.00 Reactivation &amp; Relaunch fee</B>, regardless of time since last deactivation.</P>
          <P><B>12.4</B> New owner, new legal entity, transferred business, or materially rebuilt account: full <B>$299.99 Implementation &amp; Launch fee</B>.</P>
          <P><B>12.5</B> Reactivation is subject to BinPerks review and approval, including verification of payment status, Stripe Connect eligibility, compliance information, and platform requirements. Any outstanding negative settlement balance must be resolved before reactivation is approved.</P>
        </Section>

        <Section title="13. Cross-Network Coupons">
          <P><B>13.1</B> BinPerks coupons are valid at any participating BinPerks location, not just the member&apos;s Origin Store.</P>
          <P><B>13.2</B> When the Merchant honors a coupon for a member whose Origin Store is a different merchant, the Merchant receives a coupon credit equal to the face value of the coupon honored, as recorded in the BinPerks settlement ledger.</P>
          <P><B>13.3</B> When a member attributed to the Merchant redeems a coupon at a different participating location, the Merchant is charged a coupon debit equal to the face value of the coupon redeemed, as recorded in the BinPerks settlement ledger.</P>
          <P><B>13.4</B> If the Origin Store is inactive, BinPerks funds the coupon liability. The inactive merchant is not charged a coupon debit.</P>
          <P><B>13.5</B> The coupon face values that generate settlement credits and debits are set forth in Exhibit A. The Merchant acknowledges that its participation in the cross-network coupon settlement is based on the current reward economics described in Exhibit A, subject to material change notice as provided in Section 8.</P>
        </Section>

        <Section title="14. Merchant Obligations">
          <P><B>14.1</B> The Merchant agrees to:</P>
          <Ul items={[
            'Honor all valid BinPerks coupons presented by BinPerks members at their location(s)',
            'Train staff on the BinPerks stamp tool and cashier procedures',
            'Maintain accurate store information in the BinPerks merchant dashboard',
            'Maintain a connected and verified Stripe payout account',
            'Comply with all BinPerks network standards as described in Section 2.3',
            'Provide taxpayer identification information as described in Section 11',
            "Not operate in any business category restricted under Stripe's restricted business policies",
          ]} />
          <P><B>14.2</B> The Merchant agrees not to:</P>
          <Ul items={[
            'Export or copy member data from the BinPerks platform except as permitted under Section 10.5',
            'Use member data for any purpose outside the BinPerks platform',
            'Create competing loyalty programs using BinPerks member data',
            'Misrepresent BinPerks membership terms to members or prospective members',
            'Manipulate stamp awards, coupon redemptions, or referral systems',
            'Process fraudulent transactions through the BinPerks platform',
          ]} />
        </Section>

        <Section title="15. Intellectual Property and Branding">
          <P><B>15.1</B> BinPerks grants the Merchant a limited, non-exclusive, non-transferable, revocable license to display BinPerks-provided branding materials and promote BinPerks membership to their customers during the term of this Agreement and solely for the purpose of participating in the BinPerks network.</P>
          <P><B>15.2</B> The Merchant may customize their BinPerks experience with their own logo, brand colors, and store information within the limits of the BinPerks platform.</P>
          <P><B>15.3</B> The BinPerks name, logo, trademarks, platform, and all associated intellectual property remain the exclusive property of BinPerks LLC. The Merchant acquires no ownership interest in BinPerks intellectual property through this Agreement.</P>
          <P><B>15.4</B> The Merchant may not use BinPerks branding in any manner that implies ownership of the BinPerks platform or membership database, or in any manner not expressly authorized by this Agreement.</P>
          <P><B>15.5</B> The trademark license granted in Section 15.1 terminates automatically upon termination or expiration of this Agreement.</P>
        </Section>

        <Section title="16. Regulatory Compliance">
          <P>Each party shall comply with all applicable federal, state, and local laws in connection with this Agreement. BinPerks may modify its payment collection or distribution procedures when reasonably necessary for legal, regulatory, payment-network, or payment-processor compliance, provided that BinPerks will use reasonable efforts to notify affected Merchants in advance of material changes.</P>
        </Section>

        <Section title="17. Termination">
          <Sub>17.1 By Merchant</Sub>
          <P>The Merchant may cancel their BinPerks subscription at any time through the merchant dashboard or by contacting support@binperks.com. Cancellation takes effect at the end of the current billing cycle. No refunds are issued for partial months.</P>
          <Sub>17.2 By BinPerks</Sub>
          <P>BinPerks may suspend or terminate the Merchant&apos;s account for:</P>
          <Ul items={[
            'Non-payment or repeated payment failures after the grace period',
            'Violation of this Agreement',
            'Fraud, abuse, or misuse of the platform',
            'Failure to honor valid BinPerks coupons',
            'Operating in a Stripe-restricted business category',
            'Any conduct that BinPerks determines is harmful to the network, its members, or its payment processing relationships',
          ]} />
          <Sub>17.3 Effect of Termination</Sub>
          <P>Upon termination:</P>
          <Ul items={[
            'The Merchant loses access to the BinPerks platform',
            'Origin Store attribution records are preserved permanently',
            'BinPerks retains membership and platform records in accordance with the Privacy Policy, applicable law, legitimate business requirements, and valid privacy requests',
            'Any outstanding negative balance remains due and payable',
            'Post-termination settlement rights and obligations are governed by Section 6.7',
          ]} />
          <Sub>17.4 Survival</Sub>
          <P>The following provisions survive termination of this Agreement: Section 3 (Membership Relationship and Data), Section 5.2 (Allocation of Member Payments — as to pre-termination periods), Section 6.7 (Post-Termination Settlement), Section 10.5 (Ordinary-Course Merchant Records Exception), Section 11 (Merchant Tax Obligations), Section 15.3 and 15.4 (Intellectual Property), Section 18 (Limitation of Liability), Section 19 (Indemnification), Section 20 (Governing Law and Dispute Resolution), and any payment obligations outstanding as of termination.</P>
        </Section>

        <Section title="18. Limitation of Liability">
          <P><B>18.1</B> BinPerks provides the platform &quot;as is&quot; and does not guarantee uninterrupted service, specific revenue outcomes, or minimum member enrollment numbers.</P>
          <P><B>18.2</B> BinPerks&apos; total liability to the Merchant for any claim arising under this Agreement shall not exceed the total platform fees paid by the Merchant in the three months preceding the claim.</P>
          <P><B>18.3</B> BinPerks is not liable for indirect, incidental, consequential, or punitive damages.</P>
          <P><B>18.4</B> BinPerks is not liable for losses caused by Stripe service disruptions, Stripe account restrictions, payment network outages, or changes to Stripe&apos;s terms or policies.</P>
          <P><B>18.5</B> The Merchant acknowledges that monthly Merchant Commission distributions depend on member VIP payment collection, settlement calculations, coupon activity, and BinPerks administrator approval — none of which BinPerks guarantees at any specific amount or timing.</P>
        </Section>

        <Section title="19. Indemnification">
          <P><B>19.1</B> The Merchant agrees to indemnify and hold harmless BinPerks LLC, its officers, directors, employees, and agents from any claims, damages, or expenses arising from:</P>
          <Ul items={[
            "The Merchant's violation of this Agreement",
            "The Merchant's unauthorized use or misuse of member data",
            "The Merchant's failure to honor valid BinPerks coupons",
            'Any misrepresentation made by the Merchant to members or prospective members',
            "The Merchant's operation in a Stripe-restricted business category",
            "Fraud or payment disputes arising from the Merchant's own conduct",
          ]} />
          <P><B>19.2</B> Payment processor dispute fees on member VIP subscription payments are BinPerks&apos; operating responsibility as described in Section 6.3 and are not subject to Merchant indemnification, except where the dispute arises from Merchant fraud or misconduct.</P>
        </Section>

        <Section title="20. Governing Law and Dispute Resolution">
          <P><B>20.1</B> This Agreement is governed by the laws of the State of Florida, without regard to conflict of law principles.</P>
          <P><B>20.2</B> Any disputes arising under this Agreement shall be resolved in the state or federal courts located in Hillsborough County, Florida.</P>
          <P><B>20.3</B> The prevailing party in any dispute shall be entitled to recover reasonable attorney&apos;s fees and costs.</P>
        </Section>

        <Section title="21. General Provisions">
          <Sub>21.1 Entire Agreement</Sub>
          <P>This Agreement, together with Exhibit A (Rewards and Coupon Schedule) and any merchant network policies expressly incorporated by reference, constitutes the entire agreement between the parties regarding the subject matter herein. The BinPerks Privacy Policy governs the processing of personal information in connection with this Agreement. The BinPerks Member Terms of Service govern the relationship between BinPerks and its members; the Merchant is not a party to the Member Terms of Service. The Merchant&apos;s use of Stripe Connect is additionally subject to Stripe&apos;s Connected Account Agreement.</P>
          <Sub>21.2 Severability</Sub>
          <P>If any provision of this Agreement is found unenforceable, the remaining provisions continue in full force.</P>
          <Sub>21.3 No Waiver</Sub>
          <P>Failure by BinPerks to enforce any provision of this Agreement does not constitute a waiver of that provision.</P>
        </Section>

        <Section title="Exhibit A — Rewards and Coupon Schedule">
          <P className="italic text-[#8E8EA8]">This Exhibit is incorporated into and made part of the Merchant Participation Agreement. All items in this Exhibit are subject to material change notice as provided in Section 8 of the Agreement.</P>
          <Sub>Member Tiers and Coupon Values</Sub>
          <Table
            headers={['Tier', 'Eligibility', 'Coupon Value', 'Stamp Multiplier']}
            rows={[
              ['Starter',     'Free membership',                         '$5.00',  '1x per qualifying visit'],
              ['Bronze VIP',  'VIP subscriber, 0–199 lifetime stamps',   '$7.00',  '2x per qualifying visit'],
              ['Silver VIP',  'VIP subscriber, 200–749 lifetime stamps', '$10.00', '3x per qualifying visit'],
              ['Gold VIP',    'VIP subscriber, 750–1,999 lifetime stamps', '$12.00', '4x per qualifying visit'],
              ['Diamond VIP', 'VIP subscriber, 2,000+ lifetime stamps',  '$15.00', '5x per qualifying visit'],
            ]}
          />
          <Sub>Coupon Earning Rule</Sub>
          <P>A member earns one coupon each time they accumulate 20 effective stamps. Effective stamps reflect the member&apos;s tier multiplier applied to each qualifying visit. One qualifying visit per participating location per day.</P>
          <Sub>Starter Lifetime Coupon Limit</Sub>
          <P>Starter members earn one lifetime coupon. After that coupon is redeemed, stamp earning pauses until the member upgrades to VIP.</P>
          <Sub>Cross-Network Coupon Settlement</Sub>
          <Ul items={[
            'Coupon debit: When a member attributed to the Merchant redeems a valid BinPerks coupon at a different participating location, the Merchant is charged the face value of that coupon as a debit in the monthly settlement ledger.',
            'Coupon credit: When the Merchant honors a valid BinPerks coupon for a member attributed to a different merchant, the Merchant receives the face value of that coupon as a credit in the monthly settlement ledger.',
            'Coupon debits and credits are based on the actual face value of the valid coupon as recorded in the BinPerks system at the time of redemption.',
            'If the Origin Merchant is inactive at the time of redemption, BinPerks funds the coupon liability and no debit is charged to the inactive merchant.',
          ]} />
        </Section>

        <Section title="Execution">
          <P>This agreement is executed electronically via DocuSeal. Electronic signatures are legally binding under the Electronic Signatures in Global and National Commerce Act (E-SIGN) and the Florida Electronic Signature Act.</P>
        </Section>

        <Section title="Contact">
          <P>BinPerks LLC<br />9110 Oak Pride Ct, Tampa, FL 33647<br /><a href="mailto:support@binperks.com" className="text-[#4A4B98] underline font-semibold">support@binperks.com</a><br />binperks.com</P>
        </Section>

        <div className="pt-4 border-t border-[#EBEBF2] flex flex-col gap-1.5 text-center">
          <Link href="/terms/member" className="text-[13px] font-semibold text-[#4A4B98] underline">Member Terms</Link>
          <Link href="/terms/privacy" className="text-[13px] font-semibold text-[#4A4B98] underline">Privacy Policy</Link>
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

/** The settlement formula — kept as a block quote so the leading operators
 *  line up and read as arithmetic rather than as a bullet list. */
function Formula({ lines }: { lines: string[] }) {
  return (
    <div className="rounded-xl bg-[#F5F5F8] border-l-[3px] border-[#4A4B98] px-4 py-3 flex flex-col gap-1">
      {lines.map((line, i) => (
        <p
          key={i}
          className={`text-[12px] leading-relaxed ${
            i === lines.length - 1
              ? 'font-extrabold text-[#1A1A2E] pt-1 border-t border-[#EBEBF2] mt-1'
              : 'font-medium text-[#1A1A2E]'
          }`}
        >
          {line}
        </p>
      ))}
    </div>
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
