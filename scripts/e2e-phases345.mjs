/**
 * End-to-end checks for phases 3, 4 and 5, against the REAL routes.
 *
 *   npm run dev   (preview server on :3000)
 *   node scripts/e2e-phases345.mjs
 *
 * Builds its own throwaway merchants, stores, cashiers and members, drives
 * /api/stamp and both cron routes over HTTP, and deletes everything it made.
 *
 * IT NEVER TOUCHES A REAL MERCHANT. Thomas's and Mark's stores, their billing
 * and their agreements are read at the end only to prove they are unchanged.
 * GHL webhook URLs are absent from .env.local, so no member message can leave
 * a local run.
 */

import fs from 'node:fs'
import bcrypt from 'bcryptjs'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SECRET_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const APP = 'http://localhost:3000'
const CRON = process.env.CRON_SECRET || 'local-test-secret'
const TAG = 'ZZ-P345'
const PIN = '4242'
const DAY = 24 * 60 * 60 * 1000

let failed = 0
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  const ok = a === e
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  (expected ${e}, got ${a})`}`)
}

async function db(path, init) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: H, ...init })
  const text = await r.text()
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${text}`)
  return text ? JSON.parse(text) : null
}
const insert = (t, row) => db(t, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(row) })
const patch  = (t, q, row) => db(`${t}?${q}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(row) })
const del    = (t, q) => db(`${t}?${q}`, { method: 'DELETE' })

const made = { merchants: [], stores: [], members: [], cashiers: [] }

async function makeMerchant(name, fields = {}) {
  const [m] = await insert('merchants', {
    name: `${TAG} ${name}`, company_name: `${TAG} ${name} LLC`,
    owner_email: `${TAG.toLowerCase()}.${name.toLowerCase()}.${Date.now()}@example.invalid`,
    billing_status: 'active', subscription_status: 'active', commission_eligible: true,
    ...fields,
  })
  made.merchants.push(m.id)
  const [s] = await insert('stores', {
    merchant_id: m.id,
    display_name: `${TAG} ${name} Store`,
    brand_name: `${TAG} ${name}`,
    canonical_key: `ZZ-${name}-${Date.now()}`,
    city: 'Tampa', state: 'FL',
    is_active: true, network_visible: true, enrollment_enabled: true,
  })
  made.stores.push(s.id)
  const [c] = await insert('staff_users', {
    name: `${TAG} cashier`, role: 'cashier', store_id: s.id, merchant_id: m.id,
    pin: bcrypt.hashSync(PIN, 10), is_active: true,
  })
  made.cashiers.push(c.id)
  return { merchantId: m.id, storeId: s.id, cashierId: c.id }
}

async function makeMember(name, origin, fields = {}) {
  const [m] = await insert('members', {
    first_name: name, last_name: TAG,
    phone: String(9980000000 + Math.floor(Math.random() * 9999999)).slice(0, 10),
    email: `${name.toLowerCase()}.${Date.now()}@example.invalid`,
    subscription_status: 'free', sms_opt_in: true,
    origin_store_id: origin?.storeId ?? null,
    origin_merchant_id: origin?.merchantId ?? null,
    ...fields,
  })
  made.members.push(m.id)
  return m
}

const stamp = async (memberId, cashierId, storeId) => {
  const r = await fetch(`${APP}/api/stamp`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId, storeId, cashierId, pin: PIN }),
  })
  return { status: r.status, body: await r.json() }
}
const cron = async (name, secret = CRON) => {
  const r = await fetch(`${APP}/api/cron/${name}`, { headers: { Authorization: `Bearer ${secret}` } })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}
const clearVisit = id => del('visits', `member_id=eq.${id}`)
const member = async id => (await db(`members?id=eq.${id}&select=*`))[0]
const rewardsOf = async id => db(`rewards?member_id=eq.${id}&select=id,coupon_value,status,reward_type,expires_at,funding_merchant_id,funding_store_id&order=earned_at.asc`)
const ledgerOf = async rewardId => db(`settlement_ledger?reward_id=eq.${rewardId}&select=ledger_entry_type,credit_amount,debit_amount,funding_party,origin_merchant_id,redeeming_merchant_id`)

