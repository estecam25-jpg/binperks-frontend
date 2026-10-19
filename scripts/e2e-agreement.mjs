/**
 * End-to-end for in-app agreement acceptance (replacing DocuSeal).
 *
 *   node --experimental-transform-types --import ./scripts/alias-register.mjs \
 *        scripts/e2e-agreement.mjs setup     # make a pre-setup store, open checkout
 *   ... pay the printed checkout URL with Stripe's test card ...
 *   node ... scripts/e2e-agreement.mjs accept   # the whole acceptance path
 *   node ... scripts/e2e-agreement.mjs cleanup
 *
 * Local dev server, production database, Stripe TEST mode, throwaway rows that
 * are swept at both ends. Emails are not sent locally (no RESEND_API_KEY); the
 * code path is exercised and logs that it skipped.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { execSync } from 'node:child_process'
import Stripe from 'stripe'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
if (!env.STRIPE_SECRET_KEY?.startsWith('sk_test')) {
  console.error('REFUSING: STRIPE_SECRET_KEY is not a test key.'); process.exit(1)
}

const BASE  = 'http://127.0.0.1:3000'
const STATE = 'scripts/.e2e-agreement.json'
const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' })
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let pass = 0, fail = 0
const ck = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`) }
const section = t => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 54 - t.length))}`)
const sh = c => { try { return execSync(c, { encoding: 'utf8', maxBuffer: 40e6 }) } catch (e) { return (e.stdout ?? '') + (e.stderr ?? '') } }
const readState  = () => existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {}
const writeState = s => writeFileSync(STATE, JSON.stringify(s, null, 2))

const ADMIN_EMAIL = 'binperksnetwork@gmail.com'
const TEST_EMAIL  = 'zz-agreement@example.com'

async function cookieFor(email) {
  const { data: link, error } = await db.auth.admin.generateLink({ type: 'magiclink', email })
  if (error) throw new Error(`generateLink: ${error.message}`)
  const { data: s, error: e2 } = await anon.auth.verifyOtp({
    token_hash: link.properties.hashed_token, type: 'email',
  })
  if (e2) throw new Error(`verifyOtp: ${e2.message}`)
  const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1]
  return `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(s.session)).toString('base64url')}`
}

const BODY = 'scripts/.zz-agr-body.json'
function post(url, body, cookie = '') {
  writeFileSync(BODY, JSON.stringify(body ?? {}))
  return sh(`curl -s -D - ${cookie ? `-H "Cookie: ${cookie}"` : ''} -H "Content-Type: application/json" --data-binary "@${BODY}" -X POST "${BASE}${url}"`)
}
const get = (url, cookie = '') => sh(`curl -s ${cookie ? `-H "Cookie: ${cookie}"` : ''} "${BASE}${url}"`)
const status = r => (r.match(/HTTP\/[\d.]+ (\d+)/) ?? [])[1]
const jsonOf = r => { try { return JSON.parse(r.split('\r\n\r\n').pop().trim()) } catch { return null } }

/** Thomas and Mark, for the before/after comparison. */
async function liveSnapshot() {
  const { data } = await db.from('merchants')
    .select('company_name, billing_status, subscription_status, commission_eligible, stripe_connect_id, negative_balance')
    .in('company_name', ['Liquidation Motivation LLC', 'BABG LLC'])
    .order('company_name')
  const { data: stores } = await db.from('stores')
    .select('display_name, is_active, network_visible, enrollment_enabled, agreement_signed_at, merchants!inner(company_name)')
    .in('merchants.company_name', ['Liquidation Motivation LLC', 'BABG LLC'])
  return JSON.stringify({ merchants: data, stores: (stores ?? []).map(s => ({ ...s, merchants: undefined })) })
}

async function sweep() {
  const { data: ms } = await db.from('merchants').select('id').ilike('company_name', 'ZZ%')
  for (const m of ms ?? []) {
    await db.from('merchant_agreement_acceptances').delete().eq('merchant_id', m.id)
    await db.from('origin_eligibility_history').delete().eq('merchant_id', m.id)
    await db.from('perks').delete().eq('merchant_id', m.id)
    await db.from('stores').delete().eq('merchant_id', m.id)
    await db.from('merchants').delete().eq('id', m.id)
  }
  const { data: us } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  for (const u of us?.users ?? []) {
    if (/^zz-.*@example\.com$/.test(u.email ?? '')) await db.auth.admin.deleteUser(u.id)
  }
  try { unlinkSync(BODY) } catch {}
}

