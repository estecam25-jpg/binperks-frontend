/**
 * Membership rule checks — the arithmetic, without a database.
 *
 *   node scripts/check-membership-rules.mjs
 *
 * Covers the cases the restructure turns on: a free member earning past 20
 * forever, a cycle surviving an upgrade, progression never moving while free,
 * and a visit completing two cycles at once.
 */

import { applyCycle, tierFor, cycleRemaining, COUPON_CYCLE } from '../lib/tiers.ts'

let failed = 0
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  const ok = a === e
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n        expected ${e}\n        got      ${a}`}`)
}

// ── A free member stamping 60 times ─────────────────────────────────────────
// One stamp a visit, a $5 coupon every 20, never blocked.
let cycle = 0, lifetime = 0, progression = 0
const coupons = []
for (let visit = 1; visit <= 60; visit++) {
  const tier = tierFor({ vipProgressionStamps: progression, subscriptionStatus: 'free' })
  const earned = tier.multiplier
  lifetime += earned
  const next = applyCycle(cycle, earned)
  cycle = next.cycleStamps
  for (let c = 0; c < next.couponsEarned; c++) {
    coupons.push({ atVisit: visit, value: tierFor({ vipProgressionStamps: progression, subscriptionStatus: 'free' }).couponValue })
  }
}
check('free: 60 visits = 60 lifetime stamps', lifetime, 60)
check('free: coupons at visits 20/40/60', coupons.map(c => c.atVisit), [20, 40, 60])
check('free: every coupon is $5', coupons.map(c => c.value), [5, 5, 5])
check('free: VIP progression never moves', progression, 0)
check('free: tier stays Starter', tierFor({ vipProgressionStamps: progression, subscriptionStatus: 'free' }).name, 'Free')

// ── Upgrading mid-cycle ─────────────────────────────────────────────────────
// 14 of 20 toward a $5 coupon becomes 14 of 20 toward a $7 one.
const atUpgrade = { cycle: 14, lifetime: 14, progression: 0 }
const asVip = tierFor({ vipProgressionStamps: atUpgrade.progression, subscriptionStatus: 'vip' })
check('upgrade: cycle carries over untouched', atUpgrade.cycle, 14)
check('upgrade: 6 stamps still to go', cycleRemaining(atUpgrade.cycle), 6)
check('upgrade: starts at Bronze', asVip.name, 'Bronze')
check('upgrade: cycle now worth $7', asVip.couponValue, 7)
check('upgrade: VIP progression starts at 0', atUpgrade.progression, 0)

// ── Bronze VIP visit: 2 stamps, both counters move ──────────────────────────
{
  const earned = asVip.multiplier
  const after = applyCycle(atUpgrade.cycle, earned)
  check('bronze visit earns 2', earned, 2)
  check('bronze visit: cycle 14 -> 16', after.cycleStamps, 16)
  check('bronze visit: no coupon yet', after.couponsEarned, 0)
}

// ── One visit completing two cycles ─────────────────────────────────────────
check('cycle 18 + 25 bonus = 2 coupons, 3 left', applyCycle(18, 25), { couponsEarned: 2, cycleStamps: 3 })
check('cycle 19 + 5 = 1 coupon, 4 left',         applyCycle(19, 5),  { couponsEarned: 1, cycleStamps: 4 })
check('cycle 0 + 20 = exactly 1 coupon, 0 left', applyCycle(0, 20),  { couponsEarned: 1, cycleStamps: 0 })

// ── Cancel and resubscribe ──────────────────────────────────────────────────
// Progression is a stored number; cancelling writes nothing to it, so the tier
// is whatever it was when they come back.
{
  const kept = 240
  check('cancelled: shows Starter while free', tierFor({ vipProgressionStamps: kept, subscriptionStatus: 'free' }).name, 'Free')
  check('resubscribed: back to Silver at 240',  tierFor({ vipProgressionStamps: kept, subscriptionStatus: 'vip' }).name, 'Silver')
}

// ── Thresholds ──────────────────────────────────────────────────────────────
check('199 progression = Bronze',  tierFor({ vipProgressionStamps: 199,  subscriptionStatus: 'vip' }).name, 'Bronze')
check('200 progression = Silver',  tierFor({ vipProgressionStamps: 200,  subscriptionStatus: 'vip' }).name, 'Silver')
check('750 progression = Gold',    tierFor({ vipProgressionStamps: 750,  subscriptionStatus: 'vip' }).name, 'Gold')
check('2000 progression = Diamond',tierFor({ vipProgressionStamps: 2000, subscriptionStatus: 'vip' }).name, 'Diamond')
check('EstiBun: 75 progression stays Bronze', tierFor({ vipProgressionStamps: 75, subscriptionStatus: 'vip' }).name, 'Bronze')

// A free member with a huge lifetime count is still Starter on $5.
check('free with 5,000 lifetime is still Starter $5',
  tierFor({ vipProgressionStamps: 0, subscriptionStatus: 'free' }).couponValue, 5)

check('cycle length is 20', COUPON_CYCLE, 20)

console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} CHECK(S) FAILED.`)
process.exit(failed === 0 ? 0 : 1)
