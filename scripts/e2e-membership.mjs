/**
 * End-to-end check of the membership restructure against the REAL stamp route.
 *
 *   npm run dev          (separate terminal / preview server)
 *   node scripts/e2e-membership.mjs
 *
 * Creates throwaway members and cashiers, drives /api/stamp over HTTP, and
 * deletes everything it made — including the rows it wrote at the two live
 * Bin Chasers stores, so their counts end exactly where they started.
 *
 * Safe to point at the dev server only: GHL webhook URLs are not in
 * .env.local, so no member messages can go out from here.
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

const STORES = {
  estabins:  { store: 'b0000000-0000-0000-0000-000000000001', merchant: 'a0000000-0000-0000-0000-000000000001', name: 'EstaBins Tampa' },
  lakeWales: { store: 'c810f492-cb0b-48c6-bd1a-d305fe909772', merchant: '96a30d43-737e-4d2e-9d32-cc707efd9224', name: 'Bin Chasers Lake Wales' },
  lakeland:  { store: 'c8a553c2-2129-4b77-80dc-a7c7a9705b8b', merchant: '4f6e4050-d93b-4c2e-bfa8-c8fa5b7417ad', name: 'Bin Chasers Lakeland' },
}
const TAG = 'ZZ-E2E-TEST'
const PIN = '4242'

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

async function member(id) {
  const [m] = await db(`members?id=eq.${id}&select=total_stamps,cycle_stamps,vip_progression_stamps,subscription_status,coupon_due`)
  return m
}
async function coupons(id) {
  return db(`rewards?member_id=eq.${id}&select=coupon_value,status,earned_at&order=earned_at.asc`)
}

async function stamp(memberId, cashierId, storeId) {
  const r = await fetch(`${APP}/api/stamp`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId, storeId, cashierId, pin: PIN }),
  })
  return { status: r.status, body: await r.json() }
}

/** Clears today's visit so the next call is treated as a new day. */
async function clearVisit(memberId) {
  await del('visits', `member_id=eq.${memberId}`)
}

async function makeMember(name, fields = {}) {
  const [m] = await insert('members', {
    first_name: name, last_name: TAG,
    phone: String(9990000000 + Math.floor(Math.random() * 9999999)).slice(0, 10),
    email: `${name.toLowerCase()}.${Date.now()}@example.invalid`,
    subscription_status: 'free',
    origin_store_id: STORES.estabins.store,
    origin_merchant_id: STORES.estabins.merchant,
    sms_opt_in: false,
    ...fields,
  })
  return m
}

async function makeCashier(where) {
  const [c] = await insert('staff_users', {
    name: `${TAG} cashier`, role: 'cashier',
    store_id: where.store, merchant_id: where.merchant,
    pin: bcrypt.hashSync(PIN, 10), is_active: true,
  })
  return c
}

async function cleanup(memberIds, cashierIds) {
  for (const id of memberIds) {
    await del('rewards', `member_id=eq.${id}`)
    await del('activity_events', `member_id=eq.${id}`)
    await del('visits', `member_id=eq.${id}`)
    await del('member_alerts', `member_id=eq.${id}`)
    await del('members', `id=eq.${id}`)
  }
  for (const id of cashierIds) await del('staff_users', `id=eq.${id}`)
}

const made = { members: [], cashiers: [] }