async function cleanup() {
  const tryDel = async (t, q) => { try { await del(t, q) } catch (e) { console.log('   cleanup warn:', t, e.message.slice(0, 120)) } }
  for (const id of made.members) {
    await tryDel('settlement_ledger', `member_id=eq.${id}`)
    await tryDel('rewards', `member_id=eq.${id}`)
    await tryDel('member_origin_history', `member_id=eq.${id}`)
    await tryDel('activity_events', `member_id=eq.${id}`)
    await tryDel('visits', `member_id=eq.${id}`)
    await tryDel('member_alerts', `member_id=eq.${id}`)
    await tryDel('members', `id=eq.${id}`)
  }
  for (const id of made.cashiers) await tryDel('staff_users', `id=eq.${id}`)
  for (const id of made.stores) {
    await tryDel('settlement_ledger', `origin_store_id=eq.${id}`)
    await tryDel('settlement_ledger', `redeeming_store_id=eq.${id}`)
    await tryDel('rewards', `store_id=eq.${id}`)
    await tryDel('stores', `id=eq.${id}`)
  }
  for (const id of made.merchants) {
    // Ledger rows can reference a merchant without referencing a member that
    // this run created, so they are cleared by merchant as well.
    await tryDel('settlement_ledger', `origin_merchant_id=eq.${id}`)
    await tryDel('settlement_ledger', `redeeming_merchant_id=eq.${id}`)
    await tryDel('rewards', `funding_merchant_id=eq.${id}`)
    await tryDel('rewards', `merchant_id=eq.${id}`)
    await tryDel('origin_eligibility_history', `merchant_id=eq.${id}`)
    await tryDel('merchants', `id=eq.${id}`)
  }
}