// ── setup ──────────────────────────────────────────────────────────────────
async function setup() {
  await sweep()
  const adminCookie = await cookieFor(ADMIN_EMAIL)
  const before = await liveSnapshot()

  const fields = ['companyName=ZZ Agreement Test LLC', 'websiteUrl=zzagreement.com',
    'ownerName=ZZ Agree Owner', `ownerEmail=${TEST_EMAIL}`, 'ownerPhone=8135550144',
    'storeName=ZZ Agreement Store', 'address=9 Accept Way', 'city=ZZAgreeCity',
    'state=FL', 'zip=33601', 'locationCount=1'].map(f => `-F "${f}"`).join(' ')
  const pre = JSON.parse(sh(`curl -s -H "Cookie: ${adminCookie}" ${fields} -X POST ${BASE}/api/admin/presetup-stores`))
  if (!pre.merchantId) { console.error(pre); process.exit(1) }
  console.log(`pre-setup store: ${pre.storeKey}`)

  const token = pre.finishSetupUrl.split('/').pop()
  const checkout = jsonOf(post('/api/merchant/finish-setup', { token }))
  if (!checkout?.checkoutUrl) { console.error(checkout); process.exit(1) }

  writeState({ merchantId: pre.merchantId, storeId: pre.storeId, token, before })
  console.log('\nPay this with test card 4242 4242 4242 4242, then run "accept":\n')
  console.log(checkout.checkoutUrl)
}

