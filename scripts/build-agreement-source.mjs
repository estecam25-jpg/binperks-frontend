/**
 * Turn legal/BinPerks_Merchant_Agreement_V3.6.docx into lib/agreements/v3-6.ts.
 *
 *   node scripts/build-agreement-source.mjs
 *
 * WHY A GENERATOR AND NOT A HAND-TYPED FILE. This is the document a merchant
 * is legally bound by. Retyping fourteen pages invites a dropped clause or a
 * changed word that nobody notices until it matters, so the wording is lifted
 * from the .docx verbatim and the only edits are the ones listed below, each
 * applied by an exact string match that fails loudly if the source moves.
 *
 * WHAT IT CHANGES, AND NOTHING ELSE:
 *   - the blank after 'and' in the header becomes the merchant's legal name
 *   - both "Effective Date" values become the acceptance date
 *   - the Order Form's bracket placeholders become tokens
 *   - the two handwritten signature blocks become one acceptance block; the
 *     paragraphs around them, which already contemplate electronic
 *     acceptance, are kept word for word
 *   - the BinPerks cursive signature is not carried over
 *
 * Re-run it when the .docx changes, and bump the version id: an accepted
 * agreement is pinned by its hash, so editing a version in place would make
 * every stored hash disagree with the text it names.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname } from 'node:path'

const DOCX = 'legal/BinPerks_Merchant_Agreement_V3.6.docx'
const OUT  = 'lib/agreements/v3-6.ts'
const VERSION = 'V3.6'

// ── Pull the document out of the .docx with python (zip + regex) ───────────
const PY = String.raw`
import zipfile, re, json, sys
z = zipfile.ZipFile(sys.argv[1])
xml = z.read('word/document.xml').decode('utf-8')
body = re.search(r'<w:body>(.*)</w:body>', xml, re.S).group(1)

def ptext(p):
    t = ''
    for r in re.findall(r'<w:r[ >].*?</w:r>', p, re.S):
        s = ''.join(re.findall(r'<w:t[^>]*>(.*?)</w:t>', r, re.S))
        t += (s.replace('&amp;','&').replace('&lt;','<').replace('&gt;','>')
               .replace('&quot;','"').replace('&apos;',"'"))
    return t

blocks = []
for m in re.finditer(r'<w:tbl>.*?</w:tbl>|<w:p[ >].*?</w:p>|<w:p/>', body, re.S):
    chunk = m.group(0)
    if chunk.startswith('<w:tbl'):
        rows = []
        for tr in re.findall(r'<w:tr[ >].*?</w:tr>', chunk, re.S):
            cells = []
            for tc in re.findall(r'<w:tc[ >].*?</w:tc>', tr, re.S):
                cells.append(' '.join(ptext(p) for p in re.findall(r'<w:p[ >].*?</w:p>', tc, re.S)).strip())
            rows.append(cells)
        blocks.append({'k': 'tbl', 'rows': rows})
    else:
        style = (re.findall(r'<w:pStyle w:val="([^"]+)"', chunk) or [''])[0]
        blocks.append({'k': 'h' if style == 'Heading1' else 'p', 't': ptext(chunk)})
# ensure_ascii (the default) escapes every curly quote and dash, so the
# handoff to Node is pure ASCII and cannot be mangled by the console
# codepage — which is exactly how the apostrophes were being lost.
print(json.dumps(blocks))
`

// PYTHONIOENCODING is load-bearing on Windows: python's stdout defaults to
// the ANSI codepage there, which turns every curly quote and en dash in the
// agreement into a replacement character before Node ever sees it.
const raw = execFileSync('python', ['-I', '-c', PY, DOCX], {
  encoding: 'utf8',
  maxBuffer: 20e6,
  env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
})
let blocks = JSON.parse(raw)

// ── The edits, each asserted ───────────────────────────────────────────────
let edits = 0
const fail = m => { console.error(`REFUSING: ${m}`); process.exit(1) }

/** Replace exact text in a paragraph, once, or stop. */
function setPara(index, expect, next) {
  const b = blocks[index]
  if (!b || b.k === 'tbl' || b.t !== expect) {
    fail(`block ${index} is not ${JSON.stringify(expect)} — the .docx moved; re-check before regenerating`)
  }
  b.t = next
  edits++
}

/** Replace a cell value anywhere in any table, once, or stop. */
function setCell(expect, next) {
  let hits = 0
  for (const b of blocks) {
    if (b.k !== 'tbl') continue
    for (const row of b.rows) {
      for (let i = 0; i < row.length; i++) {
        if (row[i] === expect) { row[i] = next; hits++ }
      }
    }
  }
  if (hits !== 1) fail(`expected exactly one cell ${JSON.stringify(expect)}, found ${hits}`)
  edits++
}

// Header: the merchant's name and the effective date.
setPara(4, 'and ("Merchant") ', 'and {{MERCHANT_LEGAL_NAME}} ("Merchant")')
setPara(5, 'Effective Date: October 12, 2026', 'Effective Date: {{EFFECTIVE_DATE}}')

