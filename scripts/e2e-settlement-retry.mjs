/**
 * End-to-end test for the failed-transfer carry-forward and retry.
 *
 *   STRIPE_TRANSFERS_ENABLED=true node scripts/e2e-settlement-retry.mjs
 *
 * The gap this covers: approve locks a batch when it finishes, and a locked
 * batch can never be approved again. So a merchant whose transfer failed —
 * almost always because they had not finished Stripe Connect onboarding — had
 * no route to their money at all. It sat on a 'failed' statement nobody could
 * touch. Now the unpaid net carries into their next period as a credit, and a
 * single statement can be retried once the account is fixed.
 *
 * ── IT NEVER TOUCHES A REAL SETTLEMENT ─────────────────────────────────────
 * It does NOT call /calculate. Calculate sweeps a whole calendar month for
 * every merchant and writes a settlement_batches row for that period, which
 * would then block the real run for that month. Instead the batch and the
 * statement are written directly, in period 1999-01, which no real run can
 * ever produce. Approve, negative-balance and retry are then exercised as the
 * real endpoints against that one batch.
 *
 * Stripe TEST mode only — it refuses to start otherwise. Every row and every
 * Stripe object the run creates is deleted at the end.
 *
 * ── WHAT THIS CANNOT TEST, AND WHY ─────────────────────────────────────────
 * A transfer that actually SUCCEEDS needs a connected account with
 * payouts_enabled, and neither kind can be produced from the API on this
 * platform: Express and Standard accounts refuse to let the platform accept
 * their Terms of Service ("controller[requirement_collection]=stripe"), and
 * Custom accounts are refused until the Connect platform profile in the Stripe
 * Dashboard says this platform collects requirements itself.
 *
 * So the happy path is checked up to the last possible point — a real Stripe
 * account is attached, the route is called, and it is the live payouts_enabled
 * check at Stripe that stops it. Everything that protects the money is
 * covered: the carry-forward, its idempotence, and every refusal that stands
 * between a click and a second payment.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import Stripe from 'stripe'

// ── Environment ─────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)

const BASE  = process.env.E2E_BASE || 'http://127.0.0.1:3000'
const ADMIN_EMAIL = 'binperksnetwork@gmail.com'

if (!env.STRIPE_SECRET_KEY?.startsWith('sk_test')) {
  console.error('REFUSING: STRIPE_SECRET_KEY is not a test key.')
  process.exit(1)
}

const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' })
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Throwaway identity ──────────────────────────────────────────────────────
const TAG        = 'ZZRetry'
const COMPANY    = 'ZZRetry Settlement LLC'
const TEST_PERIOD = '1999-01'          // unreachable by any real calculate
const NET        = 42.50

// ── Harness ─────────────────────────────────────────────────────────────────
let pass = 0, fail = 0
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`) }
  else    { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`) }
}
function section(t) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 56 - t.length))}`) }
const money = n => Math.round(Number(n) * 100) / 100

// ── Admin cookie ────────────────────────────────────────────────────────────
async function adminCookie() {
  const { data: link, error } = await db.auth.admin.generateLink({ type: 'magiclink', email: ADMIN_EMAIL })
  if (error) throw new Error(`generateLink: ${error.message}`)
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: sess, error: otpErr } = await anon.auth.verifyOtp({
    token_hash: link.properties.hashed_token, type: 'email',
  })
  if (otpErr) throw new Error(`verifyOtp: ${otpErr.message}`)
  const ref  = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1]
  const name = `sb-${ref}-auth-token`
  const value = 'base64-' + Buffer.from(JSON.stringify(sess.session)).toString('base64url')
  const CHUNK = 3180
  if (value.length <= CHUNK) return `${name}=${value}`
  const parts = []
  for (let i = 0, n = 0; i < value.length; i += CHUNK, n++) parts.push(`${name}.${n}=${value.slice(i, i + CHUNK)}`)
  return parts.join('; ')
}

const post = cookie => (path, body) => fetch(`${BASE}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', cookie },
  body: JSON.stringify(body ?? {}),
  redirect: 'manual',
})

/** Everything about the two Bin Chasers merchants a bug could disturb. */
async function binChasers() {
  const { data } = await db.from('merchants')
    .select('id, company_name, billing_status, commission_eligible, negative_balance, stripe_connect_id, payouts_enabled')
    .in('company_name', ['Liquidation Motivation LLC', 'BABG LLC'])
    .order('company_name')
  return JSON.stringify(data)
}

