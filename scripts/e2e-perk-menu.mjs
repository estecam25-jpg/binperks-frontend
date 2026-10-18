/**
 * End-to-end checks for the menu-only perks system.
 *
 * Local dev server against the production database, with throwaway rows that
 * are swept before and after. Sends no email: RESEND_API_KEY is not available
 * locally, so the alert paths log and skip — they are verified against
 * production separately.
 *
 *   node --experimental-transform-types --import ./scripts/alias-register.mjs \
 *        scripts/e2e-perk-menu.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { execSync } from 'node:child_process'

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
const section = t => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 56 - t.length))}`)
const sh = c => { try { return execSync(c, { encoding: 'utf8', maxBuffer: 40e6 }) } catch (e) { return (e.stdout ?? '') + (e.stderr ?? '') } }

const ADMIN_EMAIL    = 'binperksnetwork@gmail.com'
const MERCHANT_EMAIL = 'zz-perk-merchant@example.com'
const MEMBER_EMAIL   = 'zz-perk-member@example.com'

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

const BODY = 'scripts/.zz-body.json'
function jsonReq(method, url, cookie, body) {
  writeFileSync(BODY, JSON.stringify(body ?? {}))
  return sh(`curl -s -D - -H "Cookie: ${cookie}" -H "Content-Type: application/json" --data-binary "@${BODY}" -X ${method} ${BASE}${url}`)
}
const get = (url, cookie) => sh(`curl -s -H "Cookie: ${cookie}" "${BASE}${url}"`)
const status = r => (r.match(/HTTP\/[\d.]+ (\d+)/) ?? [])[1]
const jsonOf = r => { try { return JSON.parse(r.split('\r\n\r\n').pop().trim()) } catch { return null } }

async function sweep() {
  const { data: ms } = await db.from('merchants').select('id').ilike('company_name', 'ZZ%')
  for (const m of ms ?? []) {
    await db.from('perk_submissions').delete().eq('merchant_id', m.id)
    await db.from('perks').delete().eq('merchant_id', m.id)
    await db.from('origin_eligibility_history').delete().eq('merchant_id', m.id)
    await db.from('stores').delete().eq('merchant_id', m.id)
    await db.from('merchants').delete().eq('id', m.id)
  }
  await db.from('perk_menu').delete().ilike('title', 'ZZ%')
  const { data: mem } = await db.from('members').select('id').ilike('first_name', 'ZZ%')
  for (const x of mem ?? []) await db.from('members').delete().eq('id', x.id)
  const { data: us } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  for (const u of us?.users ?? []) {
    if (/^zz-.*@example\.com$/.test(u.email ?? '')) await db.auth.admin.deleteUser(u.id)
  }
}

async function main() {
  await sweep()
  const adminCookie = await cookieFor(ADMIN_EMAIL)

  // ── Throwaway merchant with a live store ───────────────────────────────
  const now = new Date().toISOString()
  const { data: merchant } = await db.from('merchants').insert({
    owner_email: MERCHANT_EMAIL, owner_name: 'ZZ Perk Owner',
    company_name: 'ZZ Perk Test LLC', name: 'ZZ Perk Test LLC',
    billing_status: 'active', subscription_status: 'active', plan: 'standard',
    location_count: 1, commission_eligible: false, created_at: now,
  }).select('id').single()

  const { data: store } = await db.from('stores').insert({
    merchant_id: merchant.id, canonical_key: 'FL-ZZPerkCity-ZZPerkStore',
    brand_name: 'ZZ Perk Store', display_name: 'ZZ Perk Store',
    address: '1 Perk Way', city: 'ZZPerkCity', state: 'FL', zip: '33601',
    timezone: 'America/New_York', brand_color: '#4A4B98', fiscal_week_start: 'friday',
    is_active: true, network_visible: false, enrollment_enabled: true, created_at: now,
  }).select('id').single()

  const merchantCookie = await cookieFor(MERCHANT_EMAIL)

  // ── 1. The menu ────────────────────────────────────────────────────────
  section('Perk menu')
  const menu = JSON.parse(get('/api/merchant/perk-menu', merchantCookie))
  const groups = menu.groups ?? []
  const names = groups.map(g => g.name)
  ck('grouped into Discounts / Bags / Access / Events',
    JSON.stringify(names) === JSON.stringify(['Discounts', 'Bags', 'Access', 'Events']), names.join(', '))
  ck('all 20 seeded options offered', menu.count === 20, String(menu.count))
  const counts = groups.map(g => `${g.name}:${g.perks.length}`).join(' ')
  ck('variants are separate options', counts === 'Discounts:7 Bags:6 Access:5 Events:2', counts)
  const fillABag = groups.find(g => g.name === 'Bags').perks.filter(p => p.title === 'Fill-A-Bag')
  ck('Fill-A-Bag appears once per variant', fillABag.length === 4, String(fillABag.length))
  ck('no option carries a member type',
    groups.every(g => g.perks.every(p => !('memberType' in p) && !('tier' in p))))

  const flat = groups.flatMap(g => g.perks)
  const pick = n => flat[n].id

  // ── 2. Required slots ──────────────────────────────────────────────────
  section('Required slots')
  const emptyFree = [1, 2, 3].map(slot => ({ slot, menuPerkId: null }))
  const emptyVip  = [1, 2, 3, 4, 5].map(slot => ({ slot, menuPerkId: null }))

  const r1 = jsonReq('POST', '/api/merchant/perks', merchantCookie,
    { storeId: store.id, freePerks: emptyFree, vipPerks: emptyVip })
  ck('save refused with every required slot empty', status(r1) === '400', status(r1))
  ck('refusal names the slots',
    (jsonOf(r1)?.message ?? '').includes('Starter perk 1')
    && (jsonOf(r1)?.message ?? '').includes('VIP perks 1, 2, 3'),
    jsonOf(r1)?.message)

  const partVip = [{ slot: 1, menuPerkId: pick(0) }, { slot: 2, menuPerkId: pick(1) },
                   { slot: 3, menuPerkId: null }, { slot: 4, menuPerkId: null }, { slot: 5, menuPerkId: null }]
  const r2 = jsonReq('POST', '/api/merchant/perks', merchantCookie,
    { storeId: store.id, freePerks: [{ slot: 1, menuPerkId: pick(2) }, { slot: 2, menuPerkId: null }, { slot: 3, menuPerkId: null }], vipPerks: partVip })
  ck('save refused with 2 of 3 VIP required filled', status(r2) === '400', jsonOf(r2)?.message)

  // ── 3. Saving goes live ────────────────────────────────────────────────
  section('Saving')
  const goodFree = [{ slot: 1, menuPerkId: pick(0) }, { slot: 2, menuPerkId: pick(3) }, { slot: 3, menuPerkId: null }]
  const goodVip  = [{ slot: 1, menuPerkId: pick(7) }, { slot: 2, menuPerkId: pick(13) },
                    { slot: 3, menuPerkId: pick(18) }, { slot: 4, menuPerkId: null }, { slot: 5, menuPerkId: null }]
  const r3 = jsonReq('POST', '/api/merchant/perks', merchantCookie,
    { storeId: store.id, freePerks: goodFree, vipPerks: goodVip })
  ck('save succeeds with required slots filled', status(r3) === '200', status(r3))

  const { data: saved } = await db.from('perks')
    .select('slot, member_type, title, description, is_active, menu_perk_id')
    .eq('store_id', store.id).order('slot')
  const savedFree = (saved ?? []).filter(r => r.member_type === 'free')
  const savedVip  = (saved ?? []).filter(r => r.member_type === 'vip')
  ck('rows written for both tiers', savedFree.length === 3 && savedVip.length === 5,
    `${savedFree.length}/${savedVip.length}`)
  const chosen = flat.find(p => p.id === pick(0))
  ck('menu wording is snapshot onto the row',
    savedFree[0].title === chosen.title && savedFree[0].description === chosen.description,
    savedFree[0].title)
  ck('menu id recorded', savedFree[0].menu_perk_id === pick(0))
  ck('required slots stored active',
    savedFree[0].is_active === true && savedVip.filter(r => r.slot <= 3).every(r => r.is_active))

  // ── 4. Member visibility ───────────────────────────────────────────────
  section('Member visibility')
  const { data: authMember } = await db.auth.admin.createUser({ email: MEMBER_EMAIL, email_confirm: true })
  const { data: member } = await db.from('members').insert({
    first_name: 'ZZ', last_name: 'PerkMember', phone: '8135550911', email: MEMBER_EMAIL,
    auth_user_id: authMember.user.id, status: 'active', sms_opt_in: true,
    subscription_status: 'free', total_stamps: 0, cycle_stamps: 0, vip_progression_stamps: 0,
    origin_store_id: '00000000-0000-0000-0000-b19ec5000002',
    origin_merchant_id: '00000000-0000-0000-0000-b19ec5000001',
    created_at: now,
  }).select('id').single()
  const memberCookie = await cookieFor(MEMBER_EMAIL)

  // The member route only serves network-visible stores. Opened for these
  // assertions and closed again immediately below.
  await db.from('stores').update({ network_visible: true }).eq('id', store.id)

  const seenFree = JSON.parse(get(`/api/member/stores/${store.id}/perks`, memberCookie))
  ck('store perks reachable by a member', !!seenFree.storeName, seenFree.storeName ?? JSON.stringify(seenFree))
  ck('Starter member is served the Starter perks', (seenFree.freePerks ?? []).length === 2,
    String((seenFree.freePerks ?? []).length))
  ck('VIP perks are returned for the locked preview', (seenFree.vipPerks ?? []).length === 3,
    String((seenFree.vipPerks ?? []).length))

  await db.from('members').update({ subscription_status: 'vip' }).eq('id', member.id)
  const seenVip = JSON.parse(get(`/api/member/stores/${store.id}/perks`, memberCookie))
  ck('VIP member gets BOTH lists',
    (seenVip.freePerks ?? []).length === 2 && (seenVip.vipPerks ?? []).length === 3,
    `${(seenVip.freePerks ?? []).length} starter + ${(seenVip.vipPerks ?? []).length} vip`)

  // ── 5. Hide ────────────────────────────────────────────────────────────
  section('Hide')
  const { data: toHide } = await db.from('perks')
    .select('id, title').eq('store_id', store.id).eq('member_type', 'free').eq('slot', 1).single()

  const hNoReason = jsonReq('PATCH', '/api/admin/perks', adminCookie, { perkId: toHide.id, hidden: true })
  ck('hide refused without a reason', status(hNoReason) === '400', jsonOf(hNoReason)?.message)

  const h = jsonReq('PATCH', '/api/admin/perks', adminCookie,
    { perkId: toHide.id, hidden: true, reason: 'ZZ test hide reason' })
  ck('hide accepted with a reason', status(h) === '200', status(h))

  const afterHide = JSON.parse(get(`/api/member/stores/${store.id}/perks`, memberCookie))
  ck('hidden perk is gone from member view', (afterHide.freePerks ?? []).length === 1,
    String((afterHide.freePerks ?? []).length))
  const merchantView = JSON.parse(get(`/api/merchant/perks?storeId=${store.id}`, merchantCookie))
  const hiddenSlot = (merchantView.freePerks ?? []).find(p => p.slot === 1)
  ck('merchant is told it was hidden, and why',
    hiddenSlot?.hidden === true && hiddenSlot?.hiddenReason === 'ZZ test hide reason',
    hiddenSlot?.hiddenReason)

  await db.from('stores').update({ network_visible: false }).eq('id', store.id)

  // ── 6. Submissions ─────────────────────────────────────────────────────
  section('Submissions')
  const sub = jsonReq('POST', '/api/merchant/perk-submissions', merchantCookie,
    { storeId: store.id, title: 'ZZ Coffee Hour', description: 'Free coffee while you shop on restock day.', note: 'ZZ note' })
  ck('submission accepted', status(sub) === '200', status(sub))
  ck('starts as Pending', jsonOf(sub)?.submission?.status === 'pending', jsonOf(sub)?.submission?.status)
  const subId = jsonOf(sub)?.submission?.id

  const mine = JSON.parse(get(`/api/merchant/perk-submissions?storeId=${store.id}`, merchantCookie))
  ck('merchant sees it in their list', (mine.submissions ?? []).some(s => s.id === subId))

  const queue = JSON.parse(get('/api/admin/perk-submissions', adminCookie))
  const queued = (queue.submissions ?? []).find(s => s.id === subId)
  ck('admin queue shows the store, title and note',
    queued?.storeName === 'ZZ Perk Store' && queued?.note === 'ZZ note', queued?.storeName)

  // ── 7. Approve with an edit ────────────────────────────────────────────
  section('Approve')
  const ap = jsonReq('POST', '/api/admin/perk-submissions', adminCookie, {
    id: subId, action: 'approve',
    title: 'ZZ Coffee Hour', description: 'Free coffee while you shop on truckload day.',
    groupName: 'Events',
  })
  ck('approve accepted', status(ap) === '200', status(ap))
  const newMenuId = jsonOf(ap)?.menuPerkId

  const menuAfter = JSON.parse(get('/api/merchant/perk-menu', merchantCookie))
  const added = menuAfter.groups.flatMap(g => g.perks).find(p => p.id === newMenuId)
  ck('the REVIEWED wording is what joined the menu',
    added?.description === 'Free coffee while you shop on truckload day.', added?.description)
  ck('it lands in the chosen group',
    menuAfter.groups.find(g => g.name === 'Events').perks.some(p => p.id === newMenuId))
  ck('menu grew to 21', menuAfter.count === 21, String(menuAfter.count))
  ck('the menu entry names no store', JSON.stringify(added).includes('ZZ Perk Store') === false)

  // Available to every store, not just the submitter: the menu route is not
  // scoped to a merchant, so any merchant session sees the same list.
  const { data: otherMenu } = await db.from('perk_menu').select('id').eq('id', newMenuId).single()
  ck('it is a shared menu row', !!otherMenu)

  const afterApprove = JSON.parse(get(`/api/merchant/perk-submissions?storeId=${store.id}`, merchantCookie))
  ck('merchant sees it as Approved',
    afterApprove.submissions.find(s => s.id === subId)?.status === 'approved')

  const dup = jsonReq('POST', '/api/admin/perk-submissions', adminCookie,
    { id: subId, action: 'approve', title: 'x', description: 'y', groupName: 'Events' })
  ck('a reviewed submission cannot be reviewed twice', status(dup) === '409', status(dup))

  // ── 8. Decline ─────────────────────────────────────────────────────────
  section('Decline')
  const sub2 = jsonReq('POST', '/api/merchant/perk-submissions', merchantCookie,
    { storeId: store.id, title: 'ZZ Raffle', description: 'Enter a draw to win a free bin.' })
  const sub2Id = jsonOf(sub2)?.submission?.id

  const noReason = jsonReq('POST', '/api/admin/perk-submissions', adminCookie,
    { id: sub2Id, action: 'decline' })
  ck('decline refused without a reason', status(noReason) === '400', jsonOf(noReason)?.message)

  const dec = jsonReq('POST', '/api/admin/perk-submissions', adminCookie,
    { id: sub2Id, action: 'decline', reason: 'Perks can’t involve chance.' })
  ck('decline accepted with a reason', status(dec) === '200', status(dec))

  const afterDecline = JSON.parse(get(`/api/merchant/perk-submissions?storeId=${store.id}`, merchantCookie))
  const declined = afterDecline.submissions.find(s => s.id === sub2Id)
  ck('merchant sees Declined with the reason verbatim',
    declined?.status === 'declined' && declined?.declineReason === 'Perks can’t involve chance.',
    declined?.declineReason)

  // ── 9. Retire ──────────────────────────────────────────────────────────
  section('Retire')
  const inUseId = pick(0)   // the perk hidden above is still this menu row
  const ret = jsonReq('PATCH', '/api/admin/perk-menu', adminCookie, { id: inUseId, retired: true })
  ck('retire accepted', status(ret) === '200', status(ret))

  const menuRetired = JSON.parse(get('/api/merchant/perk-menu', merchantCookie))
  ck('retired option is gone from the dropdown',
    !menuRetired.groups.flatMap(g => g.perks).some(p => p.id === inUseId))

  const { data: stillThere } = await db.from('perks')
    .select('id, title, menu_perk_id').eq('store_id', store.id).eq('menu_perk_id', inUseId)
  ck('stores already offering it keep it', (stillThere ?? []).length === 1,
    String((stillThere ?? []).length))

  const reselect = jsonReq('POST', '/api/merchant/perks', merchantCookie, {
    storeId: store.id,
    freePerks: [{ slot: 1, menuPerkId: inUseId }, { slot: 2, menuPerkId: null }, { slot: 3, menuPerkId: null }],
    vipPerks: goodVip,
  })
  ck('a retired option cannot be newly selected', status(reselect) === '400', jsonOf(reselect)?.error)

  await jsonReq('PATCH', '/api/admin/perk-menu', adminCookie, { id: inUseId, retired: false })

  // ── 10. Live stores untouched ──────────────────────────────────────────
  section('Live stores untouched')
  const { data: live } = await db.from('perks')
    .select('title, description, is_active, menu_perk_id, hidden_at, stores!inner(display_name)')
    .in('stores.display_name', ['Bin Chasers Lake Wales', 'Bin Chasers Lakeland'])
  ck('Thomas and Mark still have all 14 perk rows', (live ?? []).length === 14, String((live ?? []).length))
  ck('every one is still pre-menu, unhidden and unchanged',
    (live ?? []).every(p => p.menu_perk_id === null && p.hidden_at === null),
    `${(live ?? []).filter(p => p.menu_perk_id === null).length} pre-menu`)
  ck('their active perks are still active',
    (live ?? []).filter(p => p.is_active).length === 10,
    String((live ?? []).filter(p => p.is_active).length))

  // ── 11. Carry-over ─────────────────────────────────────────────────────
  section('Carry-over')
  const before = await db.from('perks').select('title, updated_at').eq('store_id', store.id).eq('member_type', 'vip').eq('slot', 1).single()
  const reread = JSON.parse(get(`/api/merchant/perks?storeId=${store.id}`, merchantCookie))
  ck('perks persist between loads with no expiry',
    (reread.vipPerks ?? []).find(p => p.slot === 1)?.title === before.data.title,
    before.data.title)
  const { count: crons } = { count: 0 }
  ck('nothing expires perks on a schedule (no cron touches the table)',
    !readFileSync('vercel.json', 'utf8').includes('perk'), 'vercel.json has no perk cron')

  // ── Cleanup ────────────────────────────────────────────────────────────
  section('Cleanup')
  try { unlinkSync(BODY) } catch {}
  await sweep()
  const { count: mc } = await db.from('merchants').select('*', { count: 'exact', head: true })
  const { count: menuCount } = await db.from('perk_menu').select('*', { count: 'exact', head: true })
  const { count: subCount } = await db.from('perk_submissions').select('*', { count: 'exact', head: true })
  const { count: perkCount } = await db.from('perks').select('*', { count: 'exact', head: true })
  console.log(`  merchants: ${mc}, perk_menu: ${menuCount}, submissions: ${subCount}, perks: ${perkCount}`)
  ck('menu back to the 20 seeded options', menuCount === 20, String(menuCount))
  ck('no test submissions left', subCount === 0, String(subCount))
  ck('live perk rows untouched', perkCount === 21, String(perkCount))

  console.log(`\n${'═'.repeat(60)}\n  ${pass} passed, ${fail} failed\n${'═'.repeat(60)}`)
  process.exit(fail ? 1 : 0)
}

main().catch(async e => { console.error(e); try { await sweep() } catch {} process.exit(1) })
