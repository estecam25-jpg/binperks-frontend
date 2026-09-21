/**
 * Member-to-member referral bonus: 2 stamps each, once, on the referred
 * member's first visit.
 *
 * SERVER ONLY — takes the service-role client.
 *
 * ── When it fires ──────────────────────────────────────────────────────────
 * Called after every successful visit stamp, from both places a visit stamp
 * can be earned: the cashier stamp tool (/api/stamp) and a register-QR signup
 * (/api/join/create). Both matter. A signup can carry a referrer AND come
 * through the register QR in the same request, and the referrals row is
 * written before that signup's stamp — so for those members the register
 * stamp IS their first visit, and a hook in /api/stamp alone would have
 * spent it without ever paying the bonus.
 *
 * "FIRST VISIT" IS A PENDING REFERRAL, NOT A ROW COUNT. The referral row is
 * created at signup, before any visit, so the first visit after signup is the
 * first to find it pending. Counting store_visit rows instead would be wrong in
 * two ways: the register-signup stamp is a store_visit row, and so are the
 * bonus rows this writes.
 *
 * ── Exactly once ───────────────────────────────────────────────────────────
 * Stamps are worth money, so this is idempotent at two layers:
 *
 *   1. CLAIM. The referral is marked awarded with a compare-and-set
 *      (UPDATE ... WHERE bonus_awarded = false). Two racing requests cannot
 *      both win it; the loser does nothing.
 *   2. BACKSTOP. A partial unique index on activity_events refuses a second
 *      bonus row for the same member and referral. If an award half-fails, the
 *      claim is released so the next visit retries — and the member who was
 *      already paid is refused by the index rather than paid twice.
 *
 * ── Where the stamps are recorded ──────────────────────────────────────────
 * NOT stamp_events, which is frozen. activity_events, as activity_type
 * 'store_visit' because that is what every reader sums — the same convention
 * the register-signup stamp uses. activity_data.source says 'referral_bonus'.
 *
 * ATTRIBUTED TO THE BINPERKS HOUSE STORE, not a merchant's. A bonus is not a
 * visit to anyone's shop, and a real merchant's id on it would be read as one:
 * the merchant dashboard counts each row as a visit, and the onboarding
 * checklist ticks "stamp tool tested" off any row with the merchant's id. The
 * house store has no physical location and no cashiers, so a row there can
 * only ever be a bonus. origin_* stays the member's own — that attribution is
 * permanent and a bonus does not touch it.
 *
 * NO visits ROW, which is what "exempt from same-day rules" means in practice:
 * the once-per-day guard lives on visits, and a bonus never takes it.
 *
 * NOT MULTIPLIED. Tier multipliers apply to visit stamps only, so a Diamond
 * referrer gets 2, not 10.
 *
 * ── GHL ────────────────────────────────────────────────────────────────────
 * After every database write, and never able to undo one. Awaited rather than
 * fire-and-forget: on Vercel an un-awaited fetch is killed when the handler
 * returns (see lib/ghl-webhook), which is how merchant sign-in codes were being
 * lost. postToGhl never throws and gives up after 5s, so GHL being down costs
 * at most that on the one stamp that triggers a referral, and never the stamps.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { postToGhl } from '@/lib/ghl-webhook'
import { createAlert, couponReadyAlert, tierUpAlert } from '@/lib/member-alerts'
import { BINPERKS_HOUSE_MERCHANT_ID, BINPERKS_HOUSE_STORE_ID } from '@/lib/binperks-origin'

/** Two, for both sides. Never multiplied by tier. */
export const REFERRAL_BONUS_STAMPS = 2

type Admin = SupabaseClient

interface BonusMember {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  email: string | null
  total_stamps: number | null
  subscription_status: string | null
  status: string | null
  is_blacklisted: boolean | null
  origin_store_id: string | null
  origin_merchant_id: string | null
}

const MEMBER_COLUMNS =
  'id, first_name, last_name, phone, email, total_stamps, subscription_status, ' +
  'status, is_blacklisted, origin_store_id, origin_merchant_id'

