/**
 * The accepted agreement as a PDF, plus its Acceptance Certificate page.
 *
 * SERVER ONLY — pdf-lib.
 *
 * This is the copy the merchant keeps and the copy BinPerks can produce later,
 * so it renders the SAME blocks the acceptance page displayed, with the same
 * substitutions, and ends with a page recording exactly who accepted it, when,
 * from where, and the hash of the text they saw. The hash is what ties the
 * certificate to the document above it: if the two ever disagree, the mismatch
 * is detectable rather than invisible.
 *
 * Helvetica, because a standard font needs no embedding and cannot fail to
 * load on a serverless instance. Characters outside WinAnsi are folded to
 * their nearest ASCII rather than throwing — a PDF that renders with a plain
 * hyphen is worth more than no PDF at all, and the authoritative text is the
 * hashed string, not this rendering.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { AgreementBlock, AcceptanceDetails } from './agreements/types'
import { acceptanceBlockLines, acceptanceStatement } from './agreements'

const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 54
const BODY   = 9
const LEAD   = 12.5
const INK    = rgb(0.10, 0.10, 0.18)
const MUTED  = rgb(0.45, 0.45, 0.55)
const RULE   = rgb(0.85, 0.85, 0.90)

/** Fold the few non-WinAnsi characters the document uses. */
function winAnsi(s: string): string {
  return s
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–]/g, '-')
    .replace(/[—]/g, '--')
    .replace(/[…]/g, '...')
    .replace(/[ ]/g, ' ')
    // Anything still outside Latin-1 would throw on draw; drop it rather than
    // lose the whole document.
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, '')
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = []
  for (const paragraph of winAnsi(text).split('\n')) {
    if (!paragraph.trim()) { lines.push(''); continue }
    let line = ''
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue }
      if (line) lines.push(line)
      // A single word longer than the column: break it rather than overflow.
      if (font.widthOfTextAtSize(word, size) > width) {
        let chunk = ''
        for (const ch of word) {
          if (font.widthOfTextAtSize(chunk + ch, size) > width) { lines.push(chunk); chunk = ch }
          else chunk += ch
        }
        line = chunk
      } else line = word
    }
    lines.push(line)
  }
  return lines
}

/** A page writer that adds pages as it runs out of room. */
class Sheet {
  private page: PDFPage
  private y: number
  readonly width = PAGE_W - MARGIN * 2

  constructor(private doc: PDFDocument, private font: PDFFont, private bold: PDFFont) {
    this.page = doc.addPage([PAGE_W, PAGE_H])
    this.y = PAGE_H - MARGIN
  }

  private room(h: number) {
    if (this.y - h >= MARGIN) return
    this.page = this.doc.addPage([PAGE_W, PAGE_H])
    this.y = PAGE_H - MARGIN
  }

  gap(h: number) { this.room(h); this.y -= h }

  text(s: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number } = {}) {
    const size = opts.size ?? BODY
    const font = opts.bold ? this.bold : this.font
    const indent = opts.indent ?? 0
    for (const line of wrap(s, font, size, this.width - indent)) {
      this.room(LEAD)
      if (line) {
        this.page.drawText(line, {
          x: MARGIN + indent, y: this.y - size, size, font, color: opts.color ?? INK,
        })
      }
      this.y -= LEAD
    }
  }

  rule() {
    this.room(8)
    this.page.drawLine({
      start: { x: MARGIN, y: this.y - 4 }, end: { x: PAGE_W - MARGIN, y: this.y - 4 },
      thickness: 0.5, color: RULE,
    })
    this.y -= 8
  }

  /** Two-column table, wrapped, with a rule under each row. */
  table(rows: string[][]) {
    const labelW = this.width * 0.36
    const valueW = this.width - labelW - 10
    for (const row of rows) {
      const isHeader = row.length === 1
      const label = winAnsi(row[0] ?? '')
      const value = winAnsi(row[1] ?? '')
      const lw = wrap(label, isHeader ? this.bold : this.bold, BODY, isHeader ? this.width : labelW)
      const vw = value ? wrap(value, this.font, BODY, valueW) : []
      const h = Math.max(lw.length, vw.length) * LEAD + 4
      this.room(h)
      const top = this.y
      lw.forEach((l, i) => this.page.drawText(l, {
        x: MARGIN, y: top - BODY - i * LEAD, size: BODY, font: this.bold, color: INK,
      }))
      vw.forEach((l, i) => this.page.drawText(l, {
        x: MARGIN + labelW + 10, y: top - BODY - i * LEAD, size: BODY, font: this.font, color: INK,
      }))
      this.y = top - h
      this.page.drawLine({
        start: { x: MARGIN, y: this.y + 2 }, end: { x: PAGE_W - MARGIN, y: this.y + 2 },
        thickness: 0.4, color: RULE,
      })
    }
    this.y -= 4
  }
}

