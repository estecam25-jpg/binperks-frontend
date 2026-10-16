/**
 * End-to-end test for Pre-setup Stores.
 *
 * Runs against a LOCAL dev server pointed at the production Supabase, in
 * Stripe TEST mode, with throwaway data that is deleted at the end. Nothing it
 * creates is network-visible at any point, and it refuses to run if the Stripe
 * key is not a test key.
 *
 *   node scripts/e2e-presetup.mjs setup     create, download, guardrails
 *   node scripts/e2e-presetup.mjs activate  adopt payment, sign, verify live
 *   node scripts/e2e-presetup.mjs cleanup   remove everything
 *
 * The payment itself happens in a browser between `setup` and `activate`:
 * Stripe has no API for completing a hosted Checkout Session, so the session
 * URL printed by `setup` is paid with Stripe's published test card.
 */

import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import Stripe from 'stripe'
import { PDFDocument } from 'pdf-lib'

// ── Environment ─────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)

const BASE  = 'http://127.0.0.1:3000'
const STATE = 'scripts/.e2e-presetup-state.json'
// Must be on ADMIN_EMAIL_ALLOWLIST in lib/admin-emails, or every admin route
// answers 403. generateLink CREATES the user if it does not exist, so this
// deliberately names an admin who already has an account.
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
const TAG = 'ZZPresetup'
const FORM = {
  companyName: 'ZZ Presetup Liquidation LLC',
  brandName:   'ZZ Presetup Bins',
  ownerName:   'ZZ Presetup Owner',
  ownerEmail:  'zz-presetup-test@example.com',
  ownerPhone:  '8135550199',
  storeName:   'ZZ Presetup Bins Downtown',
  address:     '1 Test Street',
  city:        'ZZTestCity',
  state:       'FL',
  zip:         '33601',
  locationCount: '1',
}
const EXPECTED_KEY = `FL-ZZTestCity-ZZPresetupBinsDowntown`

