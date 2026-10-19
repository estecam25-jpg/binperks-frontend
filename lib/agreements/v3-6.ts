/**
 * Merchant Participation and Platform Agreement V3.6 — the in-app source.
 *
 * GENERATED. Do not edit by hand: run
 *   node scripts/build-agreement-source.mjs
 * which lifts the wording from legal/BinPerks_Merchant_Agreement_V3.6.docx
 * verbatim and applies only the documented substitutions.
 *
 * The {{TOKENS}} are filled per merchant at render time (lib/agreements), and
 * { k: 'accept' } is where the acceptance block is drawn — replacing the two
 * handwritten signature blocks and the BinPerks cursive signature.
 *
 * ACCEPTED TEXT IS PINNED BY HASH. Every acceptance stores the SHA-256 of the
 * exact rendered text, so changing this file does not quietly rewrite what a
 * merchant already agreed to — it makes the difference detectable. A reworded
 * agreement is a NEW VERSION with a new id, never an edit to this one.
 */

import type { AgreementBlock } from './types'

export const V3_6_VERSION = 'V3.6'

export const V3_6_BLOCKS: AgreementBlock[] = [
  {
    "k": "p",
    "t": "BINPERKS LLC"
  },
  {
    "k": "p",
    "t": "MERCHANT PARTICIPATION AND PLATFORM AGREEMENT"
  },
  {
    "k": "p",
    "t": "Membership Revenue Share | Loyalty Platform | Merchant Participation"
  },
  {
    "k": "p",
    "t": "Between BinPerks LLC, a Florida Limited Liability Company, doing business as BinPerks (\"BinPerks\")"
  },
  {
    "k": "p",
    "t": "and {{MERCHANT_LEGAL_NAME}} (\"Merchant\")"
  },
  {
    "k": "p",
    "t": "Effective Date: {{EFFECTIVE_DATE}}"
  },
  {
    "k": "p",
    "t": "BinPerks Legal Notice Address: 9110 Oak Pride Ct, Tampa, FL 33647"
  },
  {
    "k": "p",
    "t": "BinPerks Legal Notice Email: ENina@BinPerks.com"
  },
  {
    "k": "p",
    "t": ""
  },
  {
    "k": "h",
    "t": "BINPERKS MERCHANT PARTICIPATION AND PLATFORM AGREEMENT"
  },
  {
    "k": "p",
    "t": "This Merchant Participation and Platform Agreement (the \"Agreement\") is entered into as of the Effective Date stated in the applicable Order Form by and between BinPerks LLC, a Florida Limited Liability Company, doing business as BinPerks (\"BinPerks\"), and the merchant identified in the Order Form (\"Merchant\"). BinPerks and Merchant may each be a \"Party\" and together the \"Parties.\""
  },
  {
    "k": "p",
    "t": "Merchant operates one or more independently owned retail locations. BinPerks operates a consumer membership, loyalty, communications, and merchant-participation platform. Merchant desires to participate in the BinPerks network, offer merchant-funded benefits to eligible members, and receive participation compensation calculated under this Agreement. The Parties therefore agree as follows:"
  },
  {
    "k": "h",
    "t": "1. DEFINITIONS"
  },
  {
    "k": "p",
    "t": "1.1 Activated Merchant. A Merchant whose account has completed onboarding, has an active payment method for Platform Fees, has a compliant Connected Account, has at least one approved active Location, and has been enabled by BinPerks for live member participation."
  },
  {
    "k": "p",
    "t": "1.2 Attributed Member. A paid BinPerks member whose Origin Merchant attribution record in the Platform is assigned to Merchant at the time the applicable Membership Payment is successfully collected."
  },
  {
    "k": "p",
    "t": "1.3 Base Membership Fee. The recurring consumer price for the paid BinPerks membership, initially $29.99 per month unless changed in accordance with this Agreement and the Member Terms."
  },
  {
    "k": "p",
    "t": "1.4 BinPerks Marks. The BinPerks name, logos, trade dress, program names, badges, graphics, slogans, and other source identifiers supplied by BinPerks."
  },
  {
    "k": "p",
    "t": "1.5 Connected Account. Merchant's account with Stripe Connect or another payment provider designated by BinPerks to receive Merchant Share payments and complete identity, tax, compliance, and banking verification."
  },
  {
    "k": "p",
    "t": "1.6 Location. A physical retail location approved by BinPerks and listed in the Order Form or Merchant dashboard."
  },
  {
    "k": "p",
    "t": "1.7 Member. A consumer with a BinPerks account, whether enrolled in a free or paid membership level."
  },
  {
    "k": "p",
    "t": "1.8 Member Terms. The consumer-facing membership terms, privacy notice, recurring billing authorization, program rules, and related policies maintained by BinPerks."
  },
  {
    "k": "p",
    "t": "1.9 Merchant Content. Merchant's names, logos, photographs, offers, perk descriptions, review destination links, store details, announcements, and other materials submitted for display or use through the Platform."
  },
  {
    "k": "p",
    "t": "1.10 Merchant Share. The participation compensation payable by BinPerks to Merchant under Section 5 and the Order Form."
  },
  {
    "k": "p",
    "t": "1.11 Platform. The BinPerks websites, applications, workflows, dashboards, databases, automations, communications tools, loyalty logic, reporting, and related services, whether operated directly or through third-party providers."
  },
  {
    "k": "p",
    "t": "1.12 Platform Fee. The fees Merchant pays to BinPerks for access to and participation in the Platform, consisting of a one-time setup fee of $200.00 due at enrollment and a recurring monthly platform fee of $99.99 per month, unless otherwise stated in the Order Form."
  },
  {
    "k": "p",
    "t": "1.13 Platform Member Data. Member account information, contact information, consent records, membership status, payment-related metadata, store attribution, stamps, visit records, perk records, referral records, review-interaction records, engagement data, and other information created, collected, organized, or derived through the Platform."
  },
  {
    "k": "p",
    "t": "1.14 Required Coupon Benefits. The specific coupon benefits Merchant agrees to honor as a condition of participation, as expressly identified in the applicable Merchant Order Form."
  },
  {
    "k": "p",
    "t": "1.15 Inactive Merchant. A Merchant whose Platform Fee payment has failed and remains unpaid for thirty (30) consecutive days after the failed payment. An Inactive Merchant's Locations may not award stamps through the Platform until Merchant's account is restored to good standing."
  },
  {
    "k": "p",
    "t": "1.16 Origin Merchant. The merchant to which a Member's attribution record in the Platform is assigned, sometimes called the Member's Home Store. A Member's Origin Merchant is initially the merchant through whose Location the Member enrolled and may change only as described in Section 5.6."
  },
  {
    "k": "p",
    "t": "1.17 Reactivation Coupon. A one-time $2.00 coupon that BinPerks may issue to a Member who has not received a stamp at any participating Location for sixty (60) days, as described in Section 6.3.2."
  },
  {
    "k": "h",
    "t": "2. PLATFORM ACCESS AND PARTICIPATION"
  },
  {
    "k": "p",
    "t": "2.1 Access. Subject to this Agreement, BinPerks grants Merchant a limited, nonexclusive, nontransferable, revocable right during the Term to access the merchant-facing portions of the Platform solely for Merchant's approved Locations and authorized personnel."
  },
  {
    "k": "p",
    "t": "2.2 Services. The Platform may include member enrollment, paid membership billing, store attribution, stamp or visit tracking, perk eligibility, referral tracking, review requests, merchant announcements, reporting, location management, and related loyalty and marketing functions. BinPerks may add, remove, or modify nonmaterial features. Material changes that substantially reduce the core paid service will be communicated in advance when reasonably practicable."
  },
  {
    "k": "p",
    "t": "2.3 Independent Businesses. Merchant remains solely responsible for its retail business, products, inventory, pricing, employees, hours, premises, customer service, permits, taxes, and legal compliance. BinPerks does not manage Merchant's store and does not guarantee Merchant's sales, profits, traffic, membership volume, or return on investment."
  },
  {
    "k": "p",
    "t": "2.4 No Franchise or Business Opportunity Intended. The Parties intend a technology and participation-services relationship, not a franchise, partnership, joint venture, employment relationship, or sale of a business opportunity. Merchant receives no right to operate a business under the BinPerks Marks. Merchant may identify itself only as a participating BinPerks merchant and retains full control of its independent retail operations. This Section states the Parties' intent but does not override applicable law."
  },
  {
    "k": "p",
    "t": "2.5 Independent Business Acknowledgment. Merchant acknowledges that participation in BinPerks does not require Merchant to operate its business under a BinPerks business format. Merchant operates an independently established business and uses BinPerks solely as a supplemental membership, loyalty, marketing, and customer-engagement platform. BinPerks does not control Merchant's general retail pricing, inventory, product selection, operating hours, staffing, suppliers, purchasing practices, or other day-to-day business operations. Merchant receives no exclusive territory."
  },
  {
    "k": "h",
    "t": "3. ONBOARDING, LOCATIONS, AND ACCOUNT CONTROL"
  },
  {
    "k": "p",
    "t": "3.1 Onboarding Information. Merchant will provide accurate legal, ownership, tax, banking, contact, Location, and business information and will promptly update changes. BinPerks may require identity verification, beneficial-ownership information, tax forms (including Form W-9), proof of insurance, permits, and other reasonable compliance documentation."
  },
  {
    "k": "p",
    "t": "3.2 Location Approval. Each Location is subject to BinPerks approval. Merchant may not use the Platform for an unapproved location, transfer a Location to another owner, or allow another business to use Merchant's account without BinPerks' prior written approval."
  },
  {
    "k": "p",
    "t": "3.3 Location Status. Merchant may request or use available controls to activate or deactivate individual Locations. An inactive Location may be removed from member-facing discovery, attribution, stamp, and perk tools. If BinPerks deactivates Merchant, BinPerks may deactivate all associated Locations."
  },
  {
    "k": "p",
    "t": "3.4 Credentials and Personnel. Merchant is responsible for all activity under its account and for limiting access to trained, authorized personnel. Merchant will not share credentials outside its organization and will notify BinPerks immediately of suspected unauthorized access."
  },
  {
    "k": "h",
    "t": "4. PLATFORM FEE AND MERCHANT BILLING"
  },
  {
    "k": "p",
    "t": "4.1 Platform Fee. Merchant will pay the Platform Fee stated in the Order Form. The initial standard Platform Fee consists of (a) a one-time setup fee of $200.00 due at enrollment and (b) a recurring monthly platform fee of $99.99 per month for the first Location. Each additional Location is $49.99 per month. Additional implementation, custom work, messaging, or premium-service fees apply only if stated in an Order Form or approved in writing by Merchant. The one-time setup fee is nonrefundable. Additional implementation, custom work, messaging, or premium-service fees apply only if stated in an Order Form or approved in writing by Merchant."
  },
  {
    "k": "p",
    "t": "4.2 Separate Commercial Obligation. The Platform Fee is consideration for technology, platform participation, support, marketing infrastructure, and related services. It is separate from the Member's purchase of a BinPerks membership and separate from the Merchant Share. Merchant is not entitled to offset the Platform Fee against the Merchant Share unless BinPerks expressly enables net settlement or agrees in writing."
  },
  {
    "k": "p",
    "t": "4.3 Automatic Payment. Merchant authorizes BinPerks and its payment processor to charge the payment method on file for all amounts due. Failed payments may result in retries, late fees stated in the Order Form, suspension, or deactivation. If a Platform Fee payment fails and remains unpaid for thirty (30) days, Merchant becomes an Inactive Merchant, and Section 5.6 applies."
  },
  {
    "k": "p",
    "t": "4.4 Promotions. Any free period, reduced fee, \"first merchant\" offer, activation credit, or other promotion applies only if written in the Order Form. Unless the Order Form states otherwise, a promotional fee waiver does not change the Merchant Share and ends immediately if Merchant fails to activate, violates this Agreement, or terminates before satisfying stated promotional conditions."
  },
  {
    "k": "p",
    "t": "4.5 Fee Changes. BinPerks may change recurring Platform Fees upon at least thirty (30) days' written notice. Merchant may terminate before the new fee takes effect. Continued use after the effective date constitutes acceptance of the changed fee."
  },
  {
    "k": "h",
    "t": "5. MEMBERSHIP SALES, MERCHANT SHARE, AND PAYMENT FLOW"
  },
  {
    "k": "p",
    "t": "5.1 BinPerks Sells the Membership. The paid consumer membership is offered and sold by BinPerks under the Member Terms. The Member pays BinPerks for access to the BinPerks membership service and network. Merchant is not the seller, payee, merchant of record, billing agent, or collection agent for the consumer membership."
  },
  {
    "k": "p",
    "t": "5.2 Merchant Share Is Contractual Compensation. Merchant may earn a Merchant Share as compensation for active participation in the network, maintaining compliant Locations, promoting enrollment, honoring Member benefits, and supporting the Member experience. The Merchant Share is a separate contractual obligation of BinPerks calculated by reference to successfully collected membership revenue. It is not money received by BinPerks on Merchant's behalf, is not held in trust or escrow for Merchant, and does not give Merchant title to or a property interest in any Member payment before the Merchant Share becomes due under this Agreement."
  },
  {
    "k": "p",
    "t": "5.3 Share Percentage. Unless the Order Form states otherwise, Merchant Share equals 66 2/3% of the Base Membership Fee actually and finally collected from each Attributed Member, rounded to the nearest cent. At the initial $29.99 Base Membership Fee, the Merchant Share is $19.99 per successful full-price monthly payment."
  },
  {
    "k": "p",
    "t": "5.4 Ordinary Processing Fees. Unless the Order Form states otherwise, BinPerks bears ordinary card-processing fees on the Base Membership Fee. Merchant remains responsible for losses, penalties, dispute fees, reversals, refunds, or excess processing costs caused by Merchant's breach, misleading statements, failure to honor benefits, fraud, or other Merchant-controlled conduct."
  },
  {
    "k": "p",
    "t": "5.5 Attribution. Merchant earns a Merchant Share only for Attributed Members. A Member may have only one Origin Merchant at a time. A Member who enrolls through Merchant's Location is attributed to Merchant. A Member who enrolls directly with BinPerks, without a participating Location, is attributed to the first Activated Merchant whose Location awards that Member a stamp. Attribution is not permanent and may transfer as described in Section 5.6. A change in attribution applies to future billing periods and does not retroactively reallocate prior Merchant Shares."
  },
  {
    "k": "p",
    "t": "5.6 Inactivity and Attribution Transfer. If Merchant becomes an Inactive Merchant: (a) Merchant's Locations may not award stamps through the Platform; (b) when a Member attributed to Merchant next receives a stamp at an Activated Merchant's Location, that merchant automatically becomes the Member's Origin Merchant, without notice to or approval from Merchant; (c) Merchant earns no Merchant Share on that Member's Membership Payments collected after the transfer; and (d) a Member who has transferred does not return to Merchant if Merchant's account is later restored to good standing. A merchant that receives a transferred Member is not told the Member's prior Origin Merchant or the Member's activity at other merchants' Locations. Merchant acknowledges that Members attributed to other merchants may transfer to Merchant under the same rules."
  },
  {
    "k": "p",
    "t": "5.7 Processor and Payout Timing. BinPerks may use Stripe Connect destination charges, transfers, or another lawful processing structure. BinPerks will initiate or direct payment of the Merchant Share through Merchant's Connected Account according to the processor's availability, reserve, and payout schedules."
  },
  {
    "k": "p",
    "t": "5.8 Refunds, Chargebacks, and Reversals. If a Membership Payment is refunded, disputed, charged back, reversed, or not finally collected, the corresponding Merchant Share is not earned. BinPerks may reverse the transfer, deduct the amount from future Merchant Shares, or invoice Merchant."
  },
  {
    "k": "p",
    "t": "5.9 Statements and Disputes. Merchant must notify BinPerks in writing of a Merchant Share dispute within sixty (60) days after the transaction appears in the merchant dashboard. Failure to provide timely notice waives the dispute to the maximum extent permitted by law."
  },
  {
    "k": "p",
    "t": "5.10 Membership Price Changes. BinPerks may change the Base Membership Fee upon applicable notice. The Merchant Share percentage remains the same and the per-payment dollar amount changes accordingly."
  },
  {
    "k": "p",
    "t": "5.11 Taxes and Reporting. Each Party is responsible for its own income and similar taxes. Merchant will provide accurate taxpayer identification information through its Connected Account, which BinPerks and its payment processor may use to verify Merchant's identity and to prepare and file required information returns. BinPerks may also require a valid Form W-9 before or after payouts. Merchant Share payments may be reported on an applicable information return (e.g., Form 1099)."
  },
  {
    "k": "p",
    "t": "5.12 No Guaranteed Revenue. BinPerks makes no earnings claim or guarantee. Merchant's Platform Fee remains due regardless of Merchant Share earned unless the Order Form expressly provides otherwise."
  },
  {
    "k": "h",
    "t": "6. MEMBER PROGRAM, PERKS, AND COUPON OBLIGATIONS"
  },
  {
    "k": "p",
    "t": "6.1 Program Rules. BinPerks establishes and administers the Member account structure, membership levels, stamp or visit logic, referral logic, anti-duplication rules, perk eligibility records, and other program mechanics. Merchant acknowledges that BinPerks Members are subject to the BinPerks Member Terms of Service, available at app.binperks.com/terms/member, which govern stamp awards, coupon redemptions, referral eligibility, membership tiers, and other member-facing program rules. Merchant agrees to direct any member disputes or inquiries regarding stamp awards, coupon redemptions, referral stamps, or program rules to BinPerks support and will not make representations to members that contradict the Member Terms of Service."
  },
  {
    "k": "p",
    "t": "6.2 Merchant Control of Perks. Merchant will maintain, for each participating Location, at least one (1) and no more than three (3) active perks for Starter (free) members, and at least three (3) and no more than five (5) active perks for VIP members. Merchant selects its perks from the BinPerks perk menu in the Platform and may submit new perks for BinPerks review. BinPerks may approve, reword, or decline any submitted perk, and approved perks are added to the BinPerks perk menu. No perk may involve chance, including raffles, drawings, sweepstakes, giveaways decided by chance, spin-to-win games, scratch-offs, or mystery prizes. Each perk must be available to every eligible Member through that Member's own visit or purchase, and whether a Member qualifies must be known at the time of the visit. No perk may depend on the actions of other people (including share, like, follower, or attendance counts), require any social media action (including sharing, liking, following, posting, tagging, or reviewing), or name or refer to any other merchant. BinPerks may decline, hide, or remove any perk that does not comply with this Agreement or applicable law. Merchant is solely responsible for honoring its perks and for their lawfulness. Subject to these requirements, and except for the Required Coupon Benefits expressly identified in the applicable Merchant Order Form, Merchant retains sole discretion to design, select, value, modify, suspend, or discontinue the perks, discounts, benefits, products, and promotional offers Merchant makes available through the BinPerks Platform. BinPerks does not establish Merchant's general retail prices, inventory, product selection, operating hours, staffing, suppliers, purchasing practices, or other day-to-day business operations. Merchants may independently use other loyalty or marketing platforms, provided they do not misuse BinPerks Member Data or intellectual property."
  },
  {
    "k": "p",
    "t": "6.3 Required Coupon Benefits and Coupon Funding. As a condition of participation, Merchant agrees to honor the Required Coupon Benefits described in this Section and in the Merchant Order Form at each of its participating Locations, for any Member presenting a valid coupon, regardless of which merchant is that Member's Origin Merchant. BinPerks may not materially increase Merchant's required coupon obligation without Merchant's written agreement. Coupons are funded and settled as follows: (a) Origin Merchant Funds. Each coupon is funded by the Member's Origin Merchant at the time the coupon is earned, including a coupon whose stamp cycle began while the Member was attributed to a different merchant. (b) Redemption at the Funding Merchant. When a coupon is redeemed at a Location of the merchant that funded it, that merchant honors the coupon and no settlement occurs. (c) Redemption Elsewhere. When a coupon is redeemed at another participating merchant's Location, the honoring merchant is reimbursed the coupon's face value in the monthly settlement following redemption. BinPerks charges that amount to the funding merchant and may deduct it from the funding merchant's Merchant Share, charge it to the funding merchant's payment method on file, or invoice it. (d) BinPerks Backstop. If the funding merchant is an Inactive Merchant, has terminated, or has not paid the amount at settlement, BinPerks will pay the honoring merchant and may invoice the funding merchant for the amount. That amount remains a debt owed by the funding merchant to BinPerks and survives termination. Current Required Coupon Benefits are:"
  },
  {
    "k": "p",
    "t": "• Starter tier (free membership): $5.00 coupon per 20-stamp cycle, with no lifetime limit"
  },
  {
    "k": "p",
    "t": "• Bronze tier (VIP, 0–199 VIP progression stamps): $7.00 coupon per 20-stamp cycle"
  },
  {
    "k": "p",
    "t": "• Silver tier (VIP, 200–749 VIP progression stamps): $10.00 coupon per 20-stamp cycle"
  },
  {
    "k": "p",
    "t": "• Gold tier (VIP, 750–1,999 VIP progression stamps): $12.00 coupon per 20-stamp cycle"
  },
  {
    "k": "p",
    "t": "• Diamond tier (VIP, 2,000+ VIP progression stamps): $15.00 coupon per 20-stamp cycle"
  },
  {
    "k": "p",
    "t": "• Reactivation Coupon: one-time $2.00 coupon per Member, as described in Section 6.3.2"
  },
  {
    "k": "p",
    "t": "6.3.1 Stamp Cycles and Tiers. Every Member earns one coupon for each twenty (20) stamps completed in a reward cycle, valued at the Member's tier when the cycle completes. Starter members earn coupons indefinitely. VIP tier advancement is based on VIP progression stamps, which accrue only while the Member holds a paid VIP membership; stamps earned as a Starter member do not count toward VIP tiers. When a Member upgrades to VIP, any partially completed reward cycle carries over and is valued at the Member's VIP tier when it completes. A Member who cancels VIP and later resubscribes resumes from the VIP progression stamps previously earned."
  },
  {
    "k": "p",
    "t": "6.3.2 Reactivation Coupon. If a Member has not received a stamp at any participating Location for sixty (60) days, BinPerks may issue the Member a Reactivation Coupon valued at $2.00, which expires fourteen (14) days after it is issued. Each Member may receive no more than one Reactivation Coupon, ever, and none is issued while the Member holds an unredeemed coupon. The Reactivation Coupon is a Required Coupon Benefit funded by the Member's Origin Merchant under Section 6.3. BinPerks may also send Members reminder messages without a coupon, including after thirty (30) days without a stamp."
  },
  {
    "k": "p",
    "t": "6.4 Honor Earned Benefits. Merchant will timely honor all valid benefits shown as available in the Platform, without adding undisclosed conditions. If a stated item is unavailable, Merchant will provide a reasonably equivalent substitute."
  },
  {
    "k": "p",
    "t": "6.5 Employee Training. Merchant will train cashiers, managers, and other relevant personnel on member lookup, stamp issuance, benefit verification, redemption, privacy, and fraud prevention."
  },
  {
    "k": "p",
    "t": "6.6 No Manipulation. Merchant will not create fake Members, award unauthorized stamps, split or duplicate transactions, falsify visits, or manipulate attribution. BinPerks may reverse affected records and payments. Cashier and staff personnel employed or engaged by Merchant at any participating Location are not permitted to hold a BinPerks member account of any kind, including a free Starter account, at any Location operated by the same Merchant. Merchant is responsible for ensuring compliance by all personnel and must promptly notify BinPerks if a conflict is discovered."
  },
  {
    "k": "p",
    "t": "6.7 Consumer Complaints. Merchant will promptly investigate and resolve complaints concerning Merchant products, services, employees, premises, offers, or benefit fulfillment."
  },
  {
    "k": "h",
    "t": "7. MERCHANT REPRESENTATIONS, STANDARDS, AND COMPLIANCE"
  },
  {
    "k": "p",
    "t": "7.1 Authority. Merchant represents that it is validly organized, has authority to enter into this Agreement, operates each Location lawfully, and has obtained all required licenses, permits, consents, and approvals."
  },
  {
    "k": "p",
    "t": "7.2 Accurate Information. Merchant will keep its store name, address, hours, and other Merchant Content accurate. Merchant will not make false or misleading claims about BinPerks, membership savings, or earnings."
  },
  {
    "k": "p",
    "t": "7.3 Lawful Operations. Merchant will comply with all applicable consumer-protection, advertising, pricing, privacy, data-security, tax, employment, and industry-specific laws."
  },
  {
    "k": "p",
    "t": "7.4 Insurance. Merchant will maintain commercially reasonable insurance appropriate to its operations, including commercial general liability and any legally required workers' compensation coverage."
  },
  {
    "k": "p",
    "t": "7.5 Third-Party Terms. Merchant will comply with applicable terms of Stripe, telecommunications carriers, review platforms, and other services integrated with the Platform."
  },
  {
    "k": "h",
    "t": "8. MEMBER COMMUNICATIONS AND REVIEWS"
  },
  {
    "k": "p",
    "t": "8.1 Platform Communications. BinPerks controls the technical sending of Platform-related email, SMS, and other communications and the maintenance of consent and opt-out records."
  },
  {
    "k": "p",
    "t": "8.2 No Independent Use of Platform Contacts. Merchant will not copy Member contact information from the Platform into another system or send independent bulk messages to Platform Members."
  },
  {
    "k": "p",
    "t": "8.3 Review Destination. Merchant is responsible for entering and maintaining an accurate public review destination link in merchant settings. BinPerks directs Members to that destination after a neutral experience prompt."
  },
  {
    "k": "p",
    "t": "8.4 Review Integrity. Merchant will not require positive sentiment as a condition of receiving a benefit, suppress review opportunities based on sentiment, or otherwise manipulate reviews."
  },
  {
    "k": "h",
    "t": "9. DATA RIGHTS, PRIVACY, AND SECURITY"
  },
  {
    "k": "p",
    "t": "9.1 Platform Member Relationship. BinPerks maintains the contractual account relationship with Members and controls the Platform member database, account architecture, consent records, and member-facing experience."
  },
  {
    "k": "p",
    "t": "9.2 Ownership. BinPerks owns the Platform, the Platform Member Data database and compilation, Platform-generated records, data models, analytics, and all related intellectual property. Merchant acquires no ownership interest in Platform Member Data."
  },
  {
    "k": "p",
    "t": "9.3 Limited Data Access. BinPerks grants Merchant a limited right to access the minimum Platform Member Data reasonably needed to verify membership, award or verify activity, fulfill benefits, address support issues, and review Merchant-specific reporting. 9.3.1 Cashier Transaction Access. When a member voluntarily provides their phone number at a participating Location to earn a stamp, redeem a coupon, or otherwise use BinPerks, authorized cashier staff may access only the limited member information necessary to process that specific transaction, including member name, membership status and tier, stamp eligibility and status, and available reward information. This access is limited to the active transaction and does not give Merchant ongoing access to an individual member database. 9.3.2 Merchant Dashboard Reporting. Merchant dashboard reporting is aggregate only. Origin Merchant aggregate reporting may include total members enrolled, total VIP members, aggregate commission and settlement activity, aggregate stamps awarded, and aggregate coupons earned. Merchant dashboard reporting does not provide an individual member list or individual member-level activity history. Merchants do not receive member names, phone numbers, email addresses, individual tier records, individual stamp histories, individual join dates, or other personally identifying member information through dashboard reporting. No Merchant receives the ability to export, download, or otherwise obtain a portable database of member contact information. Reporting about a Member who transfers to Merchant under Section 5.6 does not identify the Member's prior Origin Merchant or the Member's activity at other merchants' Locations."
  },
  {
    "k": "p",
    "t": "9.4 No Export or Circumvention. Merchant has no access to the BinPerks member database and no right to view, retrieve, or obtain individual member records outside of the limited cashier transaction access described in Section 9.3.1. Merchant will not scrape, export, download, copy, or create a separate database from Platform Member Data. Merchant will not use Platform Member Data to migrate Members to or populate a competing loyalty or paid-membership system during the Term or for twelve (12) months afterward."
  },
  {
    "k": "p",
    "t": "9.5 Security. Merchant will use reasonable safeguards and notify BinPerks no later than twenty-four (24) hours after discovery of any suspected unauthorized access involving Platform Member Data."
  },
  {
    "k": "p",
    "t": "9.6 Privacy Requests. Merchant will promptly forward to BinPerks any Member request to access, correct, delete, or opt out concerning Platform Member Data."
  },
  {
    "k": "h",
    "t": "10. INTELLECTUAL PROPERTY AND BRAND USE"
  },
  {
    "k": "p",
    "t": "10.1 BinPerks Ownership. BinPerks and its licensors retain all rights in the Platform, workflows, software, interfaces, templates, automations, documentation, program logic, trademarks, and improvements."
  },
  {
    "k": "p",
    "t": "10.2 Limited Mark License. BinPerks grants Merchant a revocable, nonexclusive, nontransferable license during the Term to use approved BinPerks Marks solely to identify Merchant as a participating merchant. The BinPerks trademark license is limited to identifying the store as a participating merchant. Merchant may not modify the Marks, register confusingly similar marks, or use the Marks as the name of Merchant's business."
  },
  {
    "k": "p",
    "t": "10.3 Merchant License to BinPerks. Merchant grants BinPerks a worldwide, nonexclusive, royalty-free license during the Term to use Merchant Content to operate, promote, and identify Merchant as a participating merchant."
  },
  {
    "k": "h",
    "t": "11. CONFIDENTIALITY"
  },
  {
    "k": "p",
    "t": "11.1 Confidential Information. Confidential Information includes nonpublic pricing, technology, workflows, Platform Member Data, business plans, contracts, and financial information."
  },
  {
    "k": "p",
    "t": "11.2 Protection and Use. The receiving Party will protect the disclosing Party's Confidential Information using at least reasonable care and use it only to perform this Agreement."
  },
  {
    "k": "h",
    "t": "12. TERM, SUSPENSION, AND TERMINATION"
  },
  {
    "k": "p",
    "t": "12.1 Term. This Agreement begins on the Effective Date and continues on a month-to-month basis until terminated."
  },
  {
    "k": "p",
    "t": "12.2 Termination for Convenience. Either Party may terminate on thirty (30) days' written notice. Platform Fees already paid are nonrefundable."
  },
  {
    "k": "p",
    "t": "12.3 Suspension or Immediate Termination. BinPerks may suspend or terminate immediately for nonpayment, fraud, data misuse, review manipulation, material consumer harm, repeated failure to honor benefits, or any material breach not cured within ten (10) days after notice."
  },
  {
    "k": "p",
    "t": "12.4 Effect on Locations and Members. Upon suspension or termination, BinPerks may deactivate all Locations and remove Merchant from member-facing tools. Merchant will honor valid benefits earned before the termination date for thirty (30) days afterward. Upon termination, Members attributed to Merchant transfer under Section 5.6 to the next Activated Merchant whose Location awards them a stamp. Amounts Merchant owes for coupons funded under Section 6.3 survive termination."
  },
  {
    "k": "p",
    "t": "12.5 Final Settlement. BinPerks will pay undisputed earned Merchant Shares after applying refunds, reversals, reserves, unpaid coupon funding amounts under Section 6.3, and other amounts Merchant owes. BinPerks may delay final settlement for up to one hundred twenty (120) days for chargebacks, fraud, or processor reserves."
  },
  {
    "k": "p",
    "t": "12.6 No Data Transfer. Termination does not entitle Merchant to receive or export Platform Member Data. Member accounts remain with BinPerks."
  },
  {
    "k": "h",
    "t": "13. WARRANTIES AND DISCLAIMERS"
  },
  {
    "k": "p",
    "t": "13.1 Mutual Authority. Each Party represents that it has authority to enter into this Agreement."
  },
  {
    "k": "p",
    "t": "13.2 Platform Disclaimer. EXCEPT AS EXPRESSLY STATED, THE PLATFORM IS PROVIDED \"AS IS\" AND \"AS AVAILABLE.\" BINPERKS DISCLAIMS IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND ANY WARRANTY THAT THE PLATFORM WILL BE UNINTERRUPTED OR ERROR-FREE."
  },
  {
    "k": "h",
    "t": "14. INDEMNIFICATION"
  },
  {
    "k": "p",
    "t": "14.1 By Merchant. Merchant will defend and indemnify BinPerks from third-party claims arising from Merchant's products, services, employees, Merchant Content, failure to honor benefits, data misuse, or breach of this Agreement."
  },
  {
    "k": "p",
    "t": "14.2 By BinPerks. BinPerks will defend and indemnify Merchant from a third-party claim that Merchant's authorized use of the unmodified Platform or BinPerks Marks infringes a United States intellectual-property right."
  },
  {
    "k": "h",
    "t": "15. LIMITATION OF LIABILITY"
  },
  {
    "k": "p",
    "t": "15.1 Excluded Damages. TO THE MAXIMUM EXTENT PERMITTED BY LAW, NEITHER PARTY WILL BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, PUNITIVE, OR CONSEQUENTIAL DAMAGES, OR FOR LOST PROFITS OR BUSINESS INTERRUPTION."
  },
  {
    "k": "p",
    "t": "15.2 Liability Cap. EXCEPT FOR PAYMENT OBLIGATIONS, FRAUD, WILLFUL MISCONDUCT, BREACH OF CONFIDENTIALITY, OR MISUSE OF PLATFORM MEMBER DATA, EACH PARTY'S TOTAL LIABILITY WILL NOT EXCEED THE GREATER OF (A) PLATFORM FEES PAID DURING THE SIX (6) MONTHS BEFORE THE EVENT OR (B) $1,800."
  },
  {
    "k": "h",
    "t": "16. GOVERNING LAW AND DISPUTE RESOLUTION"
  },
  {
    "k": "p",
    "t": "16.1 Good-Faith Resolution. Before filing suit, an authorized representative of each Party will attempt in good faith for at least fifteen (15) days to resolve the dispute."
  },
  {
    "k": "p",
    "t": "16.2 Florida Law and Venue. Florida law governs. The state and federal courts located in Hillsborough County, Florida will have exclusive jurisdiction."
  },
  {
    "k": "p",
    "t": "16.3 Jury Trial Waiver. TO THE EXTENT PERMITTED BY LAW, EACH PARTY KNOWINGLY AND VOLUNTARILY WAIVES TRIAL BY JURY."
  },
  {
    "k": "p",
    "t": "16.4 Attorneys' Fees. The prevailing Party in an action to enforce this Agreement is entitled to recover reasonable attorneys' fees and costs."
  },
  {
    "k": "h",
    "t": "17. GENERAL TERMS"
  },
  {
    "k": "p",
    "t": "17.1 Notices. Legal notices must be in writing delivered by email, certified mail, or overnight service to the addresses in the Order Form."
  },
  {
    "k": "p",
    "t": "17.2 Assignment. Merchant may not assign this Agreement without BinPerks' prior written consent. BinPerks may assign in connection with a merger or sale."
  },
  {
    "k": "p",
    "t": "17.3 Entire Agreement. This Agreement, the Order Form, and incorporated policies are the entire agreement concerning the subject matter."
  },
  {
    "k": "p",
    "t": "17.4 Amendments. Except for changes expressly permitted in this Agreement, amendments must be in writing and signed by both Parties."
  },
  {
    "k": "p",
    "t": "17.5 Severability and Waiver. If a provision is unenforceable, it will be modified to the minimum extent necessary and the remainder will remain effective."
  },
  {
    "k": "p",
    "t": "17.6 Electronic Signatures and Acceptance. This Agreement, the Order Form, and any amendment may be signed or accepted electronically, including by Merchant checking a box and clicking to accept in the Platform. Electronic acceptance by Merchant's authorized representative is Merchant's signature, binds Merchant to the same extent as a handwritten signature, and satisfies any requirement that a document be in writing or signed. BinPerks will keep a record of each acceptance, including the Agreement version, the date and time, the name and email of the person accepting, and related technical information, and will make a copy of the accepted Agreement available to Merchant. The Parties consent to transact business electronically under the federal Electronic Signatures in Global and National Commerce Act and the Florida Uniform Electronic Transaction Act."
  },
  {
    "k": "p",
    "t": ""
  },
  {
    "k": "h",
    "t": "SIGNATURES"
  },
  {
    "k": "p",
    "t": "The Parties have executed this Agreement through authorized representatives as of the Effective Date in the Order Form."
  },
  {
    "k": "p",
    "t": "By signing below or accepting this Agreement electronically, Merchant acknowledges that it has read and agrees to every section of this Agreement and the Order Form, including Section 4 (Platform Fee and Merchant Billing), Section 5.6 (Inactivity and Attribution Transfer), Section 6.3 (Required Coupon Benefits and Coupon Funding), Section 9 (Data Rights, Privacy, and Security), Section 12 (Term, Suspension, and Termination), Section 15 (Limitation of Liability), and Section 16 (Governing Law and Dispute Resolution, including the Jury Trial Waiver)."
  },
  {
    "k": "p",
    "t": ""
  },
  {
    "k": "accept"
  },
  {
    "k": "p",
    "t": ""
  },
  {
    "k": "h",
    "t": "EXHIBIT A — MERCHANT ORDER FORM"
  },
  {
    "k": "p",
    "t": "This Merchant Order Form is governed by the BinPerks Merchant Participation and Platform Agreement. Capitalized terms not defined here have the meanings in the Agreement."
  },
  {
    "k": "tbl",
    "rows": [
      [
        "PARTY AND TERM INFORMATION"
      ],
      [
        "BinPerks Legal Entity",
        "BinPerks LLC, a Florida Limited Liability Company"
      ],
      [
        "Merchant Legal Name",
        "{{MERCHANT_LEGAL_NAME}}"
      ],
      [
        "Store Name",
        "{{STORE_NAME}}"
      ],
      [
        "Store Website (optional)",
        "{{STORE_WEBSITE}}"
      ],
      [
        "Merchant Notice Address",
        "{{NOTICE_ADDRESS}}"
      ],
      [
        "Merchant Notice Email",
        "{{NOTICE_EMAIL}}"
      ],
      [
        "Primary Contact",
        "{{PRIMARY_CONTACT}}"
      ],
      [
        "Effective Date",
        "{{EFFECTIVE_DATE}}"
      ]
    ]
  },
  {
    "k": "p",
    "t": ""
  },
  {
    "k": "tbl",
    "rows": [
      [
        "MERCHANT PLATFORM FEES"
      ],
      [
        "One-Time Setup Fee + Monthly Platform Fee (1st Location)",
        "$200.00 one-time setup fee (nonrefundable); then $99.99 per month recurring"
      ],
      [
        "Additional Location Fee",
        "$49.99 per month per additional Location"
      ],
      [
        "Billing Frequency",
        "One-time setup fee charged at enrollment; monthly platform fee charged in advance on a recurring basis; automatic payment required"
      ],
      [
        "Initial Term",
        "Month-to-month"
      ],
      [
        "Promotional Fee Waiver",
        "{{PROMO_WAIVER}}"
      ]
    ]
  },
  {
    "k": "p",
    "t": ""
  },
  {
    "k": "tbl",
    "rows": [
      [
        "MEMBERSHIP AND REVENUE SHARE"
      ],
      [
        "Base Membership Fee",
        "$29.99 per paid Member per month"
      ],
      [
        "Merchant Share",
        "66 2/3% of Base Membership Fee actually and finally collected from each Attributed Member"
      ],
      [
        "Current Dollar Amount",
        "$19.99 per successful full-price $29.99 Membership Payment"
      ],
      [
        "BinPerks Retained Amount",
        "$10.00 per successful full-price $29.99 Membership Payment, before processing costs"
      ],
      [
        "Payout Method",
        "Stripe Connect Connected Account"
      ],
      [
        "Payout Timing",
        "Processor schedule; subject to reserves, refunds, and disputes"
      ]
    ]
  },
  {
    "k": "p",
    "t": ""
  },
  {
    "k": "tbl",
    "rows": [
      [
        "REQUIRED COUPON BENEFITS"
      ],
      [
        "Starter (free membership)",
        "$5.00 coupon per 20-stamp cycle, no lifetime limit"
      ],
      [
        "Bronze (VIP, 0–199 VIP progression stamps)",
        "$7.00 coupon per 20-stamp cycle"
      ],
      [
        "Silver (VIP, 200–749 VIP progression stamps)",
        "$10.00 coupon per 20-stamp cycle"
      ],
      [
        "Gold (VIP, 750–1,999 VIP progression stamps)",
        "$12.00 coupon per 20-stamp cycle"
      ],
      [
        "Diamond (VIP, 2,000+ VIP progression stamps)",
        "$15.00 coupon per 20-stamp cycle"
      ],
      [
        "Reactivation Coupon",
        "One-time $2.00 per Member, ever; issued after 60 days without a stamp; expires 14 days after issue"
      ],
      [
        "Stamp Rule",
        "One qualifying stamp per Member per participating Location per day"
      ],
      [
        "Coupon Funding",
        "Funded by the Member's Origin Merchant; redemptions at other merchants' Locations reimbursed in monthly settlement (Section 6.3)"
      ]
    ]
  },
  {
    "k": "p",
    "t": ""
  },
  {
    "k": "tbl",
    "rows": [
      [
        "INITIAL PROGRAM CONFIGURATION"
      ],
      [
        "Participating Locations",
        "{{PARTICIPATING_LOCATIONS}}"
      ],
      [
        "Public Review Destination",
        "{{REVIEW_DESTINATION}}"
      ],
      [
        "Merchant Perks",
        "Starter (free) members: minimum 1, maximum 3 perks. VIP members: minimum 3, maximum 5 perks. Perks selected from the BinPerks perk menu; new perks may be submitted for BinPerks review. No chance-based, social media, or group-goal perks; each perk must be earnable by the Member's own visit."
      ]
    ]
  },
  {
    "k": "p",
    "t": ""
  },
  {
    "k": "p",
    "t": "ORDER FORM ACCEPTANCE — By signing below or accepting electronically, the Parties agree to this Order Form and the BinPerks Merchant Participation and Platform Agreement."
  },
  {
    "k": "p",
    "t": ""
  },
  {
    "k": "accept"
  },
  {
    "k": "p",
    "t": ""
  },
  {
    "k": "h",
    "t": "EXHIBIT B — PLATFORM DATA AND ACCEPTABLE USE RULES"
  },
  {
    "k": "p",
    "t": "These rules supplement the Agreement and apply to all Merchant personnel, Locations, devices, and Platform access."
  },
  {
    "k": "tbl",
    "rows": [
      [
        "Rule",
        "Requirement"
      ],
      [
        "Authorized use only",
        "Use the Platform only for approved Merchant operations and approved Locations."
      ],
      [
        "Minimum necessary access",
        "View Member information only when needed to verify membership, award valid activity, fulfill a benefit, or resolve a support issue."
      ],
      [
        "No exports",
        "Do not export, scrape, copy, or build lists from Platform Member Data unless an approved feature expressly permits it."
      ],
      [
        "No outside messaging",
        "Do not use Platform Member contact information for independent email, SMS, or direct-mail campaigns."
      ],
      [
        "No competing database",
        "Do not use Platform Member Data to create or seed another loyalty or membership platform."
      ],
      [
        "Credential security",
        "Use unique credentials, strong passwords, role-limited access, and prompt offboarding for former personnel."
      ],
      [
        "No false activity",
        "Do not create fake accounts, award stamps without qualifying activity, or falsify perk redemption."
      ],
      [
        "Incident reporting",
        "Report suspected unauthorized access or data loss to BinPerks immediately and no later than twenty-four hours after discovery."
      ],
      [
        "Return and deletion",
        "At suspension or termination, stop all access and delete Platform Member Data retained outside the Platform unless law requires retention."
      ]
    ]
  }
]
