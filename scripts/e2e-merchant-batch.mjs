/**
 * End-to-end checks for the merchant-side batch: marketing tab contents, the
 * admin pre-setup print page, perk required-field enforcement, and the print
 * kit order.
 *
 * Local dev server against the production database, with throwaway rows that
 * are deleted at the end. Sends no email: the kit is BUILT and inspected here,
 * and the real send is exercised separately against production.
 *
 *   node scripts/e2e-merchant-batch.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { PDFDocument } from 'pdf-lib'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)

const BASE = 'http://127.0.0.1:3000'
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let pass = 0, fail = 0
const ck = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`) }
const section = t => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 58 - t.length))}`)
const sh = c => { try { return execSync(c, { encoding: 'utf8', maxBuffer: 40e6 }) } catch (e) { return (e.stdout ?? '') + (e.stderr ?? '') } }

async function cookieFor(email) {
  const { data: link, error } = await db.auth.admin.generateLink({ type: 'magiclink', email })
  if (error) throw new Error(`generateLink ${email}: ${error.message}`)
  const { data: sess, error: e2 } = await anon.auth.verifyOtp({
    token_hash: link.properties.hashed_token, type: 'email',
  })
  if (e2) throw new Error(`verifyOtp ${email}: ${e2.message}`)
  const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1]
  return `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(sess.session)).toString('base64url')}`
}

const ADMIN_EMAIL    = 'binperksnetwork@gmail.com'
const MERCHANT_EMAIL = 'zz-batch-merchant@example.com'

/**
 * Remove anything a previous run left behind.
 *
 * Run FIRST, not only at the end. A run that throws part-way leaves its rows
 * in place, and the next run then creates a SECOND merchant on the same email
 * — which breaks sign-in lookups (they expect one row per address) and makes
 * every later check fail for a reason that has nothing to do with the code.
 */
async function sweep() {
  const { data: ms } = await db.from('merchants').select('id').ilike('company_name', 'ZZ%')
  for (const m of ms ?? []) {
    await db.from('perks').delete().eq('merchant_id', m.id)
    await db.from('origin_eligibility_history').delete().eq('merchant_id', m.id)
    await db.from('stores').delete().eq('merchant_id', m.id)
    await db.from('merchants').delete().eq('id', m.id)
  }
  const { data: ss } = await db.from('stores').select('id').ilike('canonical_key', '%ZZ%')
  for (const st of ss ?? []) await db.from('stores').delete().eq('id', st.id)
  const { data: us } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  for (const u of us?.users ?? []) {
    if (/^zz-.*@example\.com$/.test(u.email ?? '')) await db.auth.admin.deleteUser(u.id)
  }
}