// Order Form fields.
setCell('[MERCHANT LEGAL NAME]',                        '{{MERCHANT_LEGAL_NAME}}')
setCell('[STORE NAME]',                                 '{{STORE_NAME}}')
setCell('[STORE WEBSITE OR "NONE"]',                    '{{STORE_WEBSITE}}')
setCell('[STREET, CITY, STATE ZIP]',                    '{{NOTICE_ADDRESS}}')
setCell('[EMAIL]',                                      '{{NOTICE_EMAIL}}')
setCell('[NAME / TITLE / PHONE / EMAIL]',               '{{PRIMARY_CONTACT}}')
setCell('October 12, 2026',                             '{{EFFECTIVE_DATE}}')
setCell('[LIST EACH LOCATION NAME AND FULL ADDRESS]',   '{{PARTICIPATING_LOCATIONS}}')
setCell('[URL OR "TO BE ENTERED IN MERCHANT SETTINGS"]','{{REVIEW_DESTINATION}}')
setCell('[NONE] or [DESCRIPTION, CONDITIONS, START DATE, END DATE]', '{{PROMO_WAIVER}}')

// ── The two signature blocks become one acceptance block each ──────────────
//
// Only the handwritten lines go. The paragraphs introducing them already say
// "or accepting this Agreement electronically", so they are kept verbatim and
// now describe exactly what happened.
// Matched on normalised whitespace: the signature line is padded with a long
// run of spaces to push the two columns apart, and depending on how this file
// is edited that run is easy to change by one character. Collapsing runs keeps
// the match exact in substance without being hostage to the padding.
const norm = t => String(t).replace(/\s+/g, ' ').trim()
const SIG_LINE  = norm('BinPerks LLC Signature: Merchant’s Business LLC Signature:')
const SIG_NAME  = 'Esteban Nina___________'
const SIG_TITLE = 'Founder_______________October 12, 2026___________'

function replaceSignatureBlock(lineIndex) {
  const [a, b, c] = [lineIndex, lineIndex + 2, lineIndex + 3]
  if (norm(blocks[a]?.t) !== SIG_LINE) fail(`block ${a} is not the signature line`)
  if (blocks[b]?.t !== SIG_NAME)       fail(`block ${b} is not the BinPerks signer name`)
  if (blocks[c]?.t !== SIG_TITLE)      fail(`block ${c} is not the BinPerks signer title/date`)
  blocks[a] = { k: 'accept' }
  blocks[b] = { k: 'p', t: '' }
  blocks[c] = { k: 'p', t: '' }
  edits++
}

const sigIndexes = blocks
  .map((b, i) => (b.k !== 'tbl' && norm(b.t) === SIG_LINE ? i : -1))
  .filter(i => i >= 0)
if (sigIndexes.length !== 2) fail(`expected 2 signature blocks, found ${sigIndexes.length}`)
for (const i of sigIndexes.slice().reverse()) replaceSignatureBlock(i)

// Drop trailing blanks and collapse runs of them.
const cleaned = []
for (const b of blocks) {
  const blank = b.k === 'p' && !b.t.trim()
  if (blank && (cleaned.length === 0 || cleaned[cleaned.length - 1].k === 'h' ||
      (cleaned[cleaned.length - 1].k === 'p' && !cleaned[cleaned.length - 1].t.trim()))) continue
  cleaned.push(b)
}
while (cleaned.length && cleaned[cleaned.length - 1].k === 'p' && !cleaned[cleaned.length - 1].t.trim()) cleaned.pop()
blocks = cleaned

// ── Emit ───────────────────────────────────────────────────────────────────
const header = `/**
 * Merchant Participation and Platform Agreement ${VERSION} — the in-app source.
 *
 * GENERATED. Do not edit by hand: run
 *   node scripts/build-agreement-source.mjs
 * which lifts the wording from legal/BinPerks_Merchant_Agreement_V3.6.docx
 * verbatim and applies only the documented substitutions.
 *
 * The {{TOKENS}} are filled per merchant at render time (lib/agreements), and
 * { k: 'accept' } is where the acceptance block is drawn — replacing the two
 * handwritten signature blocks and the BinPerks cursive signature.
 *
 * ACCEPTED TEXT IS PINNED BY HASH. Every acceptance stores the SHA-256 of the
 * exact rendered text, so changing this file does not quietly rewrite what a
 * merchant already agreed to — it makes the difference detectable. A reworded
 * agreement is a NEW VERSION with a new id, never an edit to this one.
 */

import type { AgreementBlock } from './types'

export const V3_6_VERSION = '${VERSION}'

export const V3_6_BLOCKS: AgreementBlock[] = `

writeFileSync(OUT.replace(/[^/]+$/, '') + '.keep', '', { flag: 'w' })
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, header + JSON.stringify(blocks, null, 2) + '\n')

const paras = blocks.filter(b => b.k === 'p').length
const heads = blocks.filter(b => b.k === 'h').length
const tbls  = blocks.filter(b => b.k === 'tbl').length
const accepts = blocks.filter(b => b.k === 'accept').length
console.log(`wrote ${OUT}`)
console.log(`  ${blocks.length} blocks — ${heads} headings, ${paras} paragraphs, ${tbls} tables, ${accepts} acceptance blocks`)
console.log(`  ${edits} documented substitutions applied`)
