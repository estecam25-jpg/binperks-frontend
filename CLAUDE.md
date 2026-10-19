# BinPerks — CLAUDE.md
*Last updated: October 18, 2026 (commit `ba8d1fc`)*

---

## Project Identity

**Founder:** Esteban Nina (non-developer CEO, BinPerks LLC)
**Umbrella company:** EsteCam Marketing Agency powers BinPerks.
**Build method:** Claude Code sessions + planning chats. No development team.
**Canonical doc:** `D:\BinPerks\CLAUDE.md` (this file — download and overwrite after every update)

---

## Infrastructure

| Resource | Value |
|---|---|
| GitHub repo | `estecam25-jpg/binperks-frontend` |
| Local path | `D:\BinPerks\frontend` |
| Vercel project ID | `prj_QXfoOkYgcmS9UfE083h0vgSCLumt` |
| Vercel team ID | `team_R6CEKCeHkQMxBVsNFy7dP5zv` |
| Vercel token | `D:\BinPerks\.vercel-token` |
| Supabase project ref | `qayltanzdsmckiyqnxpj` |
| Live subdomains | `app.binperks.com` (members), `merchant.binperks.com` (merchants + merchant landing page), `admin.binperks.com` (admin), `stamptool.binperks.com` (cashiers) |
| Member homepage | Built in Next.js (managed by Claude, not GHL). Preview: `app.binperks.com/home`. Will serve `binperks.com` after the DNS switch. |

### Domains & DNS (DNS lives at HostGator)
- `binperks.com` = **members**. `merchant.binperks.com` = **merchants**.
- ⚠️ **DNS switch pending** (HostGator):
  - A record `@` → `216.150.1.1` (plus `216.150.16.1`)
  - CNAME `www` → `66aab3cd8fa03628.vercel-dns-017.com.`
  - **SPF cleanup:** delete the duplicate `v=spf1 a mx include:websitewelcome.com ~all`; keep the `ip4` version.

---

## Tech Stack

- **Frontend:** Next.js 16.2.9, TypeScript, Tailwind CSS v4
- **Backend:** Supabase (DB + Auth)
- **Payments:** Stripe Connect
- **Communications:** GoHighLevel (SMS/email) — communications layer only
- **Image processing:** Sharp
- **PDF generation:** pdf-lib
- **Font rendering:** opentype.js (Montserrat Bold bundled at `public/fonts/Montserrat-Bold.ttf`)
- **Background tasks:** `waitUntil` from `@vercel/functions` — used for fire-and-forget GHL webhooks
- **Contract signing:** in-app acceptance (checkbox + typed name/title, PDF via pdf-lib). DocuSeal retired Oct 18, 2026.
- **Transactional email:** Resend (member OTP email, merchant activation alert to support@binperks.com)
- **Deployment:** Vercel (frontend), Supabase (backend/DB)
- **IDE:** VS Code with Claude Code extension on Windows (D: drive). Keep Git Bash open while Claude Code runs.

---

## Auth

- **Members:** one-time code — one SMS via GHL "BinPerks Member OTP" workflow (SMS step only) + one email via Resend. Watch for double OTP emails returning.
- **Merchants:** Native Supabase email sign-in — sends from `noreply@feedback.binperks.com` (known cosmetic issue, leave as-is). GHL Merchant OTP workflow deactivated.
- **Supabase Auth:** email confirmation off, phone provider off
- **Sessions are subdomain-specific** — must sign in once per subdomain
- **Session storage:** cookies (NOT localStorage) — server-readable, 400-day max-age, refreshed server-side via middleware. DO NOT change to localStorage — would break all server-side auth.

---

## Real Merchants (Live & Paying)

| Store | Owner | LLC | Email | Phone |
|---|---|---|---|---|
| Bin Chasers Lake Wales | Thomas Shultz | Liquidation Motivation LLC | binchasers@gmail.com | 8632822823 |
| Bin Chasers Lakeland | Mark Debolla | BABG LLC | binchaserslakeland@gmail.com | 8632708626 |

- Thomas and Mark signed **Merchant Agreement V3.5** via DocuSeal on **Sept 5, 2026** (`stores.agreement_signed_at` = 2026-09-05).
- Do not change their merchant/store status, billing, perks, or agreement records without explicit instruction. (Esteban handles everything about their agreement — do not raise it.)
- **W9s** — Thomas's and Mark's collected by email. New merchants: Stripe Connect handles tax info (see below).