try {
  // Snapshot the live merchants so the end of the run can prove nothing moved.
  const liveBefore = await db("merchants?or=(name.eq.Liquidation Motivation LLC,name.eq.BABG LLC)&select=id,name,billing_status,commission_eligible,payment_failed_at,became_inactive_at&order=name")

  const good   = await makeMerchant('Active')
  const failing = await makeMerchant('Failing')
  const other  = await makeMerchant('Other')

  // ── PHASE 3 ──────────────────────────────────────────────────────────────
  // Grace period: a merchant with a failed payment can still stamp.
  await patch('merchants', `id=eq.${failing.merchantId}`, {
    billing_status: 'grace_period',
    payment_failed_at: new Date(Date.now() - 5 * DAY).toISOString(),
  })
  const graceMember = await makeMember('GraceShopper', failing)
  const graceRes = await stamp(graceMember.id, failing.cashierId, failing.storeId)
  check('P3 grace period: store can still stamp', { status: graceRes.status, stamps: graceRes.body.stampCount }, { status: 200, stamps: 1 })
  await clearVisit(graceMember.id)

  // The daily job does nothing at day 5.
  const earlyRun = await cron('merchant-inactivity')
  check('P3 cron: nothing deactivated at day 5', earlyRun.body.deactivated, 0)

  // Back-date the failure past 30 days and run again.
  await patch('merchants', `id=eq.${failing.merchantId}`, {
    payment_failed_at: new Date(Date.now() - 31 * DAY).toISOString(),
  })
  const lateRun = await cron('merchant-inactivity')
  check('P3 cron: deactivates after 30 days', lateRun.body.deactivated >= 1, true)

  const nowInactive = (await db(`merchants?id=eq.${failing.merchantId}&select=billing_status,became_inactive_at,commission_eligible`))[0]
  check('P3 status is inactive', nowInactive.billing_status, 'inactive')
  check('P3 became_inactive_at recorded', !!nowInactive.became_inactive_at, true)
  check('P3 commission eligibility ended', nowInactive.commission_eligible, false)

  // Stamping gate.
  const blocked = await stamp(graceMember.id, failing.cashierId, failing.storeId)
  check('P3 inactive store is blocked', { status: blocked.status, error: blocked.body.error }, { status: 403, error: 'store_cannot_stamp' })
  check('P3 blocked message is the one the tool shows', blocked.body.message,
    "This store can't award stamps right now. Please contact BinPerks support.")

  // Transfer: a member of the inactive merchant stamps at an active store.
  const transferRes = await stamp(graceMember.id, good.cashierId, good.storeId)
  check('P3 transfer: stamp succeeds at the active store', transferRes.status, 200)
  const afterTransfer = await member(graceMember.id)
  check('P3 transfer: origin moved to the active merchant', afterTransfer.origin_merchant_id, good.merchantId)
  check('P3 transfer: origin store moved too', afterTransfer.origin_store_id, good.storeId)
  check('P3 transfer: timestamped', !!afterTransfer.origin_transferred_at, true)

  const history = await db(`member_origin_history?member_id=eq.${graceMember.id}&select=from_merchant_id,to_merchant_id,reason`)
  check('P3 transfer: one admin history row, reason origin_inactive',
    history.map(h => [h.from_merchant_id === failing.merchantId, h.to_merchant_id === good.merchantId, h.reason]),
    [[true, true, 'origin_inactive']])

  // Reactivating does not pull the member back.
  await patch('merchants', `id=eq.${failing.merchantId}`, { billing_status: 'active', payment_failed_at: null, became_inactive_at: null })
  const afterReactivate = await member(graceMember.id)
  check('P3 reactivated merchant does not reclaim the member', afterReactivate.origin_merchant_id, good.merchantId)

  // House-origin member transfers on first stamp.
  const houseMember = await makeMember('HouseJoiner', {
    storeId: '00000000-0000-0000-0000-b19ec5000002',
    merchantId: '00000000-0000-0000-0000-b19ec5000001',
  })
  await stamp(houseMember.id, other.cashierId, other.storeId)
  const houseAfter = await member(houseMember.id)
  check('P3 house member moves to the first store that stamps', houseAfter.origin_merchant_id, other.merchantId)
  const houseHistory = await db(`member_origin_history?member_id=eq.${houseMember.id}&select=reason`)
  check('P3 house transfer reason', houseHistory.map(h => h.reason), ['house_origin_first_stamp'])

  // ── PHASE 4 ──────────────────────────────────────────────────────────────
  // Earn a coupon at the funding store, then redeem it in two scenarios.
  const earner = await makeMember('CouponEarner', good, { cycle_stamps: 19 })
  await stamp(earner.id, good.cashierId, good.storeId)
  await clearVisit(earner.id)
  let coupons = await rewardsOf(earner.id)
  check('P4 coupon earned at 20', coupons.length, 1)
  check('P4 funding merchant recorded as the origin at that moment', coupons[0].funding_merchant_id, good.merchantId)

  // Redeemed at the funding store: nothing to settle.
  await stamp(earner.id, good.cashierId, good.storeId)
  await clearVisit(earner.id)
  let ledger = await ledgerOf(coupons[0].id)
  check('P4 same-store redemption writes no ledger rows', ledger.length, 0)
  coupons = await rewardsOf(earner.id)
  check('P4 the coupon is redeemed', coupons[0].status, 'redeemed')

  // Cross-store: earn at `good`, spend at `other`.
  const traveller = await makeMember('Traveller', good, { cycle_stamps: 19 })
  await stamp(traveller.id, good.cashierId, good.storeId)
  await clearVisit(traveller.id)
  const tCoupon = (await rewardsOf(traveller.id))[0]
  await stamp(traveller.id, other.cashierId, other.storeId)
  await clearVisit(traveller.id)
  ledger = await ledgerOf(tCoupon.id)
  const types = ledger.map(l => l.ledger_entry_type).sort()
  check('P4 cross-store redemption writes a credit and a debit', types, ['coupon_credit_redeeming', 'coupon_debit_origin'])
  const credit = ledger.find(l => l.ledger_entry_type === 'coupon_credit_redeeming')
  const debit  = ledger.find(l => l.ledger_entry_type === 'coupon_debit_origin')
  check('P4 honouring merchant is credited the face value',
    { to: credit.redeeming_merchant_id === other.merchantId, amount: Number(credit.credit_amount) },
    { to: true, amount: 5 })
  check('P4 funding merchant is charged the face value',
    { from: debit.origin_merchant_id === good.merchantId, amount: Number(debit.debit_amount) },
    { from: true, amount: 5 })

  // Funder inactive at redemption: BinPerks pays, amount still recorded against the funder.
  const orphan = await makeMember('OrphanCoupon', failing, { cycle_stamps: 19 })
  await stamp(orphan.id, failing.cashierId, failing.storeId)   // failing is active again
  await clearVisit(orphan.id)
  const oCoupon = (await rewardsOf(orphan.id))[0]
  await patch('merchants', `id=eq.${failing.merchantId}`, { billing_status: 'inactive', became_inactive_at: new Date().toISOString() })
  await stamp(orphan.id, other.cashierId, other.storeId)
  await clearVisit(orphan.id)
  ledger = await ledgerOf(oCoupon.id)
  const oTypes = ledger.map(l => l.ledger_entry_type).sort()
  check('P4 inactive funder: BinPerks funds it', oTypes, ['coupon_credit_redeeming', 'coupon_debit_binperks'])
  const bpDebit = ledger.find(l => l.ledger_entry_type === 'coupon_debit_binperks')
  check('P4 the amount is still recorded against the funding merchant',
    { owed_by: bpDebit.origin_merchant_id === failing.merchantId, party: bpDebit.funding_party },
    { owed_by: true, party: 'binperks' })

  // ── PHASE 5 ──────────────────────────────────────────────────────────────
  // 40 days quiet puts them on the first rung, not the second.
  const quiet = await makeMember('QuietMember', good, {
    created_at: new Date(Date.now() - 40 * DAY).toISOString(),
  })

  // Day 30: message, no coupon.
  await patch('members', `id=eq.${quiet.id}`, { reactivation_stage: 0 })
  let run = await cron('member-reactivation')
  check('P5 day 30: messaged', run.body.day30 >= 1, true)
  check('P5 day 30: no coupon added', (await rewardsOf(quiet.id)).length, 0)
  let q = await member(quiet.id)
  check('P5 day 30: stage recorded', q.reactivation_stage, 30)

  // Running again the same day does nothing.
  run = await cron('member-reactivation')
  check('P5 no double message on a second run', run.body.messaged, 0)

  // Day 60: message plus the $2 coupon.
  await db(`activity_events?member_id=eq.${quiet.id}`, { method: 'DELETE' })
  await patch('members', `id=eq.${quiet.id}`, { created_at: new Date(Date.now() - 70 * DAY).toISOString() })
  run = await cron('member-reactivation')
  check('P5 day 60: messaged', run.body.day60 >= 1, true)
  const qCoupons = await rewardsOf(quiet.id)
  const reCoupon = qCoupons.find(r => r.reward_type === 'reactivation')
  check('P5 day 60: a $2 reactivation coupon', { value: Number(reCoupon?.coupon_value), type: reCoupon?.reward_type }, { value: 2, type: 'reactivation' })
  const daysToExpiry = Math.round((new Date(reCoupon.expires_at).getTime() - Date.now()) / DAY)
  check('P5 coupon expires in 14 days', daysToExpiry, 14)
  check('P5 coupon is funded by the origin store', reCoupon.funding_merchant_id, good.merchantId)
  q = await member(quiet.id)
  check('P5 one-per-member lock set', !!q.reactivation_coupon_issued_at, true)
  check('P5 coupon_due flagged for the till', q.coupon_due, true)

  // Nothing further after day 60.
  run = await cron('member-reactivation')
  check('P5 nothing sent past day 60', run.body.messaged, 0)

  // Coming back resets the ladder; a second lap sends messages but no coupon.
  await stamp(quiet.id, good.cashierId, good.storeId)   // redeems the $2 coupon
  await clearVisit(quiet.id)
  q = await member(quiet.id)
  const redeemed = (await rewardsOf(quiet.id)).filter(r => r.reward_type === 'reactivation' && r.status === 'redeemed')
  check('P5 the $2 coupon is redeemable at the till', redeemed.length, 1)

  run = await cron('member-reactivation')
  q = await member(quiet.id)
  check('P5 returning member resets to stage 0', q.reactivation_stage, 0)

  await db(`activity_events?member_id=eq.${quiet.id}`, { method: 'DELETE' })
  run = await cron('member-reactivation')
  q = await member(quiet.id)
  check('P5 second lap messages again', q.reactivation_stage >= 30, true)
  await db(`activity_events?member_id=eq.${quiet.id}`, { method: 'DELETE' })
  run = await cron('member-reactivation')
  const secondLapCoupons = (await rewardsOf(quiet.id)).filter(r => r.reward_type === 'reactivation')
  check('P5 no second coupon, ever', secondLapCoupons.length, 1)

  // Holding an unused coupon: message only.
  const holder = await makeMember('CouponHolder', good, {
    created_at: new Date(Date.now() - 200 * DAY).toISOString(),
  })
  await insert('rewards', {
    member_id: holder.id, merchant_id: good.merchantId, store_id: good.storeId,
    issued_at_location_id: good.storeId, coupon_value: 5, reward_type: 'visit_reward',
    status: 'earned', earned_at: new Date().toISOString(),
    funding_store_id: good.storeId, funding_merchant_id: good.merchantId,
  })
  await patch('members', `id=eq.${holder.id}`, { reactivation_stage: 30, coupon_due: true })
  run = await cron('member-reactivation')
  const holderCoupons = (await rewardsOf(holder.id)).filter(r => r.reward_type === 'reactivation')
  const holderAfter = await member(holder.id)
  check('P5 holder: messaged at day 60', holderAfter.reactivation_stage, 60)
  check('P5 holder: no coupon while one is unused', holderCoupons.length, 0)
  check('P5 holder: keeps the one-per-lifetime entitlement', holderAfter.reactivation_coupon_issued_at, null)

  // Expiry: an out-of-date coupon is closed out and disappears.
  const expirer = await makeMember('Expirer', good)
  await insert('rewards', {
    member_id: expirer.id, merchant_id: good.merchantId, store_id: good.storeId,
    issued_at_location_id: good.storeId, coupon_value: 2, reward_type: 'reactivation',
    status: 'earned', earned_at: new Date(Date.now() - 20 * DAY).toISOString(),
    expires_at: new Date(Date.now() - 1 * DAY).toISOString(),
    funding_store_id: good.storeId, funding_merchant_id: good.merchantId,
  })
  await patch('members', `id=eq.${expirer.id}`, { coupon_due: true })
  await cron('member-reactivation')
  const expiredCoupon = (await rewardsOf(expirer.id))[0]
  check('P5 expired coupon is closed out', expiredCoupon.status, 'expired')
  check('P5 expired coupon clears coupon_due', (await member(expirer.id)).coupon_due, false)

  // Cron auth.
  const noAuth = await fetch(`${APP}/api/cron/merchant-inactivity`)
  check('P3 inactivity cron refuses an unauthenticated call', noAuth.status, 401)

  // ── The live merchants are untouched ─────────────────────────────────────
  const liveAfter = await db("merchants?or=(name.eq.Liquidation Motivation LLC,name.eq.BABG LLC)&select=id,name,billing_status,commission_eligible,payment_failed_at,became_inactive_at&order=name")
  check('Live merchants unchanged (Thomas and Mark)', liveAfter, liveBefore)
} catch (err) {
  failed++
  console.log('FAIL  threw:', err.message)
} finally {
  await cleanup()
  const leftMembers   = await db(`members?last_name=eq.${TAG}&select=id`)
  const leftMerchants = await db(`merchants?name=like.${TAG}*&select=id`)
  check('cleanup: no test members left', leftMembers.length, 0)
  check('cleanup: no test merchants left', leftMerchants.length, 0)
  console.log(failed === 0 ? '\nAll phase 3-5 checks passed.' : `\n${failed} CHECK(S) FAILED.`)
  process.exit(failed === 0 ? 0 : 1)
}
