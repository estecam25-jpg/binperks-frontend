/**
 * End-to-end test for editing a pre-setup store.
 *
 *   node scripts/e2e-presetup-edit.mjs
 *
 * Runs against a LOCAL dev server pointed at the production Supabase. It
 * creates its own throwaway stores (every name prefixed ZZ), edits one of
 * them, and deletes both at the end whether it passed or failed.
 *
 * THE POINT OF THE TEST is the one thing editing must never do: move the join
 * link. Esteban prints posters before the visit, so the QR codes are already
 * in a box by the time anyone fixes a typo in the store name. The suite
 * therefore downloads both QR PNGs and the finish-setup page before the edit
 * and again afterwards, and compares the QR bytes directly.
 *
 * It touches no real merchant. The two Bin Chasers rows are read before and
 * after and compared field by field, and the four real pre-setup stores are
 * never named, edited or deleted — cleanup only ever removes merchants whose
 * company_name starts with the ZZ tag.
 *
 * No Stripe call is made: editing happens entirely before payment.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

// ── Environment ─────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)

const BASE = 'http://127.0.0.1:3000'
// Must already exist and be on the admin allow-list — generateLink would
// otherwise create the account rather than sign into it.
const ADMIN_EMAIL = 'binperksnetwork@gmail.com'

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Throwaway identities ────────────────────────────────────────────────────
/** Everything cleanup is allowed to delete starts with this. */
const TAG = 'ZZEdit'

const BEFORE = {
  companyName:   'ZZEdit Original Liquidation LLC',
  websiteUrl:    '',
  ownerName:     'ZZEdit Original Owner',
  ownerEmail:    'zzedit-original@example.com',
  ownerPhone:    '8135550111',
  storeName:     'ZZEdit Original Bins',
  address:       '1 Original Street',
  city:          'ZZEditCity',
  state:         'FL',
  zip:           '33601',
  locationCount: '1',
}

/** Every single field different, so nothing can pass by accident. */
const AFTER = {
  companyName:   'ZZEdit Renamed Liquidation LLC',
  websiteUrl:    'zzedit-renamed.com',
  ownerName:     'ZZEdit Renamed Owner',
  ownerEmail:    'zzedit-renamed@example.com',
  ownerPhone:    '7275550222',
  storeName:     'ZZEdit Renamed Bins Uptown',
  address:       '2 Renamed Avenue',
  city:          'ZZOtherCity',
  state:         'GA',
  zip:           '30303',
  locationCount: '3',
  storeMessage:  'ZZEdit new bins every Friday',
}

/** A second store, only so the email-clash refusal has something to clash with. */
const NEIGHBOUR = {
  companyName:   'ZZEdit Neighbour LLC',
  websiteUrl:    '',
  ownerName:     'ZZEdit Neighbour Owner',
  ownerEmail:    'zzedit-neighbour@example.com',
  ownerPhone:    '8135550333',
  storeName:     'ZZEdit Neighbour Bins',
  address:       '3 Neighbour Road',
  city:          'ZZEditCity',
  state:         'FL',
  zip:           '33602',
  locationCount: '1',
}

const EXPECTED_KEY = 'FL-ZZEditCity-ZZEditOriginalBins'