/** What happened for one side of the referral. */
type SideOutcome =
  | 'awarded'     // stamps written in this call
  | 'already'     // stamps were already there — a retry after a partial failure
  | 'ineligible'  // deliberately not paid; see eligibility()
  | 'failed'      // a real error; the claim is released so it retries

export interface ReferralBonusResult {
  /** Stamps the REFERRED member received in this call — 0 or 2. The stamp
   *  route reports this back so the success screen can say so. */
  referredStamps: number
  referred: SideOutcome | 'none'
  referrer: SideOutcome | 'none'
}

const NOTHING: ReferralBonusResult = { referredStamps: 0, referred: 'none', referrer: 'none' }

/**
 * Whether a member may receive bonus stamps, or why not.
 *
 * THE SAME GATE THE STAMP TOOL APPLIES, not a new rule. A member the cashier
 * would be refused permission to stamp does not get stamps through the back
 * door of someone else's visit:
 *   - inactive or blacklisted members are never stamped;
 *   - a Starter who has already used their one lifetime coupon and is past 20
 *     stamps is blocked (Core Rule #12) — the cap exists to make them upgrade.
 * Without an Origin Store there is no activity_events row to write at all.
 */
async function eligibility(admin: Admin, m: BonusMember): Promise<string | null> {
  if (m.status !== 'active') return 'inactive'
  if (m.is_blacklisted) return 'blacklisted'
  if (!m.origin_store_id || !m.origin_merchant_id) return 'no_origin'

  if (m.subscription_status === 'free' && (m.total_stamps ?? 0) > 20) {
    const { count } = await admin
      .from('rewards')
      .select('*', { count: 'exact', head: true })
      .eq('member_id', m.id)
      .eq('status', 'redeemed')
    if ((count ?? 0) >= 1) return 'starter_capped'
  }
  return null
}

/**
 * Writes one member's bonus: the two stamp rows, the running total, and any
 * coupon or tier-up those two stamps cause.
 *
 * Coupons and tiers are handled HERE, not left for the next visit, because the
 * stamp route detects a coupon by comparing the total before and after its own
 * stamp. A bonus that carried someone from 19 to 21 with no coupon issued would
 * never be caught later — the crossing would already be behind them, and the
 * coupon lost for good. The rules below are the stamp route's, unchanged.
 */
