/**
 * End-to-end for the stamp tool after member reads moved off the browser.
 *
 *   node scripts/e2e-stamptool-security.mjs
 *
 * The hole this closes: the till used to query members, visits and rewards
 * straight from the tablet with the publishable key — the one inside every
 * page of the site — which only worked because each table carried a blanket
 * `USING (true)` policy. That policy applied to everybody, so anyone who
 * opened the page source could read every member's name, phone, email and
 * stamp count. Those reads now go through /api/stamp/member behind the
 * cashier's PIN.
 *
 * It runs against EstaBins Tampa, Esteban's own test store, with a throwaway
 * cashier and a throwaway member, both deleted at the end. No real member's
 * data is read, written or deleted.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import bcrypt from 'bcryptjs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:3000'
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const STORE_NAME = 'EstaBins Tampa'
const TAG   = 'ZZStamp'
const PHONE = '5555550177'
const PIN   = '4731'

let pass = 0, fail = 0
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`) }
  else    { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`) }
}
function section(t) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 54 - t.length))}`) }

const post = (path, body) => fetch(`${BASE}${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body), redirect: 'manual',
})

async function cleanup(quiet = false) {
  const { data: members } = await db.from('members').select('id').eq('phone', PHONE)
  for (const m of members ?? []) {
    await db.from('activity_events').delete().eq('member_id', m.id)
    await db.from('stamp_events').delete().eq('member_id', m.id)
    await db.from('visits').delete().eq('member_id', m.id)
    await db.from('rewards').delete().eq('member_id', m.id)
    await db.from('member_alerts').delete().eq('member_id', m.id)
    await db.from('members').delete().eq('id', m.id)
    if (!quiet) console.log('  removed throwaway member')
  }
  const { data: staff } = await db.from('staff_users').select('id').ilike('name', `${TAG}%`)
  for (const s of staff ?? []) {
    await db.from('staff_users').delete().eq('id', s.id)
    if (!quiet) console.log('  removed throwaway cashier')
  }
}

async function run() {
  section('Setup on EstaBins Tampa only')
  await cleanup(true)

  const { data: store } = await db.from('stores')
    .select('id, merchant_id, display_name').eq('display_name', STORE_NAME).single()
  check('found the test store', !!store, STORE_NAME)

  const { data: cashier } = await db.from('staff_users').insert({
    merchant_id: store.merchant_id, store_id: store.id,
    name: `${TAG} Till`, role: 'cashier',
    pin: await bcrypt.hash(PIN, 10), is_active: true,
  }).select('id').single()
  check('throwaway cashier created', !!cashier)

  const { data: member } = await db.from('members').insert({
    first_name: 'ZZStamp', last_name: 'Probe', phone: PHONE,
    email: 'zz-stamp-probe@example.com', status: 'active',
    merchant_id: store.merchant_id,
    total_stamps: 19, cycle_stamps: 19, vip_progression_stamps: 0,
  }).select('id').single()
  check('throwaway member created at 19 stamps', !!member)

  // ── The browser must no longer be able to do this itself ──────────────────
  section('The tablet can no longer read the database directly')
  const pk = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  for (const t of ['members', 'visits', 'rewards']) {
    const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${t}?select=*&limit=5`, {
      headers: { apikey: pk, Authorization: `Bearer ${pk}` },
    })
    const rows = await r.json().catch(() => null)
    check(`${t} returns nothing to the publishable key`,
      Array.isArray(rows) && rows.length === 0, `${r.status}, ${Array.isArray(rows) ? rows.length : '?'} rows`)
  }

  // ── Lookup ────────────────────────────────────────────────────────────────
  section('Lookup by phone, through the PIN-checked route')
  const bad = await post('/api/stamp/member', { cashierId: cashier.id, pin: '0000', phone: PHONE })
  check('wrong PIN refused', bad.status === 401, String(bad.status))

  const noPin = await post('/api/stamp/member', { cashierId: cashier.id, phone: PHONE })
  check('missing PIN refused', noPin.status === 401, String(noPin.status))

  const unknownCashier = await post('/api/stamp/member',
    { cashierId: '00000000-0000-0000-0000-000000000000', pin: PIN, phone: PHONE })
  check('unknown cashier refused', unknownCashier.status === 401, String(unknownCashier.status))

  const ok = await post('/api/stamp/member', { cashierId: cashier.id, pin: PIN, phone: PHONE })
  const okBody = await ok.json()
  check('correct PIN finds the member', ok.ok && okBody.found === true)
  check('returns their name', okBody.member?.firstName === 'ZZStamp', String(okBody.member?.firstName))
  check('returns the stamp count', okBody.member?.totalStamps === 19, String(okBody.member?.totalStamps))
  check('not stamped here today yet', okBody.member?.alreadyStampedToday === false)
  check('NO email address in the reply', !('email' in (okBody.member ?? {})),
    Object.keys(okBody.member ?? {}).join(','))

  const missing = await post('/api/stamp/member', { cashierId: cashier.id, pin: PIN, phone: '5555550000' })
  const missingBody = await missing.json()
  check('an unknown phone is simply not found', missingBody.found === false && missingBody.reason === 'not_found')

  // ── Award ─────────────────────────────────────────────────────────────────
  section('Award a stamp — 19 to 20 completes a cycle')
  const award = await post('/api/stamp', {
    memberId: member.id, storeId: store.id, cashierId: cashier.id, pin: PIN,
  })
  const awardBody = await award.json().catch(() => ({}))
  check('stamp awarded', award.ok, award.ok ? '' : JSON.stringify(awardBody).slice(0, 160))

  const { data: after } = await db.from('members')
    .select('total_stamps, cycle_stamps').eq('id', member.id).single()
  check('total went up', after.total_stamps === 20, String(after.total_stamps))
  check('cycle reset after 20', after.cycle_stamps === 0, String(after.cycle_stamps))

  const { data: earned } = await db.from('rewards')
    .select('id, coupon_value, status').eq('member_id', member.id)
  check('a coupon was earned', (earned ?? []).length === 1, `${(earned ?? []).length} reward(s)`)
  check('worth $5 for a Starter', Number(earned?.[0]?.coupon_value) === 5, String(earned?.[0]?.coupon_value))

  const badPinAward = await post('/api/stamp', {
    memberId: member.id, storeId: store.id, cashierId: cashier.id, pin: '0000',
  })
  check('awarding with the wrong PIN refused', badPinAward.status === 401, String(badPinAward.status))

  // ── Lookup again shows the coupon in hand ─────────────────────────────────
  section('The till now shows the coupon and the same-day block')
  const after2 = await post('/api/stamp/member', { cashierId: cashier.id, pin: PIN, phone: PHONE })
  const a2 = await after2.json()
  check('coupon shown as due', a2.member?.couponDue === true)
  check('for the right amount', Number(a2.member?.couponValue) === 5, String(a2.member?.couponValue))
  check('already stamped here today', a2.member?.alreadyStampedToday === true)

  const sameDay = await post('/api/stamp', {
    memberId: member.id, storeId: store.id, cashierId: cashier.id, pin: PIN,
  })
  const sameDayBody = await sameDay.json().catch(() => ({}))
  check('a second stamp the same day is refused', !sameDay.ok || sameDayBody.error,
    `${sameDay.status} ${sameDayBody.error ?? ''}`)

  // ── Redeem ────────────────────────────────────────────────────────────────
  section('Redeem the coupon')
  // Redemption happens inside the award flow, so this is tomorrow's visit:
  // clear today's visit and stamp again with a coupon in hand.
  await db.from('visits').delete().eq('member_id', member.id)
  const redeem = await post('/api/stamp', {
    memberId: member.id, storeId: store.id, cashierId: cashier.id, pin: PIN,
  })
  const redeemBody = await redeem.json().catch(() => ({}))
  check('second visit accepted', redeem.ok, redeem.ok ? '' : JSON.stringify(redeemBody).slice(0, 160))

  const { data: afterRedeem } = await db.from('rewards')
    .select('status, redeemed_at').eq('member_id', member.id)
  check('the coupon was redeemed', afterRedeem?.some(r => r.status === 'redeemed'),
    (afterRedeem ?? []).map(r => r.status).join(','))

  // ── Real members untouched ────────────────────────────────────────────────
  section('Real members untouched')
  const { count } = await db.from('members').select('id', { count: 'exact', head: true })
  check('member count is 6 real + 1 throwaway', count === 7, String(count))
}

try { await run() } catch (err) { fail++; console.error('\nUNCAUGHT:', err) }
finally {
  section('Cleanup')
  try {
    await cleanup()
    const { count } = await db.from('members').select('id', { count: 'exact', head: true })
    check('back to 6 real members', count === 6, String(count))
    const { data: staff } = await db.from('staff_users').select('id').ilike('name', `${TAG}%`)
    check('no throwaway cashier left', (staff ?? []).length === 0)
  } catch (err) { fail++; console.error('CLEANUP FAILED:', err) }
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}