### W-9, Stripe Connect & 1099s (investigated Oct 18, 2026)
- **Two W-9 paths that don't connect:** (1) DocuSeal template (agreement + W-9) — completed PDFs live **only in the DocuSeal account**, never fetched into BinPerks; (2) manual upload — `merchant_w9` table + `merchant-w9` bucket, admin approve/reject in Merchants tab. Only 1 row on file (EstaBins LLC test, `pending`).
- **Stripe Connect = Express.** Stripe collects legal name, address, DOB, TIN and verifies with IRS, but never returns TIN digits to BinPerks. Platform can read `tax_id_provided` / requirements / verification status.
- Connect accounts: BABG LLC `acct_1UFOLrAnCDRDSa9q`, EstaBins LLC `acct_1U2fi5A07nrgNjpV`. ⚠️ **Liquidation Motivation LLC has no Connect account** → its settlement transfer can't go out until Connect onboarding is completed.
- Payouts are `stripe.transfers.create` (platform-paid → 1099-NEC/MISC territory, not 1099-K). **1099 filing not set up.** Stripe Connect tax reporting is a Dashboard setting. Form type/threshold = accountant question.
- DocuSeal webhook → `activateAfterSignature()` (billing active, stores live, commission eligible, history row, GHL notice, support alert, print kit). Signing page also polls DocuSeal as a backup activation route. (Now called by in-app acceptance instead.)
- Sensitive keys (Claude Code can't read): `DOCUSEAL_API_KEY`, `DOCUSEAL_TEMPLATE_ID`, live `STRIPE_SECRET_KEY`.
- **DECIDED Oct 18: NO MORE DOCUSEAL.** New merchants accept the agreement in-app (checkbox + typed name) — see Merchant Onboarding Flow. Agreement §17.6 rewritten for electronic acceptance (checkbox = signature; acceptance record kept; E-SIGN + Florida UETA); acceptance lines read "By signing below or accepting this Agreement electronically". Thomas and Mark's records untouched.
- **DECIDED Oct 18: W-9 = Stripe only.** Stripe Connect collects + verifies the TIN during payout setup and (once turned on) files 1099s. No separate W-9 step for merchants. The existing upload page (`merchant_w9`) stays as a backup (leaving Stripe, IRS mismatch notice, payments outside Stripe, accountant request). Agreement §5.11 updated to match.

**Pre-setup stores (not live, hidden):** Deal Daze, Suncoast Liquidators, Super Bins, BinCredible Deals — see Pre-Setup Stores below.

**Inactive / test merchants:**
- "The Nieghborhood LLC" (store "Wednesday") — inactive, closed out Oct 12, 2026 (not network visible, enrollment off, cannot stamp). No payment dates (manually deactivated before `payment_failed_at` existed).
- EstaBins Tampa — Esteban's own test store (also the demo store at pre-setup visits).

---

## Members

**No real paying members yet.** Remaining accounts (as of Oct 18, 2026) are test/friends-and-family accounts with real phone numbers — they receive real texts and emails:

| Member | Tier | Notes |
|---|---|---|
| EstiBun Niner | VIP Bronze | Esteban's own test account (`e.nina@yahoo.com`, 6173061154). `total_stamps` set to 75 to match history. |
| Pepa Patroni | Free | Origin: EstaBins Tampa |
| Steven Rivera | Free | House origin |
| david billera | Free | House origin |
| Trevis Williams | Free | |
| Matthew Reaves | Free | Joined Oct 3, 2026 |

- Deleted Oct 13, 2026 (app + GHL): David Cruz, Jevon He, Jenny Lizardi, Camei Nina.
- Jenny Lizardi is Esteban's cousin — never describe her as a real member.

---

## Pricing (Locked)

- **Setup fee:** $200.00 one-time (nonrefundable)
- **Monthly platform fee:** $99.99/month
- **Additional locations:** $49.99/month each

**Stripe Products (ALL standalone — NO sub-products):**
- **BinPerks Merchant Setup Fee** — $200.00 one-time → `STRIPE_PRICE_IMPLEMENTATION`
- **BinPerks Merchant Marketing Program** — $99.99/mo → `STRIPE_PRICE_PLATFORM`
- **BinPerks Additional Locations** — $49.99/mo → `STRIPE_PRICE_LOCATION`

**CRITICAL:** All three must be standalone products. Stripe cannot restrict a coupon to a sub-product/price within a parent product.

**Promo codes (internal only — NEVER in UI, legal docs, or any merchant-facing document):**
- ✅ **FIRST20** — 100% off setup fee, max 20, expires Dec 31, 2026
- ✅ **FIRST30** — 50% off setup fee ($100 off), max 30, expires Dec 31, 2027
- ✅ **FIRSTTEN** — 100% off forever, max 10, expires Dec 31, 2026 — first 10 founding merchants
- ❌ FIRST100, FOUNDING100, BETA2026 — deactivated

**`STRIPE_TRANSFERS_ENABLED`** = `true` (flipped Sept 21, 2026)

**VIP membership:** $29.99/month (the $22.95 price is archived).

---

## Store Website (Oct 18)

- `stores.website_url` (text, nullable). Optional "Store website" field on merchant signup, pre-setup form and merchant Settings. Normalized to `https://` by `lib/store-website.ts`; empty = null. Not shown to members yet.
- Signup label is now "Store Name" (was "Store Name (DBA)"). Pre-setup DBA field removed; `brand_name` filled from store name. No DBA column dropped.

---

## Pre-Setup Stores (live Oct 2026)

Lets Esteban build a store **before** the owner signs up, then finish signup **at the visit** (owner pays on-site; EstaBins Tampa is the demo).

- Admin → **Pre-setup stores** tab: create store (hidden, `billing_status = 'presetup'`), **Print materials** page (separate downloads), **finish-setup link** (`merchants.presetup_token`) → Stripe → in-app acceptance, **Delete**.
- Code: `lib/presetup.ts`, `PresetupStoresTab.tsx`.
- Store stays hidden and cannot stamp until paid + signed.
- ⚠️ First real visit: confirm the finish-setup form is pre-filled.
- **Pinned:** "Finish your signup" email (pre-filled link; includes the line "Save this email for when you're ready"); edit link for pre-setup stores (keep the original QR codes).

---

## Print Kit (live Oct 2026)

- Professional print is **included in the setup fee**. **One kit per location**, sent automatically at activation. Esteban will **not** send kits by hand.
- Kit = **10 posters + 1 countertop sheet** (11 single-page PDFs: `poster-01.pdf` … `poster-10.pdf`, `countertop-decal.pdf`). Print-ready and tested.
- Email goes to **support@binperks.com** first (Esteban forwards to the Atlanta printer, who ships to the store). Body: *"Please print 1qty of each as decal (sticky on back) 8.5" x 11" / ship in flat rate padded envelope to: [address]"*
- Tracked in `stores.print_kit_sent_at`. Admin has a **Send print kit** button. No shipping-status tracking.
- Cost ≈ **$54/kit** ($3.75 × 11 prints + $12.75 shipping).
- Code: `lib/print-kit.ts`.
- ⚠️ Delete the test print-kit email.

---

## Merchant Onboarding Flow — in-app acceptance (live Oct 18, 2026, commit `f8c29ce`)

1. Signup form → Stripe checkout (no DB record until payment)
2. Payment → merchant row (`pending_signature`) + store (inactive, hidden)
3. → `/merchant/signup/sign?session=<stripe_session_id>` — full V3.6 + pre-filled Order Form rendered in-app
4. Merchant types Full name + Title, ticks checkbox, clicks **Accept and activate**
5. PDF built + stored → acceptance row written → `activateAfterSignature()` → store live, GHL activated webhook, support alert, print kit
6. PDF emailed to merchant + support@binperks.com (subject "Your BinPerks Merchant Agreement")
- Pre-setup stores: finish-setup link → Stripe → same page.
- No W-9 step (Stripe handles tax info). W-9 upload page stays as backup.

**Key rules:** paying does NOT activate — only acceptance does. Unaccepted merchants see the acceptance page instead of the dashboard. Double-payment guard unchanged. Activation retries on page load for accepted-but-inactive merchants (`/api/merchant/agreement/activate`).

**Agreement source:** `legal/BinPerks_Merchant_Agreement_V3.6.docx` → `scripts/build-agreement-source.mjs` → generated `lib/agreements/v3-6.ts` (wording byte-identical; 14 field substitutions; script hard-fails if source text changes). For a new version: drop V3.7 docx in `legal/`, re-run generator, bump version id.
- Order Form fills: Merchant Legal Name, Store Name, Store Website (or "None"), Notice Address, Notice Email, Primary Contact, Participating Locations, **Effective Date = acceptance date**. Promotional Fee Waiver = "None"; Public Review Destination = "To be entered in merchant settings".
- BinPerks block reads "BinPerks LLC — accepted by platform" (no cursive signature).

**Acceptance record:** table `merchant_agreement_acceptances` (merchant_id, agreement_version, accepted_at, signer_name, signer_title, signer_email, ip_address, user_agent, document_sha256, pdf_path) — RLS on, service-role only, written once, never updated; unique on (merchant_id, agreement_version). PDFs in private bucket `merchant-agreements` (agreement + Acceptance Certificate page).
- Admin Merchants tab: "Agreement: V3.6 accepted [date] by [name, title]" + Download PDF; older merchants show "Accepted before in-app acceptance".
- Merchant Settings: "Your agreement" + Download PDF.

**Code:** `lib/agreements/*`, `lib/agreement-pdf.ts`, `lib/agreement-access.ts`, `app/api/merchant/agreement/{route,activate,pdf}`, `app/api/admin/merchant-agreements`, `app/merchant/signup/sign/{page,accept-agreement}.tsx`. Test: `scripts/e2e-agreement.mjs` (44/44).

**DocuSeal leftovers (remove after the account is closed):** `/api/merchant/docuseal-webhook`, `/api/merchant/signup/confirm` (no callers), `DOCUSEAL_*` env vars. `@docuseal/react` already uninstalled. Only DocuSeal-signed merchant ever: The Nieghborhood LLC (submission 11541551).
- ⚠️ Agreement email via Resend unproven until the first real acceptance — confirm the PDF lands at support@.

---

## Data Model Rules (Non-Negotiable)

- **STAMP_EVENTS is frozen** — `activity_events` is the sole source of truth for all stamp activity
- No stamp expiration, ever
- No subscription pause for merchants
- Per-cashier PINs via `staff_users` table (NOT "cashiers")
- `staff_users.phone` — cashier phone stored for internal investigative use only, never sent to GHL
- Stamp reversals allowed before midnight same-day by owner only
- GHL handles all SMS/email delivery — BinPerks fires webhooks to GHL
- Members can earn and redeem at any participating store in the network; the origin (home) store is an internal attribution record only

---

## Membership Model (V3.6 — live Oct 12, 2026)

### Three counters on `members`
| Column | Meaning |
|---|---|
| `total_stamps` | Lifetime stamps — never resets |
| `cycle_stamps` | Current reward cycle — resets every 20; one coupon per completed cycle |
| `vip_progression_stamps` | Earned only while VIP — the ONLY count used for VIP tier advancement |

### Tiers (thresholds in `lib/tiers.ts` — single source)
| Tier | Requirement | Coupon per 20 stamps | Stamps per visit | Emoji |
|---|---|---|---|---|
| Starter (Free) | Free membership | $5 — **no limit** | 1 | 🪨 |
| Bronze VIP | 0–199 VIP progression stamps | $7 | 2 | 🥉 |
| Silver VIP | 200–749 | $10 | 3 | 🥈 |
| Gold VIP | 750–1,999 | $12 | 4 | 🥇 |
| Diamond VIP | 2,000+ | $15 | 5 | 💎 |

**Rules:**
- **Free membership is permanent.** Free members earn $5 every 20 stamps forever. No 20-stamp cap, no "expired Starter". (Admin "Starter over 20" anomaly check removed.)
- Bronze requires a VIP subscription regardless of stamps (`resolveTierName`).
- **Upgrade:** VIP progression starts at 0; any partial cycle carries over and pays at the VIP tier when it completes (14/20 toward $5 → 14/20 toward $7).
- **Cancel then resubscribe:** VIP progression resumes where it left off.
- Existing VIPs grandfathered at their tier at migration (EstiBun → Bronze at 75).
- A single visit can complete more than one cycle — handled.
- Account screen shows the member's actual tier emoji (not always 💎).
- **Starter emoji is 🪨** — already live everywhere a tier emoji shows. Keep using it.

---

## Origin Store, Inactivity & Transfer (Phase 3 — live Oct 12, 2026)

- **Origin store** = store the member enrolled through. Members who joined directly through BinPerks (house origin) move to the **first store that stamps them**.
- **Merchant inactive** = platform payment failed and still unpaid **30 days** later. Daily cron `/api/cron/merchant-inactivity` at `0 7 * * *` (07:00 UTC).
  - During the 30-day grace the merchant can still stamp.
  - Once inactive: all its stores blocked from stamping. Stamp tool message: "This store can't award stamps right now. Please contact BinPerks support."
  - Commission eligibility ends; stores `is_active / network_visible / enrollment_enabled = false`.
  - Paying in full restores the merchant and its stores.
- **Transfer:** member of an inactive origin store stamped at an active store → that store becomes origin automatically (reason `origin_inactive`; house members reason `house_origin_first_stamp`).
- Reactivated merchants **never reclaim** transferred members.
- Receiving merchant never sees previous origin or other-store activity. `member_origin_history` is admin/service-role only (RLS on, no policies).
- Merchant Share uses origin as of each payment (read from the `activity_events` row) — nothing reallocates backwards.
- New columns: `merchants.payment_failed_at`, `merchants.became_inactive_at`, `members.origin_transferred_at`.

---

## Coupon Funding & Settlement (Phase 4 — live Oct 12, 2026)

- When a coupon is earned, `rewards.funding_store_id` / `funding_merchant_id` record the member's origin at that moment. That store pays the **whole** coupon, even if the cycle started under a previous store.
- Redeemed at the funding store → nothing to settle.
- Redeemed elsewhere → `coupon_credit_redeeming` (honoring store) + `coupon_debit_origin` (funder), face value, tagged with settlement period. Deducted from funder's Merchant Share first.
- Funder inactive/terminated/short → `coupon_debit_binperks`: BinPerks pays the honoring store; amount recorded as owed by the funder. Collection happens outside the system (Esteban invoices).
- Month-end batch: admin-run at `/api/admin/settlement/calculate` (nets the new entry types, carries shortfalls as negative balance). **Not yet run — first run Oct 31, 2026.**
- Merchant dashboard: "reimbursed to you" / "charged to you" totals only, no names.
- Admin: monthly settlement view + "Owed to BinPerks" by merchant. (Generated invoice document not built — pinned.)

---

## Member Reactivation (Phase 5 — live Oct 13, 2026)

**Route:** `app/api/cron/member-reactivation/route.ts` — daily `0 14 * * *` (10:00 AM Eastern)
**Kill switch:** `REACTIVATION_CRON_ENABLED` (Vercel, plain var, production + preview). Only the exact string `"true"` runs the job; anything else = paused (reads nothing, writes nothing, sends nothing). Set back to `"true"` Oct 13, 2026.
**Secret:** `CRON_SECRET` (Sensitive)

**Rules:**
- Applies to all members, Free and VIP, including former VIPs. Account must be 30+ days old.
- **Day 30** with no stamp → reminder, no coupon.
- **Day 60** with no stamp → reminder + **$2 coupon**, 14-day expiry, funded by origin store (house origin → BinPerks pays), settles like any coupon.
- $2 coupon **once per member, ever**. Skipped (message still sent) if the member holds any unused coupon.
- Nothing after day 60. If member returns, stage resets to 0; later quiet spells restart day 30/60 messages (no second coupon).
- Expired coupons flip to `expired` and disappear from Rewards tab.
- Columns: `members.reactivation_stage`, `reactivation_stage_at`, `reactivation_coupon_issued_at`; `rewards.expires_at`. (`reactivation_sent_at` is legacy.)
- Webhook payload to `GHL_MEMBER_REACTIVATION_WEBHOOK_URL`: `phone, firstName, lastName, email, reactivation_stage (day_30|day_60), coupon_added (true|false), coupon_value, coupon_expires_in_days`.
- UI: Rewards tab shows $2 coupon with days-left countdown; stamp tool shows it redeemable; admin Reactivation section (sent, coupons added, redeemed, rate) + At-Risk list (21–29 days); merchant "Reactivation coupons redeemed" total.

**GHL "BinPerks Member Reactivation" workflow (tested Oct 13, 2026):**
1. Trigger: Inbound Webhook
2. Find Contact by phone (`{{inboundWebhookRequest.phone}}`)
   - **Contact Not Found → nothing (workflow ends). NEVER create a contact.**
3. If/Else: `coupon_added` **is** `true`
   - **Yes:** SMS "We miss you! We've added a $2 coupon to your account. Visit any BinPerks participating store to use it." + email
   - **None:** SMS "We miss you! Stop by any participating BinPerks store to keep earning rewards." + email
4. Settings: **Allow re-entry ON**
- Branch on `coupon_added`, not on `day_60` (a day-60 member already holding a coupon gets no $2).

---

## Perks System (menu-only — live Oct 18, 2026, commit `83ef022`)

**Rule:** merchants pick perks **only from the BinPerks perk menu** (dropdowns — no free-text boxes). New ideas go through **Submit a new perk** → BinPerks review.

**Slots per location**
| Tier | Slots | Required |
|---|---|---|
| Starter (all members) | up to 3 | Starter perk 1 |
| VIP (VIP only) | up to 5 | VIP perks 1, 2, 3 |

- VIP members get **both** Starter and VIP perks. Starter members see VIP perks **greyed** behind "Upgrade to VIP to unlock these" — **confirmed keep (Oct 18)**, it's the upgrade hook. Do not remove.
- Any menu perk can go in either tier — the **slot** decides who gets it (no tier column on the menu).
- A filled slot is **live immediately on save**; an empty slot is off. Perks carry over — nothing expires them.

**Menu** (`perk_menu`, 20 options): Discounts (7) / Shopping Bags (2) / Fill-A-Bag (4) / Access (5) / Events (2) — Bags split Oct 18 (migration `split_bags_perk_group`). Variants are separate options (e.g., Fill-A-Bag ×4). Includes: Birthday 5% / 10%; Retail-Priced Items 10 / 15 / 20%; BOGO on $1 / $5 day; Free Shopping Bag on $1 / $0.50 day; Fill-A-Bag $20 / $25 on $1 / $0.50 day (1 hour); Express Line; Early Entry on restock / truckload day; Exclusive Bins $25 / $50; Truckload Day Freebie $25 / $50.
- Menu wording is **snapshotted** onto the store's perk row.
- **Retire** (admin): removed from the dropdown; stores already using it keep it. No delete (rows are referenced). Admin shows "In use at N slots".

**Submissions** (`perk_submissions`): merchant submits title, description, note → **Pending** → admin **Approve** (can edit wording + choose group; reviewed wording joins the shared menu **permanently**, names **no store**) or **Decline** (reason required, shown word for word). Merchant gets an email either way and adds the approved perk themselves. Admin gets an alert email (links to dashboard → Perks tab; no `?tab=` deep links).
- ⚠️ Emails untested end to end (no `RESEND_API_KEY` locally) — watch the first real submission.

**Review rules (approve only if all true)** — also shown read-only above Approve/Decline in the admin queue (`lib/perk-menu.ts`):
- Every member can earn it with their **own visit** — nothing that depends on other people (share counts, group goals, "if X people…")
- No social media actions (shares, likes, follows, posts, tags) — also against Facebook's promotion rules
- Outcome is known at the register — no chance, no waiting to find out
- Doesn't name or credit another store or imply competitors

**Decline template** (merchant sees it word for word — swap the reason line as needed):
> Thanks for the idea! We can't add this one. Perks have to be something every member can earn with their own visit, and this one depends on how many people share a Facebook post, which the member doesn't control. Facebook's rules also don't allow rewards for sharing posts. Try a menu perk like Retail-Priced Items 10% off or BOGO on $1 day instead, or send us another idea anytime.

**Hide** (admin): reason required; perk disappears from members; merchant sees it hidden with the reason.

**Legacy perks:** all 21 pre-menu rows kept their wording (`menu_perk_id` null), shown as "Your current perk: …" until the merchant picks a menu option (no way back after).

**Banned:** no chance-based perks (raffles, drawings, sweepstakes, chance giveaways, spin-to-win, scratch-offs, mystery prizes). No social-media perk. Never credit other stores or imply competitors in perk wording.

**Code:** `lib/perk-menu.ts`, `api/merchant/perk-menu`, `api/merchant/perk-submissions`, `api/merchant/perks`, `api/admin/perk-menu`, `api/admin/perk-submissions`, `api/admin/perks`, `PerksAdminTab.tsx`, `DashboardTabs.tsx`, member `api/member/stores/[storeId]/perks`. Test: `scripts/e2e-perk-menu.mjs` (50/50; cleanup only touches its own `ZZ%` rows — real submissions are left alone). `SuggestedPerks.tsx` + `/api/merchant/suggested-perks` deleted.

---

## Stamp Rules

- **Same-day rule:** one visit per location per day (multipliers apply)
- **Referral stamps:** exempt from same-day rules, flat 2 stamps regardless of tier
- **Member-to-member referral:** both earn 2 stamps each when the referred member earns their first visit stamp ✅
- **Register QR signup:** 1 auto stamp on signup via `/in-store_at-the_register` ✅
- **Merchant social referral:** 0 stamps at signup
- **Referral bonus stamps** credited to BinPerks house store (not merchant store)
- The stamp tool has nothing to do with referral links — never mix the two.

---

## Join Link Structure

- **Social media:** `app.binperks.com/join/[storeKey]` — 0 stamps
- **Register QR:** `app.binperks.com/join/[storeKey]/in-store_at-the_register` — 1 auto stamp on new member signup

---

## GHL Webhooks (Live)

| Env Var | Purpose | Status |
|---|---|---|
| `GHL_MAGIC_LINK_WEBHOOK_URL` | Member OTP SMS | ✅ |
| `GHL_MEMBER_CREATED_WEBHOOK_URL` | New member onboarding | ✅ |
| `GHL_MERCHANT_CREATED_WEBHOOK_URL` | No longer fires — retire this GHL workflow | ⚠️ |
| `GHL_MERCHANT_ACTIVATED_WEBHOOK_URL` | Merchant activated after agreement acceptance | ✅ |
| `GHL_MERCHANT_WELCOME_WEBHOOK_URL` | Merchant welcome (Esteban sends manually) | ✅ |
| `GHL_MERCHANT_OTP_WEBHOOK_URL` | Deactivated — Supabase handles merchant sign-in | ⚠️ |
| `GHL_MEMBER_VIP_UPGRADE_WEBHOOK_URL` | Member upgrades to VIP | ✅ |
| `GHL_MEMBER_VIP_CANCEL_WEBHOOK_URL` | Member cancels VIP | ✅ |
| `GHL_MEMBER_REFERRAL_BONUS_REFERRER_WEBHOOK_URL` | Referrer earns 2 bonus stamps | ✅ |
| `GHL_MEMBER_REFERRAL_BONUS_REFERRED_WEBHOOK_URL` | Referred member earns 2 bonus stamps | ✅ |
| `GHL_MEMBER_GOT_STAMP_WEBHOOK_URL` | Member got a stamp + review request 1hr later | ✅ |
| `GHL_MERCHANT_ABANDONED_CHECKOUT_WEBHOOK_URL` | Internal alert to Esteban on abandonment | ✅ |
| `GHL_MEMBER_REACTIVATION_WEBHOOK_URL` | Day 30 / day 60 reactivation (Sensitive) | ✅ |

**GHL limitations & rules:**
- One contact per workflow — separate workflows for each recipient.
- Always **save the inbound webhook trigger** — the URL only changes if the trigger is deleted and re-added. Switching Draft/Publish does not change it.
- Custom field "Last Awarding Store" — updated on every stamp via Update Contact Field step.
- All GHL webhooks use `waitUntil` from `@vercel/functions`.

---

## Active GHL Workflows

| Workflow | Status |
|---|---|
| BinPerks Member Got a Stamp & Review Request | ✅ Published |
| BinPerks Member OTP (SMS only) | ✅ Published |
| BinPerks Member Onboarding | ✅ Published |
| BinPerks Member Referral Bonus - Referred | ✅ Published |
| BinPerks Member Referral Bonus - Referrer | ✅ Published |
| BinPerks Member VIP Cancellation | ✅ Published |
| BinPerks Member VIP Upgrade | ✅ Published |
| BinPerks Member Reactivation (day 30/60 branches) | ✅ Published |
| BinPerks Merchant Activation | ✅ Published |
| BinPerks Merchant Onboarding | ✅ Published |
| BinPerks Merchant Welcome | ✅ Published |
| Merchant Abandoned Checkout — Internal Alert | ✅ Published |
| Award Referral Stamps – On Join | ❌ Deactivated |
| Award Referrer Bonus | ❌ Deactivated |
| BinPerks Member Review Request | ❌ Deactivated |
| BinPerks Member Signup | ❌ Deactivated |
| Stripe Merchant Payment Webhook | ❌ Deactivated |
| BinPerks Merchant OTP | ❌ Deactivated |

⚠️ Review GHL copy (Member Onboarding, upgrade nudges) for anything implying Free stops at 20 or is a trial.

---

## Member Got a Stamp — GHL Workflow

1. Trigger: Inbound Webhook
2. Find Contact by phone
3. Update Contact Field: Last Awarding Store = `{{inboundWebhookRequest.storeName}}`
4. Send SMS (under 160 chars): "Stamp earned at {{contact.last_awarding_store}}! Check your BinPerks app to see your progress."
5. Send Email: subject "You just got a stamp"
6. Wait 1 hour
7. If `{{inboundWebhookRequest.feedbackUrl}}` NOT empty:
   - Send SMS review request
   - Send Email review request

**Review link rules:**
- Only generated if store has `google_review_url` set
- Once per store per 30 days per member (`feedback` table, `source = 'review_request'` only)
- Expires at midnight of the visit day in the store's timezone
- Tracked via `app.binperks.com/r/[code]`
- `feedback.source = 'review_request'` for new rows, `'rating'` for V2 rows

---

## Crons

| Route | Schedule | Purpose |
|---|---|---|
| `/api/cron/merchant-inactivity` | `0 7 * * *` | Marks merchants inactive 30 days after unpaid failed payment |
| `/api/cron/member-reactivation` | `0 14 * * *` | Day 30 / day 60 reactivation (gated by `REACTIVATION_CRON_ENABLED`) |

Both return 401 without `CRON_SECRET`.

---

## Stripe Webhooks

| Webhook | Status |
|---|---|
| BinPerks Merchant Webhook | ✅ Working (also records `payment_failed_at`) |
| BinPerks Member VIP Webhook | ✅ Working |
| BinPerks GHL (native) | ❌ 100% failure rate — GHL-side issue, non-blocking |

---

## Supabase Storage Buckets

| Bucket | Contents | Access |
|---|---|---|
| `store-logos` | Store logo images | Public |
| `bin-photos` | Merchant bin photos | Private |
| `scan-photos` | Member scan photos | Private |
| `merchant-w9` | W-9 PDFs | Private |
| `social-media-graphics` | Admin social media graphics | Private |
| `content-images` | Sponsored Perks/Shop From Home/Deals Near You images | Private |
| `poster-templates` | Poster PNG templates (up to 10) | Private |
| `marketing-templates` | Base artwork + lifestyle images for all marketing materials | Private |
| `representative-images` | Cached product images from scanner | Private |

---

## Marketing Materials (Merchant Dashboard)

Fully managed from **admin → Marketing Templates tab**.

**"At The Register"** *(register URL — 1 stamp awarded)*
- Table Tent — PDF, 2 on 1 landscape 8.5x11, B&W
- Countertop Display — PDF, 6 on 1 landscape 8.5x11
- Countertop Photo Print — JPG, 4x6 (Walmart photo print)

**"In-Store Signage"** *(social URL — 0 stamps)*
- Store Posters — PDF, **10 pages** portrait 8.5x11
- ~~Window Cling Decals~~ — retired Oct 18 (`marketing_materials` row deleted; template artwork + bucket file kept)
- ~~Storefront Photo Print~~ — removed

Font rendering: opentype.js with Montserrat Bold (no fontconfig on Vercel).

---

## Admin-Managed Content

| Section | Tab | Notes |
|---|---|---|
| Sponsored Perks | Sponsored Perks | Image (1:1, hover/hold reveal) + header + description + CTA |
| Shop From Home | Shop From Home | Same |
| Deals Near You | Deals Near You | Same |
| BinPerks Promos | Promos | Home tab only |
| Social Media Graphics | Social Media | Up to 10 images + caption, auto-substitutes referral link |
| Marketing Templates | Marketing Templates | Full content manager |
| Perks | Perks | Submissions queue, perk menu (retire), live perks (hide) — replaced Suggested Perks |
| Pre-setup stores | Pre-setup stores | Create hidden store, print materials, finish-setup link, delete |
| Announcements | Announcements | In-app alerts only |

**Admin analytics (new Oct 12):** Inactive Merchants list, origin transfer counts, monthly settlement + "Owed to BinPerks", Reactivation section + At-Risk list.

---

## Member Dashboard Tabs

`HOME | REWARDS 🎫 | SCAN | STORES 📍 | MORE ⭐`

- **Home:** Bin Stores Near Me (horizontal scroll), pinned Beyond the Bins, BinPerks Promos, support contact at bottom
- **Rewards:** Tier progress bar, BinPerks Club tier cards, referral link, coupons (incl. $2 reactivation coupon with countdown)
- **Scan:** Photo Identify (AI scanner), My Finds
- **Stores:** Store cards with logo reveal, Directions, Bin Price, What's in Bins, View Perks
- **MORE:** Deals Near You → Shop From Home → Sponsored Perks, "hover mouse or long-hold to learn more"

---

## Store Card Layout

```
🏪 Store Name        ❤️
City, FL
"Store message" (italic)
[Directions]  [Today's Bin Price: $X]
[What's in the Bins]  [View Store Perks]
```

Logo: `aspect-ratio: 1/1`, `object-fit: cover`, hover/long-hold reveals message.

---

## Reveal Container Rules

- `aspect-ratio: 1/1`, `object-fit: cover`
- 300ms fade hover (desktop), 350ms long-hold (mobile)
- Applies to: Store cards, Bin Stores Near Me, Sponsored Perks, Shop From Home, Deals Near You, Marketing material cards

---

## Merchant Dashboard

- Members tab REMOVED — aggregate only
- Overview: stamps, coupons, members attributed, VIP members, review clicks, coupons reimbursed/charged (totals), reactivation coupons redeemed
- Copy no longer says members "stay yours permanently"
- Perks tab: Starter + VIP dropdown slots from the perk menu, plus "Submit a new perk" and submission status
- Marketing tab: At The Register + In-Store Signage + Social Media Post + join link (bottom)
- Onboarding checklist: 13 items (`lib/merchant-onboarding-checklist.ts`). POS item: "Add the BinPerks Coupon amounts ($2, $5, $7, $10, $12, $15) to your point-of-sale system so cashiers can apply them when members redeem rewards. The $2 coupon is used for reactivation campaigns."

---

## Merchant Landing Page (`merchant.binperks.com`)

- Code: `app/merchant/MerchantLanding.tsx`, `app/merchant/landing-metadata.ts`, `middleware.ts`.
- Copy themes: inactive customers come back, no more chasing Google reviews, referrals, fewer open boxes, communicate with all BinPerks members.
- Even number of FAQs. Weekly reports and Facebook reviews **not built** → never advertise them.
- Meta description and tier subtitle: keep as is for now.
- ⚠️ Esteban is not yet satisfied with the copy (pinned).

## Member Homepage (`binperks.com`, preview `app.binperks.com/home`)

- Code: `app/home/page.tsx`, `components/marketing/BennyMascot.tsx` (placeholder — set `BENNY_IMAGE_SRC` when the Benny file arrives).
- Perks dropdowns, accordion FAQ (incl. VIP FAQ), "more stores joining".
- ⚠️ Member homepage update prompt on hold until Esteban sends his image.

---

## Unit Economics (per store)

- Consumables ≈ **$11/store/month** against the $99.99 fee; print kit ≈ $54 one-time per location.
- One or two VIP members cover a store's costs. Profitable at 100 stores.

## Sponsors (pinned)

- Pricing page: **Standard $25 / Featured $50**, 3 featured spots, founding rate.
- App Home tab: 3 featured spots + "See more"; admin limit of 3. List-row design pending.

---

## Legal Documents

| Document | Status |
|---|---|
| Merchant Agreement **V3.6** | ✅ Final (Effective Date Oct 12, 2026; cursive signature image; draft header + drafting notice removed). Adds §1.15–1.17, §5.6 inactivity & transfer, rewritten §6.3 coupon funding/backstop, §6.3.1 cycles & tiers, §6.3.2 $2 reactivation coupon. Old §5.6–5.11 renumbered 5.7–5.12. **Updated Oct 17–18:** all initial blanks removed (one acknowledgment sentence above signatures); **§6.2 Merchant Control of Perks** = Starter min 1 / max 3, VIP min 3 / max 5, perks from the BinPerks menu, submissions reviewed by BinPerks, **no chance-based perks**, BinPerks may decline/hide/remove; **Oct 18:** each perk must be earnable by the Member's own visit/purchase and known at the visit — no perks that depend on others' actions (share/like/follower/attendance counts), no social media actions (incl. reviews), no naming other merchants; Order Form "Merchant Perks" row matches. Blank page before Exhibit B removed (14 pages). Order Form "DBA / Store Brand" row → "Store Name" + new "Store Website (optional)" row (Oct 18). **Oct 18:** §5.11 taxpayer info via Connected Account (W-9 optional backup); §17.6 rewritten for electronic acceptance; acceptance lines "By signing below or accepting electronically". Live in-app as `lib/agreements/v3-6.ts`; source docx at `frontend/legal/`. |
| Merchant Agreement V3.5 | Signed by Thomas and Mark Sept 5, 2026. |
| `/terms/member` | ✅ V3.6 live; adds "Store perks are offered and honored by each participating store. Perks never require you to share, like, follow, post, or leave a review." (Oct 18) |
| `/terms/merchant` | ✅ V3.6 live — states Agreement V3.6 governs; DocuSeal wording replaced with in-app acceptance (Oct 18); Member Perks section has the menu + review rules (own visit, no group goals, no social media/reviews, known at register, no naming other stores) (Oct 18). Numbering audited clean; 13.4a stays as is. |
| `/terms/privacy` | ✅ V3.6 live Oct 12, 2026 |

Never put promo codes in any legal document.

---

## Session Management

- Sessions use **cookies** (NOT localStorage) — server-readable, 400-day max-age
- DO NOT move to localStorage — breaks all server-side auth
- Sessions refresh server-side via middleware — not subject to Safari's 7-day JS cookie cap
- No time-box or inactivity timeout set in Supabase
- Members signed out: usually Safari vs installed PWA icon, or iPhone cleared site data after 7+ days of inactivity

---

## Known Issues (Low Priority)

- Supabase SMTP sends merchant sign-in from `noreply@feedback.binperks.com` — cosmetic only, leave as-is (GHL owns feedback.binperks.com DNS)
- `feedback.binperks.com` Resend domain shows "failed" but still delivers — leave as-is
- BinPerks GHL native Stripe webhook — 100% failure rate, GHL-side issue, non-blocking
- Several stale Vercel env vars exist — harmless, leave as-is
- Member double OTP email — resolved: it was the recipient's email provider, not BinPerks

---

## Open To-Do (as of Oct 18, 2026)

1. Confirm the agreement PDF email arrives at support@ on the first real new merchant
2. Delete the test print-kit email
3. Liquidation Motivation LLC: complete Stripe Connect onboarding before Oct 31 settlement
4. Ask accountant to confirm Stripe's 1099 filing covers Merchant Share (which form), then turn on Stripe Connect tax reporting
5. Member homepage updates prompt (waiting on Esteban's image)
6. Review `app.binperks.com/home`
7. HostGator DNS switch + SPF cleanup
8. First pre-setup visit — check the pre-fill
9. Check GHL copy for anything implying Free stops at 20
10. Run first month-end settlement — Oct 31, 2026
11. Check the EstaBins inbox for the decline email on the "500 FB shares" submission (declined Oct 18) — confirms perk emails work
12. Member referral automation
    - GHL "BinPerks Friend Just Joined" workflow first. SMS: "Your friend just joined BinPerks! Once they earn their first stamp, you'll both get 2 bonus stamps."
    - Monthly referral email cron, 30 days after join, all members, email only, rotating subjects: "Invite a friend to BinPerks", "Know someone who loves bin stores?", "Your referral link is waiting", "Bring a friend to the bins", "Someone you know would love this", "Share the bins with a friend"
    - Referral count on Rewards tab

**Calendar:** Renew Anthropic API key — Dec 30, 2026.

---

## Pinned / Future

- "Finish your signup" email for pre-setup stores (pre-filled; includes "Save this email for when you're ready")
- Attorney look at in-app acceptance + §17.6 (after build)
- Clean up `D:\BinPerks\` and all subfolders (Claude Code): review every file, remove clutter/duplicates/stale drafts — list proposed deletions for Esteban's approval first; never delete `.vercel-token`, `.env*`, CLAUDE.md, `legal/`, or anything in git without checking
- Download The Nieghborhood LLC's signed PDF from DocuSeal (only one ever), cancel DocuSeal, then have Claude Code remove the webhook route, `/signup/confirm` and `DOCUSEAL_*` env vars
- Sponsors: pricing page + 3 featured Home-tab spots + "See more" + admin limit of 3 (list-row design pending)
- Edit link for pre-setup stores (keep original QR codes)
- Benny artwork files
- Facebook review requests
- Stripe $200 test price
- App link in the stamp SMS: "Stamp earned at {{store}}! Check your BinPerks app to see your progress." + link
- Merchant landing copy — not satisfied yet
- Generated invoice document for "Owed to BinPerks"
- Store approval before network visibility
- White-label tier
- Member survey at 1,000 members — **email via GHL** (never in-app, never Google Forms/Typeform)
- Scanner improvements: barcode via Google/Amazon hybrid, guidance tips, 👍👎 accuracy, cart/bins analytics
- Badge system (incl. Top Referrer)
- Low priority: duplicate merchant emails / one login for multiple businesses
- Show store website to members (store card) — later

## V4 & Future Features

- **Badge System** — RDR2-style, open to ALL members, progress never resets, build after 20+ stores + Benny artwork
- **BinPerks YouTube** — two channels (Members + Merchants)
- **Member scanner tutorial** — video linked from Photo Identify
- **Scanner in-store only** — design decision needed
- **Auction webhook integrations** — 1 stamp per auction session won
- **GPS store detection**
- **Merchant notification blast** — free once/week
- **Advertiser self-serve portal**
- **Vacation Giveaways** — FL sweepstakes attorney review needed
- **BinPerks Arcade** — Benny games
- **Merchant social referral link tracking**

## V5

- **Cashier QR scan** — member displays QR, cashier scans to award stamp
- **BinPerks Member Exchange** — marketplace for member finds

---

## Merchant-to-Merchant Referrals

No automated system. Manually offer goodwill discount via Stripe coupon. Case-by-case.

---

## Principles

- Always give the full checklist after every step — never ask "what's next" without it
- List questions plainly so Esteban can answer quickly; rewrite test wording in plain language
- Always give complete file contents, never partial snippets
- Placeholder text: generic examples only (Acme Bins Downtown, XYZ Liquidation LLC)
- No stamp expiration, ever
- No subscription pause for merchants
- Members never identified to merchants individually — aggregate only
- GHL is the communications layer only — use GHL for forms/surveys, never Google Forms or Typeform
- GHL workflows never create contacts
- `STAMP_EVENTS` frozen — `activity_events` is sole source of truth
- Sensitive env vars marked Sensitive in Vercel
- Cashier phones: `staff_users.phone`, internal only, never to GHL
- SMS: always one segment (under 160 characters); no spam triggers in email subjects
- Say "encourage", never "push", in copy and instructions
- `waitUntil` for all fire-and-forget GHL webhooks
- Review gating is illegal (FTC)
- Stripe products must be standalone — no sub-products
- Promo codes never appear in UI or legal/merchant documents
- Merchant social referral: 0 stamps. Member-to-member: 2 stamps each. Register QR: 1 stamp.
- Before any destructive DB action: verify IDs, check all referencing tables (including cascades), then act
- Copy: never say "loyalty program"; minimize the word "app"; say "inactive", not "quiet"
- Never advertise features that aren't built
- Perks: menu only, no chance-based perks, never credit other stores or imply competitors
- Do not discuss Thomas and Mark's agreement