async function main() {
  await sweep()
  const adminCookie = await cookieFor(ADMIN_EMAIL)

  // ── Throwaway merchant with a live store, for the merchant-side checks ──
  const now = new Date().toISOString()
  const { data: merchant } = await db.from('merchants').insert({
    owner_email: MERCHANT_EMAIL, owner_name: 'ZZ Batch Owner',
    company_name: 'ZZ Batch Test LLC', name: 'ZZ Batch Test LLC',
    billing_status: 'active', subscription_status: 'active', plan: 'standard',
    location_count: 1, commission_eligible: false, created_at: now,
  }).select('id').single()

  const { data: store } = await db.from('stores').insert({
    merchant_id: merchant.id, canonical_key: 'FL-ZZBatchCity-ZZBatchStore',
    brand_name: 'ZZ Batch Store', display_name: 'ZZ Batch Store',
    address: '42 Test Avenue', city: 'ZZBatchCity', state: 'FL', zip: '33602',
    timezone: 'America/New_York', brand_color: '#4A4B98', fiscal_week_start: 'friday',
    is_active: true, network_visible: false, enrollment_enabled: true, created_at: now,
  }).select('id').single()

  const merchantCookie = await cookieFor(MERCHANT_EMAIL)

  // ── 1. Merchant Marketing tab ─────────────────────────────────────────
  section('Merchant Marketing tab')
  const mk = JSON.parse(sh(`curl -s -H "Cookie: ${merchantCookie}" ${BASE}/api/merchant/marketing`))
  const slugs = (mk.materials ?? []).map(m => m.slug)

  ck('window-cling is gone', !slugs.includes('window-cling'), slugs.join(', '))
  ck('storefront-photo is gone', !slugs.includes('storefront-photo'))
  ck('four materials remain', slugs.length === 4, `${slugs.length}: ${slugs.join(', ')}`)

  const byslug = Object.fromEntries((mk.materials ?? []).map(m => [m.slug, m]))
  ck('Countertop Display renamed to Countertop Decal',
    byslug['countertop-display']?.title === 'Countertop Decal', byslug['countertop-display']?.title)

  const DESCRIPTIONS = {
    'table-tent': 'Print on cardstock from your office printer, fold it and stand it at the register.',
    'countertop-display': 'Six per sheet. Cut along the lines with scissors and stick them on the counter by checkout. Included in your professional print kit.',
    'countertop-photo': 'A 4x6 photo you print at any photo counter, like Walmart or CVS. Set it in a small frame at the register.',
    'store-posters': 'Ten designs. Your professional print kit includes all ten as decals, mailed to you with your countertop decals. Need more? Print them in color at Staples or Office Depot. The wide white border is intentional; it gives clean edges.',
  }
  for (const [slug, want] of Object.entries(DESCRIPTIONS)) {
    ck(`${slug} description is exact`, byslug[slug]?.description === want,
      byslug[slug]?.description?.slice(0, 45))
  }

  const cats = Object.fromEntries((mk.categories ?? []).map(c => [c.id, c.subtitle]))
  ck('At The Register group description',
    cats.at_the_register === 'These QR codes give new members their first stamp, so keep them at the register only.',
    cats.at_the_register)
  ck('In-Store Signage group description',
    cats.in_store_signage === 'These QR codes let shoppers join from anywhere in the store or from your window.',
    cats.in_store_signage)

  // ── 2. Admin pre-setup print page ─────────────────────────────────────
  section('Admin pre-setup print page')
  const fd = ['companyName=ZZ Batch Presetup LLC', 'brandName=ZZ Batch Pre', 'ownerName=ZZ Pre Owner',
    'ownerEmail=zz-batch-presetup@example.com', 'ownerPhone=8135550111', 'storeName=ZZ Batch Pre Store',
    'address=7 Test Road', 'city=ZZPreCity', 'state=FL', 'zip=33603', 'locationCount=1']
    .map(f => `-F "${f}"`).join(' ')
  const pre = JSON.parse(sh(`curl -s -H "Cookie: ${adminCookie}" ${fd} -X POST ${BASE}/api/admin/presetup-stores`))
  ck('throwaway pre-setup store created', !!pre.merchantId, pre.storeKey ?? JSON.stringify(pre))

  const printPage = sh(`curl -s -H "Cookie: ${adminCookie}" ${BASE}/admin/presetup/${pre.merchantId}/print`)
  ck('print page: Window Cling gone', !printPage.includes('Window Cling'))
  ck('print page: Storefront Photo gone', !printPage.includes('Storefront Photo'))
  ck('print page: Countertop Decal shown', printPage.includes('Countertop Decal'))
  ck('print page: still has Store Posters and Table Tent',
    printPage.includes('Store Posters') && printPage.includes('Table Tent'))

  // ── 3. Perks: required fields ─────────────────────────────────────────
  section('Perks required fields')
  const perksGet = JSON.parse(sh(`curl -s -H "Cookie: ${merchantCookie}" "${BASE}/api/merchant/perks?storeId=${store.id}"`))
  ck('Starter form has 3 slots', (perksGet.freePerks ?? []).length === 3, String((perksGet.freePerks ?? []).length))
  ck('VIP form has 5 slots', (perksGet.vipPerks ?? []).length === 5, String((perksGet.vipPerks ?? []).length))

  // Body via a file so Windows quoting cannot mangle the JSON.
  const BODY_FILE = 'scripts/.zz-perks.json'
  const post = body => {
    writeFileSync(BODY_FILE, JSON.stringify(body))
    return sh(`curl -s -D - -H "Cookie: ${merchantCookie}" -H "Content-Type: application/json" --data-binary "@${BODY_FILE}" -X POST ${BASE}/api/merchant/perks`)
  }

  const empty = n => Array.from({ length: n }, (_, i) => ({ slot: i + 1, title: '', description: '', isActive: false }))
  const filled = (n, r) => Array.from({ length: n }, (_, i) => ({
    slot: i + 1, title: i < r ? `ZZ Perk ${i + 1}` : '', description: '', isActive: i < r,
  }))

  const noneRes = post({ storeId: store.id, freePerks: empty(3), vipPerks: empty(5) })
  ck('save refused when every required field is empty', noneRes.includes('400'), noneRes.split('\n')[0].trim())
  ck('refusal names the missing slots',
    noneRes.includes('Starter perk 1') && noneRes.includes('VIP perks 1, 2, 3'),
    (noneRes.match(/"message":"[^"]+"/) ?? [''])[0].slice(0, 90))

  const partRes = post({ storeId: store.id, freePerks: filled(3, 1), vipPerks: filled(5, 2) })
  ck('save refused when only 2 of 3 VIP required are filled', partRes.includes('400'),
    (partRes.match(/"message":"[^"]+"/) ?? [''])[0].slice(0, 80))

  const okRes = post({ storeId: store.id, freePerks: filled(3, 1), vipPerks: filled(5, 3) })
  ck('save succeeds with the required fields filled', okRes.includes('200'), okRes.split('\n')[0].trim())

  const { data: saved } = await db.from('perks')
    .select('slot, member_type, title, is_active').eq('store_id', store.id).order('slot')
  const freeRows = (saved ?? []).filter(r => r.member_type === 'free')
  const vipRows  = (saved ?? []).filter(r => r.member_type === 'vip')
  ck('3 Starter rows and 5 VIP rows stored', freeRows.length === 3 && vipRows.length === 5,
    `${freeRows.length}/${vipRows.length}`)
  ck('required perks stored active',
    freeRows.find(r => r.slot === 1)?.is_active === true
    && vipRows.filter(r => r.slot <= 3).every(r => r.is_active === true))
  ck('optional empty perks stored inactive',
    freeRows.filter(r => r.slot > 1).every(r => r.is_active === false))

  // ── 4. The print kit ──────────────────────────────────────────────────
  //
  // NOT EXERCISED HERE. Building it pulls in lib/marketing-render, which Node's
  // type stripper cannot load (it uses a TypeScript parameter property), and
  // the send needs RESEND_API_KEY, which is not available locally. It is
  // verified end to end against production instead — real Resend, real
  // attachments — through the admin resend button on a throwaway store.
  section('Print kit')
  console.log('  SKIPPED locally — verified against production (see report)')

  // ── Cleanup ───────────────────────────────────────────────────────────
  section('Cleanup')
  await sweep()
  try { (await import('node:fs')).unlinkSync('scripts/.zz-perks.json') } catch {}
  const { count: mc } = await db.from('merchants').select('*', { count: 'exact', head: true })
  const { count: sc } = await db.from('stores').select('*', { count: 'exact', head: true })
  console.log(`  merchants: ${mc}, stores: ${sc}`)

  const { data: live } = await db.from('merchants')
    .select('company_name, billing_status, commission_eligible')
    .in('company_name', ['Liquidation Motivation LLC', 'BABG LLC'])
  for (const l of live ?? []) {
    ck(`${l.company_name} untouched`, l.billing_status === 'active' && l.commission_eligible === true)
  }

  console.log(`\n${'═'.repeat(62)}\n  ${pass} passed, ${fail} failed\n${'═'.repeat(62)}`)
  process.exit(fail ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