async function applyBonus(
  admin: Admin,
  m: BonusMember,
  referralId: string,
  role: 'referred' | 'referrer',
): Promise<SideOutcome> {
  const blocked = await eligibility(admin, m)
  if (blocked) {
    console.warn(`[referral-bonus] ${role} ${m.id} not paid: ${blocked}`)
    return 'ineligible'
  }

  const now = new Date().toISOString()

  // Two rows of one stamp each, in ONE insert statement — so they land
  // together or not at all, and the unique index refuses both on a retry.
  const rows = [1, 2].map(slot => ({
    member_id:          m.id,
    store_id:           BINPERKS_HOUSE_STORE_ID,
    merchant_id:        BINPERKS_HOUSE_MERCHANT_ID,
    origin_store_id:    m.origin_store_id,
    origin_merchant_id: m.origin_merchant_id,
    participant_type:   'bin_store',
    activity_type:      'store_visit',
    activity_data:      { source: 'referral_bonus', referral_id: referralId, role, slot: String(slot) },
    stamps_awarded:     1,
    multiplier_applied: 1,     // never multiplied — bonus stamps are not visit stamps
    effective_stamps:   1,
    occurred_at:        now,
    cashier_id:         null,
    migrated_from:      null,
    source_record_id:   referralId,
  }))

  const { error: insertError } = await admin.from('activity_events').insert(rows)
  if (insertError) {
    // The backstop index firing: this member was paid on an earlier attempt
    // that failed somewhere else. Their total was updated then, so nothing
    // more to do — and nothing to announce twice.
    if (insertError.code === '23505') return 'already'
    console.error(`[referral-bonus] ${role} ${m.id} stamp insert failed:`, insertError)
    return 'failed'
  }

  // Read the total fresh rather than trusting the copy loaded earlier: for the
  // referred member the stamp route updated it moments ago.
  const { data: fresh } = await admin
    .from('members').select('total_stamps').eq('id', m.id).single()
  const before = fresh?.total_stamps ?? m.total_stamps ?? 0
  const after  = before + REFERRAL_BONUS_STAMPS

  const { error: totalError } = await admin
    .from('members').update({ total_stamps: after }).eq('id', m.id)
  if (totalError) {
    // The stamps ARE recorded; only the denormalised counter is behind, and it
    // can be recomputed from activity_events. Same position the register-signup
    // stamp takes. Reporting failure would release the claim and retry into
    // the unique index for nothing.
    console.error(`[referral-bonus] ${role} ${m.id} total_stamps update failed:`, totalError)
    return 'awarded'
  }

  // ── Coupon — the stamp route's rules, unchanged ──────────────────────────
  const crossed = Math.floor(after / 20) > Math.floor(before / 20)
  if (crossed) {
    const isFree = m.subscription_status === 'free'
    let exhausted = false
    if (isFree) {
      const { count } = await admin
        .from('rewards')
        .select('*', { count: 'exact', head: true })
        .eq('member_id', m.id)
        .eq('status', 'redeemed')
      exhausted = (count ?? 0) >= 1
    }

    if (!exhausted) {
      // Value by tier AFTER the award, as the stamp route does.
      const value =
        after >= 2000 ? 15 :
        after >= 750  ? 12 :
        after >= 200  ? 10 :
        isFree ? 5 : 7

      const { error: rewardError } = await admin.from('rewards').insert({
        member_id:             m.id,
        merchant_id:           BINPERKS_HOUSE_MERCHANT_ID,
        store_id:              BINPERKS_HOUSE_STORE_ID,
        issued_at_location_id: BINPERKS_HOUSE_STORE_ID,
        coupon_value:          value,
        // An ordinary 20-stamp coupon. That some of the twenty came from a
        // referral does not make it a different kind of reward.
        reward_type:           'visit_reward',
        status:                'earned',
        earned_at:             now,
      })
      if (rewardError) {
        console.error(`[referral-bonus] ${role} ${m.id} coupon insert failed:`, rewardError)
      } else {
        await admin.from('members').update({ coupon_due: true }).eq('id', m.id)
        await createAlert(admin, couponReadyAlert(m.id, value, null))
      }
    }
  }

  // ── Tier — VIP only. A Starter at 199 → 201 is still a Starter: every tier
  //    above Starter requires the subscription. ─────────────────────────────
  if (m.subscription_status === 'vip') {
    const tier =
      (after >= 2000 && before < 2000) ? 'diamond' :
      (after >= 750  && before < 750)  ? 'gold'    :
      (after >= 200  && before < 200)  ? 'silver'  : null
    if (tier) await createAlert(admin, tierUpAlert(m.id, tier, null))
  }

  return 'awarded'
}

/** Puts the referral back to pending so the member's next visit retries it.
 *  Whoever was already paid is refused by the unique index on that retry. */
async function release(admin: Admin, referralId: string) {
  const { error } = await admin
    .from('referrals')
    .update({ bonus_awarded: false, bonus_awarded_at: null, qualified_at: null, status: 'pending' })
    .eq('id', referralId)
  if (error) console.error(`[referral-bonus] could not release claim on ${referralId}:`, error)
}

/**
 * Pays a referral bonus if this member has one waiting. Safe to call after
 * every visit stamp: with nothing pending it is one indexed read and returns.
 *
 * NEVER THROWS, and never undoes the visit that triggered it. Callers await it
 * after their own stamp is fully written.
 */