try {
  const cashier = await makeCashier(STORES.estabins)
  made.cashiers.push(cashier.id)

  // ── 1. A free member earning past 20, 40 and 60 ──────────────────────────
  const free = await makeMember('FreeForever')
  made.members.push(free.id)

  const milestones = {}
  for (let visit = 1; visit <= 60; visit++) {
    const res = await stamp(free.id, cashier.id, STORES.estabins.store)
    if (res.status !== 200 || res.body.error) {
      console.log(`FAIL  free member blocked on visit ${visit}: ${JSON.stringify(res.body)}`)
      failed++
      break
    }
    if ([20, 40, 60].includes(visit)) {
      const m = await member(free.id)
      milestones[visit] = { lifetime: m.total_stamps, cycle: m.cycle_stamps, coupons: (await coupons(free.id)).length }
    }
    // A coupon due would be redeemed by the next stamp; clear it so the run
    // keeps testing earning rather than redemption.
    await patch('members', `id=eq.${free.id}`, { coupon_due: false })
    await clearVisit(free.id)
  }

  check('free: lifetime 20/40/60 at each milestone',
    [milestones[20]?.lifetime, milestones[40]?.lifetime, milestones[60]?.lifetime], [20, 40, 60])
  check('free: cycle back to 0 at each milestone',
    [milestones[20]?.cycle, milestones[40]?.cycle, milestones[60]?.cycle], [0, 0, 0])
  check('free: 1, 2, 3 coupons issued',
    [milestones[20]?.coupons, milestones[40]?.coupons, milestones[60]?.coupons], [1, 2, 3])

  const freeCoupons = await coupons(free.id)
  check('free: every coupon is $5', [...new Set(freeCoupons.map(c => Number(c.coupon_value)))], [5])
  const freeFinal = await member(free.id)
  check('free: VIP progression still 0', freeFinal.vip_progression_stamps, 0)

  // ── 2. Upgrading mid-cycle at 14 stamps ──────────────────────────────────
  const upgrader = await makeMember('UpgradeAt14', { total_stamps: 14, cycle_stamps: 14 })
  made.members.push(upgrader.id)

  // What the VIP webhook writes on upgrade: status only, counters untouched.
  await patch('members', `id=eq.${upgrader.id}`, { subscription_status: 'vip' })
  const afterUpgrade = await member(upgrader.id)
  check('upgrade: cycle still 14', afterUpgrade.cycle_stamps, 14)
  check('upgrade: VIP progression 0', afterUpgrade.vip_progression_stamps, 0)

  // Three Bronze visits: 2 stamps each -> 14, 16, 18, 20 -> coupon at $7.
  for (let i = 0; i < 3; i++) {
    const res = await stamp(upgrader.id, cashier.id, STORES.estabins.store)
    if (res.body.error) { console.log('FAIL  upgrade stamp error', res.body); failed++; break }
    await clearVisit(upgrader.id)
  }
  const upgraded = await member(upgrader.id)
  const upCoupons = await coupons(upgrader.id)
  check('upgrade: 3 Bronze visits = +6 progression', upgraded.vip_progression_stamps, 6)
  check('upgrade: lifetime 14 + 6', upgraded.total_stamps, 20)
  check('upgrade: cycle completed and reset', upgraded.cycle_stamps, 0)
  check('upgrade: carried cycle paid out at $7', upCoupons.map(c => Number(c.coupon_value)), [7])

  // ── 3. Cancel and resubscribe keeps progression ──────────────────────────
  const returner = await makeMember('Resubscriber', {
    subscription_status: 'vip', total_stamps: 300, cycle_stamps: 5, vip_progression_stamps: 240,
  })
  made.members.push(returner.id)
  // Cancellation, as the Stripe webhook writes it.
  await patch('members', `id=eq.${returner.id}`, { subscription_status: 'free', vip_billing_cycle: null, stripe_subscription_id: null })
  const cancelled = await member(returner.id)
  check('cancel: progression untouched', cancelled.vip_progression_stamps, 240)
  // Resubscribe.
  await patch('members', `id=eq.${returner.id}`, { subscription_status: 'vip' })
  const resumed = await member(returner.id)
  check('resubscribe: progression resumes at 240', resumed.vip_progression_stamps, 240)
  // A Silver visit is worth 3.
  const silverRes = await stamp(returner.id, cashier.id, STORES.estabins.store)
  check('resubscribe: Silver earns 3 stamps', silverRes.body.stampCount, 3)
  check('resubscribe: reported tier is Silver', silverRes.body.tierName, 'Silver')
  await clearVisit(returner.id)

  // ── 4. The two live stores can still stamp ───────────────────────────────
  for (const key of ['lakeWales', 'lakeland']) {
    const where = STORES[key]
    const c = await makeCashier(where)
    made.cashiers.push(c.id)
    const m = await makeMember(`LiveStore${key}`)
    made.members.push(m.id)
    const res = await stamp(m.id, c.id, where.store)
    check(`live store: ${where.name} stamps`, { status: res.status, error: res.body.error ?? null, stamps: res.body.stampCount }, { status: 200, error: null, stamps: 1 })
  }

  // ── 5. EstiBun is untouched and still Bronze ─────────────────────────────
  const [esti] = await db('members?first_name=eq.EstiBun&select=total_stamps,cycle_stamps,vip_progression_stamps,subscription_status')
  check('EstiBun: 75 lifetime, 75 progression, VIP',
    [esti.total_stamps, esti.vip_progression_stamps, esti.subscription_status], [75, 75, 'vip'])
} catch (err) {
  failed++
  console.log('FAIL  threw:', err.message)
} finally {
  await cleanup(made.members, made.cashiers)
  const leftoverMembers = await db(`members?last_name=eq.${TAG}&select=id`)
  const leftoverCashiers = await db(`staff_users?name=eq.${encodeURIComponent(TAG + ' cashier')}&select=id`)
  check('cleanup: no test members left', leftoverMembers.length, 0)
  check('cleanup: no test cashiers left', leftoverCashiers.length, 0)
  console.log(failed === 0 ? '\nAll end-to-end checks passed.' : `\n${failed} CHECK(S) FAILED.`)
  process.exit(failed === 0 ? 0 : 1)
}