// ── Tiny harness ────────────────────────────────────────────────────────────
let pass = 0, fail = 0
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`) }
  else    { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`) }
}
function section(t) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 58 - t.length))}`) }

// ── Admin session cookie ────────────────────────────────────────────────────
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
  const value = 'base64-' + Buffer.from(JSON.stringify(sess.session)).toString('base64url')

  const CHUNK = 3180
  if (value.length <= CHUNK) return `${name}=${value}`
  const parts = []
  for (let i = 0, n = 0; i < value.length; i += CHUNK, n++) {
    parts.push(`${name}.${n}=${value.slice(i, i + CHUNK)}`)
  }
  return parts.join('; ')
}

const api = cookie => (path, init = {}) => fetch(`${BASE}${path}`, {
  ...init,
  headers: { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) },
  redirect: 'manual',
})

const formData = obj => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(obj)) fd.append(k, String(v))
  return fd
}

/** A one-pixel PNG, so the logo path is exercised without shipping a fixture. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const sha = buf => createHash('sha256').update(Buffer.from(buf)).digest('hex')

/** Everything about the two Bin Chasers merchants that a bug could disturb. */
async function binChasersSnapshot() {
  const { data } = await db
    .from('merchants')
    .select('id, company_name, owner_email, owner_name, phone, billing_status, '
          + 'commission_eligible, location_count, stripe_connect_id, negative_balance')
    .in('company_name', ['Liquidation Motivation LLC', 'BABG LLC'])
    .order('company_name')
  const { data: stores } = await db
    .from('stores')
    .select('id, merchant_id, display_name, canonical_key, website_url, store_message, '
          + 'is_active, network_visible, enrollment_enabled, agreement_signed_at')
    .in('merchant_id', (data ?? []).map(m => m.id))
    .order('display_name')
  return JSON.stringify({ merchants: data, stores })
}

// ── Cleanup, safe to call at any point ──────────────────────────────────────
async function cleanup(quiet = false) {
  const { data: mine } = await db
    .from('merchants').select('id, company_name, billing_status')
    .ilike('company_name', `${TAG}%`)

  for (const m of mine ?? []) {
    // The guard is the tag, checked again here rather than trusted from the
    // query: nothing without it is ever deleted by this script.
    if (!String(m.company_name ?? '').startsWith(TAG)) continue

    const { data: stores } = await db.from('stores').select('id').eq('merchant_id', m.id)
    for (const s of stores ?? []) {
      await db.storage.from('store-logos')
        .remove([`presetup/${s.id}.png`, `presetup/${s.id}.jpg`, `presetup/${s.id}.webp`])
    }
    await db.from('stores').delete().eq('merchant_id', m.id)
    await db.from('merchants').delete().eq('id', m.id)
    if (!quiet) console.log(`  removed ${m.company_name}`)
  }
  return (mine ?? []).length
}

// ── The run ─────────────────────────────────────────────────────────────────
async function run() {
  const cookie = await adminCookie()
  const call     = api(cookie)
  const anonCall = api(null)

  section('Starting clean')
  const leftovers = await cleanup(true)
  check('no ZZEdit rows left from a previous run', true, `removed ${leftovers}`)

  const binChasersBefore = await binChasersSnapshot()

  // ── Admin gate ────────────────────────────────────────────────────────────
  section('Admin gate')
  const anonPatch = await anonCall('/api/admin/presetup-stores', {
    method: 'PATCH', body: formData({ merchantId: 'x', ...BEFORE }),
  })
  check('PATCH without an admin session is 403', anonPatch.status === 403, `got ${anonPatch.status}`)

  // ── Create ────────────────────────────────────────────────────────────────
  section('Create the throwaway store')
  const createRes = await call('/api/admin/presetup-stores', { method: 'POST', body: formData(BEFORE) })
  const created = await createRes.json()
  check('POST creates the store', createRes.ok, createRes.ok ? '' : JSON.stringify(created))
  if (!createRes.ok) return

  const merchantId = created.merchantId
  const token      = created.finishSetupUrl.split('/').pop()
  check('store key is the organic-format key', created.storeKey === EXPECTED_KEY, created.storeKey)

  const neighbourRes = await call('/api/admin/presetup-stores', { method: 'POST', body: formData(NEIGHBOUR) })
  check('second throwaway store created', neighbourRes.ok)

  // ── What the owner would see BEFORE the edit ──────────────────────────────
  section('Capture the before state')
  const qrBefore = {}
  for (const target of ['register', 'social']) {
    const r = await call(`/api/admin/presetup-stores/${merchantId}/qr/${target}`)
    qrBefore[target] = sha(await r.arrayBuffer())
  }
  const pageBefore = await (await fetch(`${BASE}/merchant/finish-setup/${token}`)).text()
  check('finish-setup page shows the original store name',
    pageBefore.includes(BEFORE.storeName), BEFORE.storeName)
  check('finish-setup page shows the original business name',
    pageBefore.includes(BEFORE.companyName))
  check('finish-setup page shows the one-location price',
    pageBefore.includes('299.99'), 'due today 200 + 99.99')

  // ── Validation: same rules as create, and nothing written ─────────────────
  section('Validation refusals')
  const refusals = [
    ['missing business name', { ...AFTER, companyName: '' }],
    ['missing owner name',    { ...AFTER, ownerName: '' }],
    ['missing store name',    { ...AFTER, storeName: '' }],
    ['missing city',          { ...AFTER, city: '' }],
    ['email with no @',       { ...AFTER, ownerEmail: 'not-an-email' }],
    ['one-letter state',      { ...AFTER, state: 'F' }],
  ]
  for (const [label, body] of refusals) {
    const r = await call('/api/admin/presetup-stores', {
      method: 'PATCH', body: formData({ merchantId, ...body }),
    })
    check(`400 on ${label}`, r.status === 400, `got ${r.status}`)
  }

  const clashRes = await call('/api/admin/presetup-stores', {
    method: 'PATCH', body: formData({ merchantId, ...AFTER, ownerEmail: NEIGHBOUR.ownerEmail }),
  })
  check('409 when another merchant already has that email', clashRes.status === 409, `got ${clashRes.status}`)

  const { data: untouched } = await db.from('merchants')
    .select('company_name, owner_email, location_count').eq('id', merchantId).single()
  check('a refused edit changed nothing',
    untouched.company_name === BEFORE.companyName
    && untouched.owner_email === BEFORE.ownerEmail
    && Number(untouched.location_count) === 1,
    `${untouched.company_name} / ${untouched.owner_email} / ${untouched.location_count}`)

  // ── The edit ──────────────────────────────────────────────────────────────
  section('Edit every field')
  const body = formData({ merchantId, ...AFTER })
  body.append('logo', new File([PNG_1PX], 'logo.png', { type: 'image/png' }))

  const editRes = await call('/api/admin/presetup-stores', { method: 'PATCH', body })
  const edited  = await editRes.json()
  check('PATCH succeeds', editRes.ok, editRes.ok ? '' : JSON.stringify(edited))
  check('response reports the unchanged store key', edited.storeKey === EXPECTED_KEY, edited.storeKey)

  const { data: m2 } = await db.from('merchants')
    .select('company_name, name, owner_name, owner_email, phone, location_count, billing_status, presetup_token')
    .eq('id', merchantId).single()
  const { data: s2 } = await db.from('stores')
    .select('id, canonical_key, display_name, brand_name, website_url, address, city, state, zip, store_message, logo_url, is_active, network_visible, enrollment_enabled')
    .eq('merchant_id', merchantId).single()

  check('business legal name updated',  m2.company_name === AFTER.companyName, m2.company_name)
  check('merchants.name kept in step',  m2.name === AFTER.companyName)
  check('owner name updated',           m2.owner_name === AFTER.ownerName)
  check('owner email updated',          m2.owner_email === AFTER.ownerEmail)
  check('phone stored as digits only',  m2.phone === '7275550222', m2.phone)
  check('location count updated',       Number(m2.location_count) === 3, String(m2.location_count))
  check('still pre-setup',              m2.billing_status === 'presetup')
  check('finish-setup token unchanged', m2.presetup_token === token)

  check('store display name updated',   s2.display_name === AFTER.storeName, s2.display_name)
  check('brand name kept in step',      s2.brand_name === AFTER.storeName)
  check('website normalised to https',  s2.website_url === 'https://zzedit-renamed.com', String(s2.website_url))
  check('street updated',               s2.address === AFTER.address)
  check('city updated',                 s2.city === AFTER.city)
  check('state updated',                s2.state === AFTER.state)
  check('ZIP updated',                  s2.zip === AFTER.zip)
  check('store message saved',          s2.store_message === AFTER.storeMessage, String(s2.store_message))
  check('logo replaced',                /presetup\/.+\.png\?v=\d+/.test(String(s2.logo_url)), String(s2.logo_url))
  check('store still hidden',
    s2.is_active === false && s2.network_visible === false && s2.enrollment_enabled === false)

  // ── The thing that must not have moved ────────────────────────────────────
  section('Join link and QR codes')
  check('canonical_key byte-identical after the edit',
    s2.canonical_key === EXPECTED_KEY, `${s2.canonical_key} (was ${EXPECTED_KEY})`)
  check('key did NOT follow the new name/city/state',
    s2.canonical_key !== 'GA-ZZOtherCity-ZZEditRenamedBinsUptown')

  for (const target of ['register', 'social']) {
    const r = await call(`/api/admin/presetup-stores/${merchantId}/qr/${target}`)
    const after = sha(await r.arrayBuffer())
    check(`${target} QR PNG byte-identical before and after`,
      after === qrBefore[target], after.slice(0, 16))
  }

  const listRes = await call('/api/admin/presetup-stores')
  const list = await listRes.json()
  const row = (list.stores ?? []).find(x => x.merchantId === merchantId)
  check('tab still shows the original join link',
    row?.storeKey === EXPECTED_KEY, String(row?.storeKey))
  check('tab shows the new store name', row?.storeName === AFTER.storeName, String(row?.storeName))
  check('tab returns the parts the edit form needs',
    row?.street === AFTER.address && row?.city === AFTER.city
    && row?.state === AFTER.state && row?.zip === AFTER.zip
    && row?.storeMessage === AFTER.storeMessage)

  // ── What the owner sees AFTER the edit ────────────────────────────────────
  section('Finish-setup pre-fill reflects the edit')
  const pageAfter = await (await fetch(`${BASE}/merchant/finish-setup/${token}`)).text()
  check('shows the new store name',    pageAfter.includes(AFTER.storeName))
  check('shows the new business name', pageAfter.includes(AFTER.companyName))
  check('shows the new owner first name', pageAfter.includes('ZZEdit,'), 'greeting uses first word')
  check('no longer shows the old store name', !pageAfter.includes(BEFORE.storeName))
  check('three locations priced',      pageAfter.includes('399.97'),
    '200 + 99.99 + 2 x 49.99')
  check('page still live and valid',   !pageAfter.includes('Link not valid'))

  // ── Re-saving the same form is not a clash with itself ────────────────────
  section('Idempotence')
  const again = await call('/api/admin/presetup-stores', {
    method: 'PATCH', body: formData({ merchantId, ...AFTER }),
  })
  check('saving the same values again succeeds', again.ok, `got ${again.status}`)

  // ── Closed once the merchant has paid ─────────────────────────────────────
  section('Edit closes after payment')
  await db.from('merchants').update({ billing_status: 'pending_signature' }).eq('id', merchantId)
  const afterPay = await call('/api/admin/presetup-stores', {
    method: 'PATCH', body: formData({ merchantId, ...AFTER, companyName: 'ZZEdit Should Not Apply LLC' }),
  })
  check('409 once the merchant is out of presetup', afterPay.status === 409, `got ${afterPay.status}`)
  const { data: m3 } = await db.from('merchants').select('company_name').eq('id', merchantId).single()
  check('the refused edit wrote nothing', m3.company_name === AFTER.companyName, m3.company_name)
  await db.from('merchants').update({ billing_status: 'presetup' }).eq('id', merchantId)

  const missing = await call('/api/admin/presetup-stores', {
    method: 'PATCH', body: formData({ merchantId: '00000000-0000-0000-0000-000000000000', ...AFTER }),
  })
  check('404 for a merchant that does not exist', missing.status === 404, `got ${missing.status}`)

  // ── The two real merchants ────────────────────────────────────────────────
  section('Real merchants untouched')
  check('Bin Chasers rows byte-identical before and after',
    (await binChasersSnapshot()) === binChasersBefore)

  const { data: realPresetup } = await db.from('merchants')
    .select('company_name').eq('billing_status', 'presetup')
    .not('company_name', 'ilike', `${TAG}%`)
  check('the four real pre-setup stores are still there',
    (realPresetup ?? []).length === 4,
    (realPresetup ?? []).map(r => r.company_name).join(', '))
}

// ── Main ────────────────────────────────────────────────────────────────────
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
    check('no ZZEdit rows remain', (left ?? []).length === 0, `${(left ?? []).length} left`)
  } catch (err) {
    fail++
    console.error('CLEANUP FAILED:', err)
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}