export interface AgreementPdfInput {
  blocks: AgreementBlock[]
  acceptance: AcceptanceDetails
}

export async function buildAgreementPdf({ blocks, acceptance }: AgreementPdfInput): Promise<Buffer> {
  const doc  = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const sheet = new Sheet(doc, font, bold)

  for (const b of blocks) {
    if (b.k === 'h') {
      sheet.gap(8)
      sheet.text(b.t, { size: 11, bold: true })
      sheet.rule()
    } else if (b.k === 'tbl') {
      sheet.gap(4)
      sheet.table(b.rows)
    } else if (b.k === 'accept') {
      sheet.gap(6)
      for (const line of acceptanceBlockLines(acceptance)) {
        if (line) sheet.text(line, { bold: line.startsWith('BinPerks LLC') || line.includes('accepted electronically') })
        else sheet.gap(LEAD / 2)
      }
      sheet.gap(6)
    } else {
      if (!b.t.trim()) { sheet.gap(LEAD / 2); continue }
      sheet.text(b.t)
    }
  }

  // ── Acceptance Certificate ───────────────────────────────────────────────
  // Its own page, always last, so the record is never buried mid-document.
  const cert = doc.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H - MARGIN
  const line = (s: string, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const size = o.size ?? BODY
    for (const l of wrap(s, o.bold ? bold : font, size, PAGE_W - MARGIN * 2)) {
      cert.drawText(l, { x: MARGIN, y: y - size, size, font: o.bold ? bold : font, color: o.color ?? INK })
      y -= size + 4
    }
    y -= o.gap ?? 0
  }

  line('ACCEPTANCE CERTIFICATE', { size: 14, bold: true, gap: 4 })
  cert.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: RULE })
  y -= 14
  line('This page records the electronic acceptance of the agreement above.',
    { color: MUTED, gap: 10 })

  const rows: [string, string][] = [
    ['Agreement',        `BinPerks Merchant Participation and Platform Agreement ${acceptance.agreementVersion}`],
    ['Merchant',         acceptance.merchantLegalName],
    ['Accepted by',      `${acceptance.signerName}, ${acceptance.signerTitle}`],
    ['Signer email',     acceptance.signerEmail ?? '—'],
    ['Accepted at',      new Date(acceptance.acceptedAt).toISOString()],
    ['IP address',       acceptance.ipAddress ?? '—'],
    ['Browser',          acceptance.userAgent ?? '—'],
    ['Document SHA-256', acceptance.documentSha256 ?? '—'],
  ]
  for (const [k, v] of rows) {
    line(k.toUpperCase(), { size: 7.5, bold: true, color: MUTED })
    line(v, { gap: 7 })
  }

  y -= 6
  cert.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: RULE })
  y -= 14
  line('Statement accepted', { size: 7.5, bold: true, color: MUTED })
  line(`"${acceptanceStatement(acceptance.merchantLegalName, acceptance.agreementVersion)}"`, { gap: 10 })
  line('The SHA-256 above is of the exact agreement text displayed at acceptance. '
     + 'BinPerks LLC accepted this agreement on the platform.', { color: MUTED })

  return Buffer.from(await doc.save())
}