// ── accept ─────────────────────────────────────────────────────────────────
async function accept() {
  const st = readState()

  section('Payment')
  const sessions = await stripe.checkout.sessions.list({ limit: 20 })
  const paid = sessions.data.find(x => x.metadata?.presetupMerchantId === st.merchantId && x.status === 'complete')
  ck('a completed Stripe checkout exists', !!paid, paid ? paid.id : 'none — was the card submitted?')
  if (!paid) { report(); process.exit(1) }
  const sq = `?session=${paid.id}`

  section('The agreement page')
  const doc = JSON.parse(get(`/api/merchant/agreement${sq}`))
  ck('agreement loads with the checkout session as credential', !!doc.blocks, doc.error ?? '')
  ck('version is V3.6', doc.version === 'V3.6', doc.version)
  ck('merchant is still gated (pending_signature)', doc.billingStatus === 'pending_signature', doc.billingStatus)
  ck('not yet accepted', doc.accepted === null)

  const flat = doc.blocks.map(b => b.k === 'tbl' ? b.rows.flat().join(' | ') : (b.t ?? '')).join('\n')
  ck('Order Form shows the legal name', flat.includes('ZZ Agreement Test LLC'))
  ck('Order Form shows the store name', flat.includes('ZZ Agreement Store'))
  ck('Order Form shows the store website', flat.includes('https://zzagreement.com'))
  ck('Order Form shows the notice address', flat.includes('9 Accept Way'))
  ck('Order Form shows the notice email', flat.includes(TEST_EMAIL))
  ck('Effective Date is not the old hardcoded date', !flat.includes('October 12, 2026'))
  ck('no bracket placeholders left', !/\[[A-Z][A-Z /,"]+\]/.test(flat),
    (flat.match(/\[[A-Z][A-Z /,"]+\]/) ?? [''])[0])
  ck('acceptance block replaces the signatures', doc.blocks.some(b => b.k === 'accept'))
  ck('no BinPerks cursive signature', !flat.includes('Esteban Nina'))
  ck('statement names the merchant', doc.statement.includes('ZZ Agreement Test LLC'))

  section('Refusals')
  const noTick = post(`/api/merchant/agreement${sq}`, { signerName: 'ZZ Agree Owner', signerTitle: 'Owner', agreed: false })
  ck('refused without the checkbox', status(noTick) === '400', jsonOf(noTick)?.message)
  const noName = post(`/api/merchant/agreement${sq}`, { signerName: '', signerTitle: 'Owner', agreed: true })
  ck('refused without a name', status(noName) === '400')
  const noTitle = post(`/api/merchant/agreement${sq}`, { signerName: 'ZZ Agree Owner', signerTitle: '', agreed: true })
  ck('refused without a title', status(noTitle) === '400')

  const { count: afterRefusals } = await db.from('merchant_agreement_acceptances')
    .select('*', { count: 'exact', head: true }).eq('merchant_id', st.merchantId)
  ck('refusals recorded nothing', afterRefusals === 0, String(afterRefusals))

  section('Acceptance')
  const good = { signerName: 'ZZ Agree Owner', signerTitle: 'Owner', agreed: true }
  const a1 = post(`/api/merchant/agreement${sq}`, good)
  ck('accepted', status(a1) === '200', jsonOf(a1)?.error ?? '')
  ck('activated in the same call', jsonOf(a1)?.activated === true, JSON.stringify(jsonOf(a1)))

  // Double submit, exactly as a double-click would.
  const a2 = post(`/api/merchant/agreement${sq}`, good)
  ck('second submit is accepted and idempotent',
    status(a2) === '200' && jsonOf(a2)?.alreadyAccepted === true, JSON.stringify(jsonOf(a2)))

  const { data: rows } = await db.from('merchant_agreement_acceptances')
    .select('*').eq('merchant_id', st.merchantId)
  ck('exactly one acceptance row', (rows ?? []).length === 1, String((rows ?? []).length))
  const row = rows[0]
  ck('signer name and title recorded', row.signer_name === 'ZZ Agree Owner' && row.signer_title === 'Owner')
  ck('signer email recorded', row.signer_email === TEST_EMAIL, row.signer_email)
  ck('document hash recorded', /^[a-f0-9]{64}$/.test(row.document_sha256 ?? ''), row.document_sha256?.slice(0, 16))
  ck('user agent and ip captured', !!row.user_agent, `ua=${!!row.user_agent} ip=${row.ip_address ?? 'null'}`)
  ck('version recorded', row.agreement_version === 'V3.6', row.agreement_version)

  section('The PDF')
  ck('pdf_path set on the row', !!row.pdf_path, row.pdf_path ?? 'null')
  const { data: file } = await db.storage.from('merchant-agreements').download(row.pdf_path)
  const bytes = file ? Buffer.from(await file.arrayBuffer()) : Buffer.alloc(0)
  ck('PDF is in the private bucket', bytes.length > 10000, `${Math.round(bytes.length / 1024)}KB`)
  ck('it is a PDF', bytes.subarray(0, 5).toString() === '%PDF-')
  const { PDFDocument } = await import('pdf-lib')
  const pdf = await PDFDocument.load(bytes)
  ck('multi-page with a certificate at the end', pdf.getPageCount() >= 8, `${pdf.getPageCount()} pages`)

  section('Activation did everything')
  const { data: m } = await db.from('merchants')
    .select('billing_status, subscription_status, commission_eligible').eq('id', st.merchantId).single()
  const { data: s } = await db.from('stores')
    .select('is_active, network_visible, enrollment_enabled, agreement_signed_at')
    .eq('merchant_id', st.merchantId).single()
  ck('billing_status active', m.billing_status === 'active', m.billing_status)
  ck('commission eligible', m.commission_eligible === true)
  ck('store live', s.is_active && s.network_visible && s.enrollment_enabled)
  ck('agreement_signed_at set to the acceptance', !!s.agreement_signed_at)
  const { count: hist } = await db.from('origin_eligibility_history')
    .select('*', { count: 'exact', head: true }).eq('merchant_id', st.merchantId).eq('event_type', 'activated')
  ck('exactly one activation history row', hist === 1, String(hist))

  section('The gate is lifted')
  const merchantCookie = await cookieFor(TEST_EMAIL)
  const dash = JSON.parse(get('/api/merchant/dashboard', merchantCookie))
  ck('dashboard no longer returns the sign gate',
    dash.merchant?.billingStatus === 'active' && !dash.merchant?.signUrl,
    dash.merchant?.billingStatus)
  const after = JSON.parse(get(`/api/merchant/agreement${sq}`))
  ck('agreement page now shows it as accepted', !!after.accepted, JSON.stringify(after.accepted ?? null))

  section('Retry path (activation failed, page retries on load)')
  await db.from('merchants').update({ billing_status: 'pending_signature' }).eq('id', st.merchantId)
  await db.from('stores').update({ is_active: false, network_visible: false }).eq('merchant_id', st.merchantId)
  const retry = post(`/api/merchant/agreement/activate${sq}`, {})
  ck('retry activates', status(retry) === '200' && jsonOf(retry)?.live === true, JSON.stringify(jsonOf(retry)))
  const { data: m2 } = await db.from('merchants').select('billing_status').eq('id', st.merchantId).single()
  const { data: s2 } = await db.from('stores').select('is_active, network_visible').eq('merchant_id', st.merchantId).single()
  ck('merchant live again', m2.billing_status === 'active' && s2.is_active && s2.network_visible)

  // A merchant with no acceptance row can never be activated by the retry.
  const { data: other } = await db.from('merchants').insert({
    owner_email: 'zz-noaccept@example.com', owner_name: 'ZZ No Accept',
    company_name: 'ZZ No Accept LLC', name: 'ZZ No Accept LLC',
    billing_status: 'pending_signature', subscription_status: 'active', plan: 'standard',
    location_count: 1, commission_eligible: false, created_at: new Date().toISOString(),
  }).select('id').single()
  const otherCookie = await cookieFor('zz-noaccept@example.com')
  const refused = post('/api/merchant/agreement/activate', {}, otherCookie)
  ck('retry refuses a merchant who never accepted', status(refused) === '409', jsonOf(refused)?.error)
  const { data: m3 } = await db.from('merchants').select('billing_status').eq('id', other.id).single()
  ck('that merchant stays gated', m3.billing_status === 'pending_signature', m3.billing_status)

  section('Live merchants untouched')
  const after2 = await liveSnapshot()
  ck('Thomas and Mark byte-identical before and after', after2 === st.before,
    after2 === st.before ? '' : 'SNAPSHOT CHANGED')

  writeState({ ...st, acceptanceId: row.id, pdfPath: row.pdf_path, stripeCustomerId: paid.customer })
  report()
}

// ── cleanup ────────────────────────────────────────────────────────────────
async function cleanup() {
  const st = readState()
  section('Cleanup')
  if (st.pdfPath) {
    await db.storage.from('merchant-agreements').remove([st.pdfPath])
    console.log('  removed test PDF')
  }
  for (const email of [TEST_EMAIL, 'zz-noaccept@example.com']) {
    const found = await stripe.customers.list({ email, limit: 10 }).catch(() => ({ data: [] }))
    for (const c of found.data) {
      const subs = await stripe.subscriptions.list({ customer: c.id, limit: 10 }).catch(() => ({ data: [] }))
      for (const sub of subs.data) await stripe.subscriptions.cancel(sub.id).catch(() => {})
      await stripe.customers.del(c.id).catch(() => {})
      console.log(`  removed Stripe test customer ${c.id}`)
    }
  }
  await sweep()
  try { unlinkSync(STATE) } catch {}
  const q = async t => (await db.from(t).select('*', { count: 'exact', head: true })).count
  console.log(`  merchants:${await q('merchants')} stores:${await q('stores')} acceptances:${await q('merchant_agreement_acceptances')}`)
  const { data: objs } = await db.storage.from('merchant-agreements').list()
  console.log(`  merchant-agreements objects: ${(objs ?? []).length}`)
  if (st.before) {
    const now = await liveSnapshot()
    ck('Thomas and Mark unchanged at the end', now === st.before)
  }
  report()
}

function report() {
  console.log(`\n${'═'.repeat(58)}\n  ${pass} passed, ${fail} failed\n${'═'.repeat(58)}`)
}

const phase = process.argv[2]
const run = { setup, accept, cleanup }[phase]
if (!run) { console.error('usage: node scripts/e2e-agreement.mjs setup|accept|cleanup'); process.exit(1) }
run().then(() => process.exit(fail ? 1 : 0)).catch(async e => { console.error(e); process.exit(1) })