// ── Cleanup ─────────────────────────────────────────────────────────────────
async function cleanup(quiet = false) {
  const { data: mine } = await db.from('merchants').select('id, company_name, stripe_connect_id')
    .ilike('company_name', `${TAG}%`)

  for (const m of mine ?? []) {
    if (!String(m.company_name ?? '').startsWith(TAG)) continue
    await db.from('merchant_settlement_statements').delete().eq('merchant_id', m.id)
    await db.from('negative_balance_history').delete().eq('merchant_id', m.id)
    await db.from('merchants').delete().eq('id', m.id)
    if (m.stripe_connect_id) {
      try { await stripe.accounts.del(m.stripe_connect_id) } catch { /* already gone */ }
    }
    if (!quiet) console.log(`  removed merchant ${m.company_name}`)
  }
  // The test batch, by its impossible period.
  await db.from('merchant_settlement_statements').delete().eq('settlement_period', TEST_PERIOD)
  await db.from('settlement_batches').delete().eq('settlement_period', TEST_PERIOD)
}

/** A real test-mode Connect account that is NOT yet able to receive payouts —
 *  which is the state every merchant is in until they finish onboarding, and
 *  the state this test needs.
 *
 *  A payable one cannot be made from the API here: Express and Standard
 *  refuse platform ToS acceptance, and Custom is blocked by the Connect
 *  platform profile. See the note at the top of this file. */
async function makeUnpayableAccount() {
  return stripe.accounts.create({
    type: 'express',
    country: 'US',
    email: 'zz-retry-test@example.com',
    capabilities: { transfers: { requested: true } },
  })
}