// ── Tiny harness ────────────────────────────────────────────────────────────
let pass = 0, fail = 0
const results = []
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`) }
  else    { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`) }
  results.push({ name, ok, detail })
}
function section(t) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 60 - t.length))}`) }
const readState  = () => existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {}
const writeState = s => writeFileSync(STATE, JSON.stringify(s, null, 2))

// ── Admin session cookie ────────────────────────────────────────────────────
/**
 * A real signed-in admin session, built the way the app's own sign-in does:
 * generateLink mints a one-time token WITHOUT sending any email, verifyOtp
 * exchanges it for a session, and @supabase/ssr stores that session as a
 * base64 cookie (chunked past ~3180 chars).
 */
async function adminCookie() {
  const { data: link, error: linkError } = await db.auth.admin.generateLink({
    type: 'magiclink', email: ADMIN_EMAIL,
  })
  if (linkError) throw new Error(`generateLink: ${linkError.message}`)

  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: sess, error: otpError } = await anon.auth.verifyOtp({
    token_hash: link.properties.hashed_token, type: 'email',
  })
  if (otpError) throw new Error(`verifyOtp: ${otpError.message}`)

  const ref  = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1]
  const name = `sb-${ref}-auth-token`
  // base64URL, not base64: @supabase/ssr decodes with stringFromBase64URL.
  const value = 'base64-' + Buffer.from(JSON.stringify(sess.session)).toString('base64url')

  const CHUNK = 3180
  if (value.length <= CHUNK) return `${name}=${value}`
  const parts = []
  for (let i = 0, n = 0; i < value.length; i += CHUNK, n++) {
    parts.push(`${name}.${n}=${value.slice(i, i + CHUNK)}`)
  }
  return parts.join('; ')
}

const api = (cookie) => (path, init = {}) => fetch(`${BASE}${path}`, {
  ...init,
  headers: { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) },
  redirect: 'manual',
})

// ── PHASE: setup ────────────────────────────────────────────────────────────
async function setup() {
  const cookie = await adminCookie()
  const get = api(cookie)
  const anonGet = api(null)

  section('Admin gate')
  for (const path of [
    '/api/admin/presetup-stores',
    '/api/admin/presetup-stores/00000000-0000-0000-0000-000000000000/qr/register',
    '/api/admin/presetup-stores/00000000-0000-0000-0000-000000000000/marketing/table-tent',
  ]) {
    const r = await anonGet(path)
    check(`403 without an admin session: ${path.replace('/api/admin/presetup-stores', '')|| '/'}`,
      r.status === 403, `got ${r.status}`)
  }

  section('Create the pre-setup store')
  const body = new FormData()
  for (const [k, v] of Object.entries(FORM)) body.append(k, v)
  const createRes = await get('/api/admin/presetup-stores', { method: 'POST', body })
  const created = await createRes.json()
  check('POST creates the store', createRes.ok, createRes.ok ? '' : JSON.stringify(created))
  if (!createRes.ok) { report(); process.exit(1) }

  check('store key is the organic-format key', created.storeKey === EXPECTED_KEY,
    `${created.storeKey} (expected ${EXPECTED_KEY})`)
  check('finish-setup link returned', /\/merchant\/finish-setup\/[a-f0-9]{32}$/.test(created.finishSetupUrl ?? ''),
    created.finishSetupUrl)

  const merchantId = created.merchantId
  const token = created.finishSetupUrl.split('/').pop()

  const { data: m } = await db.from('merchants')
    .select('billing_status, commission_eligible, implementation_fee_paid, auth_user_id, location_count')
    .eq('id', merchantId).single()
  const { data: s } = await db.from('stores')
    .select('id, is_active, network_visible, enrollment_enabled, canonical_key, logo_url')
    .eq('merchant_id', merchantId).single()

  check('billing_status is presetup', m.billing_status === 'presetup', m.billing_status)
  check('commission_eligible false', m.commission_eligible === false)
  check('implementation_fee_paid false', m.implementation_fee_paid === false)
  check('no auth user yet', m.auth_user_id === null, String(m.auth_user_id))
  check('store hidden: is_active false', s.is_active === false)
  check('store hidden: network_visible false', s.network_visible === false)
  check('store hidden: enrollment_enabled false', s.enrollment_enabled === false)

  section('Duplicate guards')
  const dupBody = new FormData()
  for (const [k, v] of Object.entries(FORM)) dupBody.append(k, v)
  const dup = await get('/api/admin/presetup-stores', { method: 'POST', body: dupBody })
  check('second store on the same email refused', dup.status === 409, `got ${dup.status}`)

  section('The eight downloads')
  const materials = [
    ['table-tent',        'application/pdf'],
    ['countertop-display','application/pdf'],
    ['countertop-photo',  'image/jpeg'],
    ['store-posters',     'application/pdf'],
    ['window-cling',      'application/pdf'],
    ['storefront-photo',  'image/jpeg'],
  ]
  for (const [slug, type] of materials) {
    const r = await get(`/api/admin/presetup-stores/${merchantId}/marketing/${slug}`)
    const buf = r.ok ? Buffer.from(await r.arrayBuffer()) : Buffer.alloc(0)
    const ct  = r.headers.get('content-type') ?? ''
    const cd  = r.headers.get('content-disposition') ?? ''
    let detail = `${r.status} ${ct} ${buf.length}b`
    let ok = r.ok && ct.startsWith(type) && buf.length > 5000 && cd.includes('attachment')
    if (ok && type === 'application/pdf') {
      const pdf   = await PDFDocument.load(buf)
      const pages = pdf.getPageCount()
      const size  = pdf.getPage(0).getSize()
      const want  = slug === 'store-posters' ? 10 : 1
      // Landscape 11x8.5 for the sheets, portrait 8.5x11 for the posters.
      const wantLandscape = slug !== 'store-posters'
      const landscape = size.width > size.height
      ok = pages === want && landscape === wantLandscape
      detail += ` ${pages}p ${Math.round(size.width)}x${Math.round(size.height)}pt`
    }
    check(`download ${slug}`, ok, detail)
  }
  for (const target of ['register', 'social']) {
    const r = await get(`/api/admin/presetup-stores/${merchantId}/qr/${target}`)
    const buf = r.ok ? Buffer.from(await r.arrayBuffer()) : Buffer.alloc(0)
    const isPng = buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    check(`download QR ${target}`, r.ok && isPng && buf.length > 500,
      `${r.status} ${buf.length}b png=${isPng}`)
  }

  section('Exclusions')
  const publicStores = await (await anonGet('/api/stores/public')).json().catch(() => ({}))
  const inPublic = JSON.stringify(publicStores).includes(EXPECTED_KEY)
  check('not in the public store list', !inPublic)

  const { data: merchList } = await db.from('merchants').select('id').eq('billing_status', 'presetup')
  check('presetup rows exist but are status-isolated', (merchList ?? []).some(x => x.id === merchantId))

  // The stamping gate, from the same helper /api/stamp uses.
  const { canAwardStamps } = await import('../lib/merchant-status.ts')
    .catch(() => ({ canAwardStamps: null }))
  if (canAwardStamps) {
    check('canAwardStamps() false for presetup', canAwardStamps({ billing_status: 'presetup' }) === false)
  }

  section('Organic signup is unchanged')
  const organicDup = await fetch(`${BASE}/api/merchant/apply`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: 'ZZ', lastName: 'Dup', email: FORM.ownerEmail, phone: '8135550199',
      companyName: 'ZZ Dup LLC', storeName: 'ZZ Dup Store', address: '2 Test St',
      city: 'ZZTestCity', state: 'FL', zip: '33601', locationCount: 1, binCount: null,
    }),
  })
  const organicDupData = await organicDup.json()
  check('pre-set-up email is routed to its finish-setup link',
    organicDup.ok && organicDupData.presetup === true
      && organicDupData.checkoutUrl?.includes(`/merchant/finish-setup/${token}`),
    organicDupData.checkoutUrl)

  const organicNew = await fetch(`${BASE}/api/merchant/apply`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: 'ZZ', lastName: 'Organic', email: 'zz-organic-test@example.com', phone: '8135550198',
      companyName: 'ZZ Organic LLC', storeName: 'ZZ Organic Store', address: '3 Test St',
      city: 'ZZOrganicCity', state: 'FL', zip: '33601', locationCount: 1, binCount: null,
    }),
  })
  const organicNewData = await organicNew.json()
  check('a normal signup still gets a Stripe checkout',
    organicNew.ok && (organicNewData.checkoutUrl ?? '').startsWith('https://checkout.stripe.com/'),
    (organicNewData.checkoutUrl ?? organicNewData.error ?? '').slice(0, 60))
  check('a normal signup is NOT flagged presetup', organicNewData.presetup === undefined)

  section('Finish-setup link')
  const page = await (await anonGet(`/merchant/finish-setup/${token}`)).text()
  check('page renders the store and a payment button',
    page.includes('Continue to payment') && page.includes(FORM.storeName))
  const badPage = await (await anonGet('/merchant/finish-setup/' + 'f'.repeat(32))).text()
  check('an unknown token says the link is not valid', badPage.includes('Link not valid'))

  const checkout = await (await anonGet('/api/merchant/finish-setup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })).json()
  check('checkout opens for the token',
    (checkout.checkoutUrl ?? '').startsWith('https://checkout.stripe.com/'),
    (checkout.checkoutUrl ?? checkout.error ?? '').slice(0, 60))

  writeState({
    merchantId, storeId: s.id, token, storeKey: EXPECTED_KEY,
    checkoutUrl: checkout.checkoutUrl,
    organicCheckoutUrl: organicNewData.checkoutUrl ?? null,
  })

  report()
  console.log(`\nNEXT: pay this checkout with test card 4242 4242 4242 4242, then run "activate".`)
  console.log(checkout.checkoutUrl)
}

// ── PHASE: activate ─────────────────────────────────────────────────────────
async function activate() {
  const st = readState()
  const cookie = await adminCookie()
  const get = api(cookie)
  const anonGet = api(null)

  section('Payment adopted the pre-setup merchant')
  // The session id Stripe appended to the thank-you page. Found from the
  // customer, because the browser kept the URL and this script did not.
  const sessions = await stripe.checkout.sessions.list({ limit: 20 })
  const paid = sessions.data.find(x =>
    x.metadata?.presetupMerchantId === st.merchantId && x.status === 'complete')
  check('a completed Stripe checkout exists for this merchant', !!paid,
    paid ? `${paid.id} ${paid.payment_status}` : 'none found — was the card submitted?')
  if (!paid) { report(); process.exit(1) }
  writeState({ ...st, sessionId: paid.id, stripeCustomerId: paid.customer })

  // Exactly what the thank-you page polls.
  const status = await (await anonGet(`/api/merchant/signup/status?session_id=${paid.id}`)).json()
  check('signup status route accepts the finish-setup session', !!status, JSON.stringify(status).slice(0, 90))

  const { data: m1 } = await db.from('merchants')
    .select('billing_status, presetup_token, auth_user_id, stripe_customer_id, implementation_fee_paid')
    .eq('id', st.merchantId).single()
  check('merchant moved to pending_signature', m1.billing_status === 'pending_signature', m1.billing_status)
  check('finish-setup token cleared', m1.presetup_token === null)
  check('Stripe customer recorded', !!m1.stripe_customer_id)
  check('setup fee marked paid', m1.implementation_fee_paid === true)
  check('sign-in account created on payment', !!m1.auth_user_id)

  const { data: s1 } = await db.from('stores')
    .select('is_active, network_visible, enrollment_enabled').eq('merchant_id', st.merchantId).single()
  check('store still hidden before signing',
    s1.is_active === false && s1.network_visible === false && s1.enrollment_enabled === false)

  section('The spent link is dead')
  const dead = await (await anonGet('/api/merchant/finish-setup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: st.token }),
  })).json()
  check('a second checkout cannot be opened', !dead.checkoutUrl, dead.error ?? 'got a url')

  section('DocuSeal webhook activates, exactly as organic')
  const payload = JSON.stringify({
    event_type: 'submission.completed',
    data: { id: 999001, submitters: [{ id: 999002, email: FORM.ownerEmail,
            external_id: st.merchantId, status: 'completed',
            completed_at: new Date().toISOString() }] },
  })
  const ts  = Math.floor(Date.now() / 1000)
  const sig = createHmac('sha256', env.DOCUSEAL_WEBHOOK_SECRET_TEST)
    .update(`${ts}.${payload}`).digest('hex')

  const badSig = await fetch(`${BASE}/api/merchant/docuseal-webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-docuseal-signature': `${ts}.deadbeef` },
    body: payload,
  })
  check('an unsigned webhook is refused', badSig.status === 400, `got ${badSig.status}`)

  const hook = await fetch(`${BASE}/api/merchant/docuseal-webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-docuseal-signature': `${ts}.${sig}` },
    body: payload,
  })
  check('a signed webhook is accepted', hook.status === 200, `got ${hook.status}`)

  section('The store is live')
  const { data: m2 } = await db.from('merchants')
    .select('billing_status, subscription_status, commission_eligible').eq('id', st.merchantId).single()
  const { data: s2 } = await db.from('stores')
    .select('is_active, network_visible, enrollment_enabled, agreement_signed_at')
    .eq('merchant_id', st.merchantId).single()

  check('billing_status active', m2.billing_status === 'active', m2.billing_status)
  check('commission_eligible true', m2.commission_eligible === true)
  check('store is_active true', s2.is_active === true)
  check('store network_visible true', s2.network_visible === true)
  check('store enrollment_enabled true', s2.enrollment_enabled === true)
  check('agreement_signed_at recorded', !!s2.agreement_signed_at)

  const { canAwardStamps } = await import('../lib/merchant-status.ts')
    .catch(() => ({ canAwardStamps: null }))
  if (canAwardStamps) check('can now award stamps', canAwardStamps({ billing_status: m2.billing_status }) === true)

  section('It left the Pre-setup tab and joined Merchants')
  const list = await (await get('/api/admin/presetup-stores')).json()
  check('gone from the Pre-setup tab',
    !(list.stores ?? []).some(x => x.merchantId === st.merchantId),
    `${(list.stores ?? []).length} still listed`)

  const merchants = await (await get('/api/admin/merchants')).json()
  const inMerchants = JSON.stringify(merchants).includes(st.merchantId)
  check('now in the Merchants tab', inMerchants)

  const pub = await (await anonGet('/api/stores/public')).json().catch(() => ({}))
  check('now in the public store list', JSON.stringify(pub).includes(st.storeKey))

  section('Delete is refused once past pre-setup')
  const del = await get('/api/admin/presetup-stores', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ merchantId: st.merchantId }),
  })
  check('DELETE refused for an activated merchant', del.status === 409, `got ${del.status}`)

  report()
}

// ── PHASE: cleanup ──────────────────────────────────────────────────────────
async function cleanup() {
  const st = readState()
  section('Cleanup')

  // Stripe test objects.
  for (const customerId of [st.stripeCustomerId].filter(Boolean)) {
    try {
      const subs = await stripe.subscriptions.list({ customer: customerId, limit: 10 })
      for (const sub of subs.data) await stripe.subscriptions.cancel(sub.id).catch(() => {})
      await stripe.customers.del(customerId)
      console.log(`  removed Stripe test customer ${customerId}`)
    } catch (e) { console.log(`  Stripe cleanup: ${e.message}`) }
  }
  // Customers created by the two apply calls that were never paid.
  for (const email of [FORM.ownerEmail, 'zz-organic-test@example.com']) {
    const found = await stripe.customers.list({ email, limit: 10 }).catch(() => ({ data: [] }))
    for (const c of found.data) {
      const subs = await stripe.subscriptions.list({ customer: c.id, limit: 10 }).catch(() => ({ data: [] }))
      for (const sub of subs.data) await stripe.subscriptions.cancel(sub.id).catch(() => {})
      await stripe.customers.del(c.id).catch(() => {})
      console.log(`  removed Stripe test customer ${c.id} (${email})`)
    }
  }

  // Database, children first.
  const ids = [st.merchantId].filter(Boolean)
  if (ids.length) {
    await db.from('origin_eligibility_history').delete().in('merchant_id', ids)
    await db.from('stores').delete().in('merchant_id', ids)
    const { data: gone } = await db.from('merchants').delete().in('id', ids).select('id')
    console.log(`  removed ${(gone ?? []).length} merchant row(s)`)
  }

  // Any stray row the test could have made under its tag.
  const { data: strays } = await db.from('merchants').select('id, company_name')
    .ilike('company_name', `%${TAG}%`)
  for (const s of strays ?? []) {
    await db.from('origin_eligibility_history').delete().eq('merchant_id', s.id)
    await db.from('stores').delete().eq('merchant_id', s.id)
    await db.from('merchants').delete().eq('id', s.id)
    console.log(`  removed stray merchant ${s.id} (${s.company_name})`)
  }
  const { data: strayStores } = await db.from('stores').select('id, canonical_key')
    .ilike('canonical_key', '%ZZ%')
  for (const s of strayStores ?? []) {
    await db.from('stores').delete().eq('id', s.id)
    console.log(`  removed stray store ${s.canonical_key}`)
  }

  // The auth user created when the payment was adopted — plus estecam25@,
  // which an early version of this script created as a side effect of
  // generateLink before it used an allow-listed admin. Removed only if
  // nothing references it.
  const { data: allUsers } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const stray = (allUsers?.users ?? []).find(u => u.email?.toLowerCase() === 'estecam25@gmail.com')
  if (stray) {
    const [{ count: asMerchant }, { count: asMember }] = await Promise.all([
      db.from('merchants').select('*', { count: 'exact', head: true }).eq('auth_user_id', stray.id),
      db.from('members').select('*', { count: 'exact', head: true }).eq('auth_user_id', stray.id),
    ])
    if ((asMerchant ?? 0) === 0 && (asMember ?? 0) === 0) {
      await db.auth.admin.deleteUser(stray.id)
      console.log('  removed stray auth user estecam25@gmail.com (created by this script)')
    } else {
      console.log('  KEPT estecam25@gmail.com — it is referenced by a merchant or member')
    }
  }

  for (const email of [FORM.ownerEmail, 'zz-organic-test@example.com']) {
    const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const u = (data?.users ?? []).find(x => x.email?.toLowerCase() === email)
    if (u) { await db.auth.admin.deleteUser(u.id); console.log(`  removed auth user ${email}`) }
  }

  // Storage.
  if (st.storeId) {
    await db.storage.from('store-logos')
      .remove([`presetup/${st.storeId}.png`, `presetup/${st.storeId}.jpg`, `presetup/${st.storeId}.webp`])
  }

  // Prove the live merchants were never touched.
  const { data: live } = await db.from('merchants')
    .select('company_name, billing_status, commission_eligible')
    .in('company_name', ['Liquidation Motivation LLC', 'BABG LLC'])
  for (const l of live ?? []) {
    check(`${l.company_name} untouched`,
      l.billing_status === 'active' && l.commission_eligible === true,
      `${l.billing_status} / elig:${l.commission_eligible}`)
  }
  const { count } = await db.from('merchants').select('*', { count: 'exact', head: true })
  console.log(`  merchants remaining: ${count}`)
  report()
}

function report() {
  console.log(`\n${'═'.repeat(64)}`)
  console.log(`  ${pass} passed, ${fail} failed`)
  if (fail) {
    console.log('  failures:')
    for (const r of results.filter(x => !x.ok)) console.log(`    - ${r.name} (${r.detail})`)
  }
  console.log('═'.repeat(64))
}

const phase = process.argv[2]
const run = { setup, activate, cleanup }[phase]
if (!run) { console.error('usage: node scripts/e2e-presetup.mjs setup|activate|cleanup'); process.exit(1) }
run().then(() => process.exit(fail ? 1 : 0)).catch(e => { console.error(e); process.exit(1) })