export async function awardReferralBonusIfDue(
  admin: Admin,
  referredMemberId: string,
): Promise<ReferralBonusResult> {
  // Set once this call owns the referral. If anything below throws, the catch
  // gives the claim back rather than leaving the referral marked paid with no
  // stamps behind it. Releasing is always safe: a retry of a side that was
  // already paid is refused by the unique index, not paid twice.
  let claimedId: string | null = null

  try {
    // The oldest pending referral. One member signs up once, so there is one —
    // but nothing in the schema forbids a second, and only one referrer can be
    // the person who actually brought them in.
    const { data: pending } = await admin
      .from('referrals')
      .select('id, referrer_member_id, referred_member_id')
      .eq('referred_member_id', referredMemberId)
      .eq('status', 'pending')
      .eq('bonus_awarded', false)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!pending) return NOTHING

    // ── 1. Claim ───────────────────────────────────────────────────────────
    // Compare-and-set: only a request that finds bonus_awarded still false
    // gets a row back. A racing request gets nothing and stops here.
    const now = new Date().toISOString()
    const { data: claimed, error: claimError } = await admin
      .from('referrals')
      .update({ bonus_awarded: true, bonus_awarded_at: now, qualified_at: now, status: 'qualified' })
      .eq('id', pending.id)
      .eq('bonus_awarded', false)
      .select('id')

    if (claimError) {
      console.error('[referral-bonus] claim failed:', claimError)
      return NOTHING
    }
    if (!claimed || claimed.length === 0) return NOTHING   // someone else won
    claimedId = pending.id

    // ── 2. Both members ────────────────────────────────────────────────────
    const ids = [referredMemberId, pending.referrer_member_id].filter((v): v is string => !!v)
    const { data: people } = await admin.from('members').select(MEMBER_COLUMNS).in('id', ids)
    const list = (people ?? []) as unknown as BonusMember[]
    const referred = list.find(p => p.id === referredMemberId)
    const referrer = pending.referrer_member_id
      ? list.find(p => p.id === pending.referrer_member_id)
      : undefined

    if (!referred) {
      await release(admin, pending.id)
      return NOTHING
    }

    // ── 3. Award ───────────────────────────────────────────────────────────
    // One after the other, not in parallel: each reads and writes its own
    // member's total, and doing them in sequence keeps the logs readable.
    const referredOutcome = await applyBonus(admin, referred, pending.id, 'referred')
    const referrerOutcome: SideOutcome | 'none' = referrer
      ? await applyBonus(admin, referrer, pending.id, 'referrer')
      : 'none'

    // A real failure on either side releases the claim, so the next visit
    // tries again. 'ineligible' does not: a blacklisted referrer is not
    // something a retry fixes, and retrying it on every visit forever would
    // just be noise.
    if (referredOutcome === 'failed' || referrerOutcome === 'failed') {
      await release(admin, pending.id)
    }

    // ── 4. GHL — after the database, and only for stamps written just now ─
    // A retry that found the stamps already there has nothing new to say.
    const calls: Promise<boolean>[] = []

    if (referrer && referrerOutcome === 'awarded') {
      const url = process.env.GHL_MEMBER_REFERRAL_BONUS_REFERRER_WEBHOOK_URL
      if (url) {
        calls.push(postToGhl(url, {
          phone:              referrer.phone,
          firstName:          referrer.first_name,
          lastName:           referrer.last_name,
          email:              referrer.email,
          referredMemberName: [referred.first_name, referred.last_name].filter(Boolean).join(' '),
          bonusStamps:        REFERRAL_BONUS_STAMPS,
        }, 'referral-bonus referrer'))
      } else {
        console.warn('[referral-bonus] GHL_MEMBER_REFERRAL_BONUS_REFERRER_WEBHOOK_URL is not set — referrer not notified')
      }
    }

    if (referredOutcome === 'awarded') {
      const url = process.env.GHL_MEMBER_REFERRAL_BONUS_REFERRED_WEBHOOK_URL
      if (url) {
        calls.push(postToGhl(url, {
          phone:       referred.phone,
          firstName:   referred.first_name,
          lastName:    referred.last_name,
          email:       referred.email,
          bonusStamps: REFERRAL_BONUS_STAMPS,
        }, 'referral-bonus referred'))
      } else {
        console.warn('[referral-bonus] GHL_MEMBER_REFERRAL_BONUS_REFERRED_WEBHOOK_URL is not set — referred member not notified')
      }
    }

    // Both at once, so GHL being slow costs one timeout rather than two.
    await Promise.all(calls)

    return {
      referredStamps: referredOutcome === 'awarded' ? REFERRAL_BONUS_STAMPS : 0,
      referred: referredOutcome,
      referrer: referrerOutcome,
    }
  } catch (err) {
    console.error('[referral-bonus] unexpected error:', err)
    if (claimedId) await release(admin, claimedId)
    return NOTHING
  }
}