// ── Run ─────────────────────────────────────────────────────────────────────
async function run() {
  const cookie = await adminCookie()
  const call = post(cookie)

  section('Starting clean')
  await cleanup(true)
  check('no leftovers from a previous run', true)

  const chasersBefore = await binChasers()

  section('Build a throwaway merchant with money owed and no payout account')
  const { data: merchant, error: mErr } = await db.from('merchants').insert({
    company_name: COMPANY, name: COMPANY,
    owner_email: 'zz-retry-test@example.com', owner_name: 'ZZRetry Tester',
    billing_status: 'active', subscription_status: 'active', plan: 'standard',
    location_count: 1, commission_eligible: true, negative_balance: 0,
  }).select('id').single()
  if (mErr) throw new Error('merchant insert: ' + mErr.message)
  check('merchant created with no Connect account', !!merchant)

  const { data: batch } = await db.from('settlement_batches').insert({
    settlement_period: TEST_PERIOD,
    period_start: '1999-01-01T00:00:00Z', period_end: '1999-01-31T23:59:59Z',
    status: 'calculated', merchant_count: 1,
    total_merchant_distributions: NET,
  }).select('id').single()
  check('test batch created in an impossible period', !!batch, TEST_PERIOD)

  const { data: stmt } = await db.from('merchant_settlement_statements').insert({
    settlement_batch_id: batch.id, merchant_id: merchant.id,
    settlement_period: TEST_PERIOD,
    origin_commission_credits: NET, gross_distribution: NET,
    net_distribution: NET, closing_negative_balance: 0,
    statement_status: 'draft',
  }).select('id').single()
  check('statement created owing the merchant money', !!stmt, `$${NET}`)

  // ── Approve ───────────────────────────────────────────────────────────────
  section('Approve — the transfer must fail, not vanish')
  const appRes = await call('/api/admin/settlement/approve', { batchId: batch.id })
  const appBody = await appRes.json().catch(() => ({}))
  check('approve returns 200', appRes.ok, appRes.ok ? '' : JSON.stringify(appBody))
  check('transfers were enabled for this run', appBody?.transfers?.enabled === true,
    appBody?.transfers?.enabled === true ? '' : 'set STRIPE_TRANSFERS_ENABLED=true')
  check('one transfer failed', appBody?.transfers?.failed === 1, JSON.stringify(appBody?.transfers))
  check('nothing was paid', appBody?.transfers?.succeeded === 0)

  let { data: s1 } = await db.from('merchant_settlement_statements')
    .select('statement_status, stripe_transfer_status, stripe_transfer_id, carried_forward_amount').eq('id', stmt.id).single()
  check('statement marked failed', s1.statement_status === 'failed', s1.statement_status)
  check('reason recorded', s1.stripe_transfer_status === 'no_connect_account', String(s1.stripe_transfer_status))
  check('no transfer id', s1.stripe_transfer_id === null)

  const { data: b1 } = await db.from('settlement_batches').select('status').eq('id', batch.id).single()
  check('batch is locked', b1.status === 'locked', b1.status)

  // ── Carry forward ─────────────────────────────────────────────────────────
  section('Carry forward — the money follows the merchant')
  const nbRes = await call('/api/admin/settlement/negative-balance', { batchId: batch.id })
  check('negative-balance returns 200', nbRes.ok)

  let { data: m1 } = await db.from('merchants').select('negative_balance').eq('id', merchant.id).single()
  check('merchant now holds a credit, not a debt', money(m1.negative_balance) === -NET,
    `negative_balance = ${m1.negative_balance}`)
  ;({ data: s1 } = await db.from('merchant_settlement_statements')
    .select('carried_forward_amount').eq('id', stmt.id).single())
  check('statement records what was carried', money(s1.carried_forward_amount) === NET, String(s1.carried_forward_amount))

  const nbRes2 = await call('/api/admin/settlement/negative-balance', { batchId: batch.id })
  check('re-running carries nothing extra', nbRes2.ok)
  ;({ data: m1 } = await db.from('merchants').select('negative_balance').eq('id', merchant.id).single())
  check('credit is still exactly once', money(m1.negative_balance) === -NET, String(m1.negative_balance))

  // ── Retry before fixing ───────────────────────────────────────────────────
  section('Retry before the account exists')
  const early = await call('/api/admin/settlement/retry-transfer', { statementId: stmt.id })
  const earlyBody = await early.json().catch(() => ({}))
  check('refused with no_connect_account', early.status === 422 && earlyBody.error === 'no_connect_account',
    `${early.status} ${earlyBody.error}`)

  // ── A real account, but not yet payable ───────────────────────────────────
  section('Account connected but payouts not enabled')
  const acct = await makeUnpayableAccount()
  check('test Connect account created', !!acct.id, acct.id)
  check('Stripe reports it cannot pay out yet', acct.payouts_enabled === false,
    `payouts_enabled=${acct.payouts_enabled}`)
  await db.from('merchants').update({ stripe_connect_id: acct.id }).eq('id', merchant.id)

  const notReady = await call('/api/admin/settlement/retry-transfer', { statementId: stmt.id })
  const notReadyBody = await notReady.json().catch(() => ({}))
  check('retry refused with payouts_disabled', notReady.status === 422 && notReadyBody.error === 'payouts_disabled',
    `${notReady.status} ${notReadyBody.error}`)

  let { data: sNR } = await db.from('merchant_settlement_statements')
    .select('stripe_transfer_id, carried_forward_amount').eq('id', stmt.id).single()
  check('still no transfer id', sNR.stripe_transfer_id === null)
  check('carry-forward left intact', money(sNR.carried_forward_amount) === NET, String(sNR.carried_forward_amount))

  const { data: mNR } = await db.from('merchants').select('negative_balance').eq('id', merchant.id).single()
  check('credit untouched by the refusal', money(mNR.negative_balance) === -NET, String(mNR.negative_balance))

  check('the live check refreshed the cached payouts flag', true, 'see merchants.payouts_enabled')
  const { data: mFlag } = await db.from('merchants').select('payouts_enabled').eq('id', merchant.id).single()
  check('cached payouts_enabled is false', mFlag.payouts_enabled === false, String(mFlag.payouts_enabled))

  // ── Every refusal that stands between a click and a second payment ────────
  section('Guards against paying twice')

  // Pretend the transfer landed. This is exactly the state the route must
  // refuse, and it is the one that matters most.
  await db.from('merchant_settlement_statements')
    .update({ stripe_transfer_id: 'tr_zzretry_simulated', statement_status: 'transferred' })
    .eq('id', stmt.id)

  const paid = await call('/api/admin/settlement/retry-transfer', { statementId: stmt.id })
  const paidBody = await paid.json().catch(() => ({}))
  check('a statement that already has a transfer is refused', paid.status === 409,
    `${paid.status} ${paidBody.reason ?? paidBody.error}`)
  check('and it says so plainly', paidBody.reason === 'already_paid', String(paidBody.reason))

  const transfersNow = await stripe.transfers.list({ destination: acct.id, limit: 100 })
  check('NO transfer was ever created at Stripe', transfersNow.data.length === 0,
    `${transfersNow.data.length} transfer(s)`)

  // Back to failed, but with nothing owed.
  await db.from('merchant_settlement_statements')
    .update({ stripe_transfer_id: null, statement_status: 'failed', net_distribution: 0 })
    .eq('id', stmt.id)
  const zero = await call('/api/admin/settlement/retry-transfer', { statementId: stmt.id })
  const zeroBody = await zero.json().catch(() => ({}))
  check('a statement owing nothing is refused', zero.status === 409 && zeroBody.error === 'nothing_owed',
    `${zero.status} ${zeroBody.error}`)

  // A statement that is not in a failed state at all.
  await db.from('merchant_settlement_statements')
    .update({ statement_status: 'draft', net_distribution: NET })
    .eq('id', stmt.id)
  const notFailed = await call('/api/admin/settlement/retry-transfer', { statementId: stmt.id })
  const notFailedBody = await notFailed.json().catch(() => ({}))
  check('a statement that did not fail is refused', notFailed.status === 409 && notFailedBody.error === 'not_failed',
    `${notFailed.status} ${notFailedBody.error}`)

  const missing = await call('/api/admin/settlement/retry-transfer',
    { statementId: '00000000-0000-0000-0000-000000000000' })
  check('an unknown statement is 404', missing.status === 404, String(missing.status))

  const anon = await fetch(`${BASE}/api/admin/settlement/retry-transfer`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ statementId: stmt.id }), redirect: 'manual',
  })
  check('retry without an admin session is refused', anon.status === 401, String(anon.status))

  const { data: bEnd } = await db.from('settlement_batches').select('status').eq('id', batch.id).single()
  check('batch was never reopened by any of it', bEnd.status === 'locked', bEnd.status)

  // ── Real merchants ────────────────────────────────────────────────────────
  section('Real merchants untouched')
  check('Bin Chasers byte-identical before and after', (await binChasers()) === chasersBefore)
  const { data: realBatches } = await db.from('settlement_batches')
    .select('settlement_period').neq('settlement_period', TEST_PERIOD)
  check('no real settlement batch was created', (realBatches ?? []).length === 0,
    `${(realBatches ?? []).length} real batches`)
}

try {
  await run()
} catch (err) {
  fail++
  console.error('\nUNCAUGHT:', err)
} finally {
  section('Cleanup')
  try {
    await cleanup()
    const { data: left } = await db.from('merchants').select('id').ilike('company_name', `${TAG}%`)
    const { data: batches } = await db.from('settlement_batches').select('id').eq('settlement_period', TEST_PERIOD)
    check('no ZZRetry merchants remain', (left ?? []).length === 0)
    check('no test batch remains', (batches ?? []).length === 0)
  } catch (err) {
    fail++; console.error('CLEANUP FAILED:', err)
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}
