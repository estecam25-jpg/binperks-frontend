/**
 * Builds a merchant's marketing materials from the admin base artwork.
 *
 * SERVER ONLY — imports sharp, pdf-lib and the service-role client.
 *
 * The job on every material is the same: take one unit of artwork, cover its
 * [STORE NAME] and [QR CODE] placeholders, put the merchant's own name and a
 * real QR in their place, then lay the finished units onto a sheet.
 *
 * WHERE THE TEXT IS DRAWN depends on the output, and that is deliberate:
 *
 *   PDF — pdf-lib draws it, with a StandardFont. Those fonts are embedded by
 *         pdf-lib itself, so the text cannot depend on whatever fonts the
 *         serverless image happens to ship. Four of the six materials are PDFs.
 *   JPG — sharp draws it through an SVG, because a JPEG has to arrive with
 *         the name already baked in. That SVG carries the glyphs as PATHS,
 *         traced from a bundled font, so it depends on no system font either.
 *         See rasteriseName.
 *
 * The QR never depends on fonts either way: it is an image, composited by
 * sharp onto the artwork before anything else happens.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
// A namespace import: opentype.js's ESM build has named exports and no
// default, so `import opentype from` resolves to undefined at runtime.
//
// PINNED TO 1.x. On 2.0.0 getPath emitted NaN coordinates part-way through a
// string for this font — the first letter drew and the rest of the name came
// out as a smear. 1.3.4 traces the same text cleanly.
import * as opentype from 'opentype.js'
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import {
  type MaterialSpec, type QrTarget, PT_PER_INCH,
} from '@/lib/marketing-materials'

/**
 * The 4x6 photo prints are written at this density.
 *
 * 300, not 200: the artwork for those two is authored at 300dpi (1200x1800),
 * so anything lower would resample a print file down for no reason. Photo labs
 * want 300.
 */
const DPI = 300

/** How much of the placeholder box the replacement covers, as a fraction of the
 *  box, leaving the design's own border visible. */
const INSET = 0.06

/**
 * Montserrat Bold, bundled in the repo.
 *
 * WHY BUNDLED AND NOT A SYSTEM FONT: the JPEG materials have to arrive with
 * the store name already drawn, and sharp renders SVG text through librsvg,
 * which asks fontconfig for the family. A serverless image need not ship any
 * font at all — which is exactly how the name came out blank on Vercel while
 * looking fine locally.
 *
 * The font is never handed to librsvg. opentype.js traces the glyphs and the
 * SVG carries a <path>, so nothing in the render path consults fontconfig.
 *
 * Montserrat because it is already the BinPerks body face (see app/layout).
 * public/fonts is also web-servable, but this reads it off disk; next.config
 * traces it into the function so the file is actually there.
 */
const FONT_PATH = path.join(process.cwd(), 'public', 'fonts', 'Montserrat-Bold.ttf')

let cachedFont: opentype.Font | null = null

function nameFont(): opentype.Font {
  if (!cachedFont) cachedFont = opentype.parse(toArrayBuffer(readFileSync(FONT_PATH)))
  return cachedFont
}

/** Node Buffers are views into a pooled ArrayBuffer; opentype.js needs the
 *  bytes on their own or it reads whatever else is sharing the pool. */
function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

export interface Rect { x: number; y: number; w: number; h: number }

export interface TemplateRow {
  slug: string
  label: string
  bucket: string
  storage_path: string | null
  name_rect: Rect
  qr_rect: Rect
}

/** The join URL a material's QR points at. */
export function joinUrlFor(target: QrTarget, storeKey: string): string {
  const base = `https://app.binperks.com/join/${storeKey}`
  // The in-store source is what makes the signup award that day's visit stamp.
  return target === 'register' ? `${base}/in-store_at-the_register` : base
}

/** A QR PNG at the requested pixel size. Same service the rest of the app uses. */
export async function fetchQr(url: string, px: number): Promise<Buffer> {
  const size = Math.max(200, Math.min(1000, Math.round(px)))
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}`
    + `&data=${encodeURIComponent(url)}&format=png&margin=2`
  const res = await fetch(src)
  if (!res.ok) throw new Error(`qr fetch ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

export async function loadTemplates(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  slugs: string[],
): Promise<TemplateRow[]> {
  const { data } = await admin
    .from('marketing_templates')
    .select('slug, label, bucket, storage_path, name_rect, qr_rect')
    .in('slug', slugs)
  const rows = (data ?? []) as TemplateRow[]
  // Registry order, not whatever Postgres returned — the posters are a
  // five-page PDF and the pages have an intended sequence.
  return slugs.map(s => rows.find(r => r.slug === s)).filter(Boolean) as TemplateRow[]
}

export async function downloadTemplate(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  row: TemplateRow,
): Promise<Buffer> {
  if (!row.storage_path) throw new Error(`template ${row.slug} has no artwork`)
  const { data, error } = await admin.storage.from(row.bucket).download(row.storage_path)
  if (error || !data) throw new Error(`template ${row.slug} download failed`)
  return Buffer.from(await data.arrayBuffer())
}

/**
 * The colour to paint over a placeholder box, sampled from the artwork.
 *
 * Sampled rather than configured because admin can replace any template and a
 * new design's box may be any colour. The MIDDLE THIRD IS SKIPPED: that is
 * where the placeholder text sits, and averaging it in would drag the result
 * toward the text colour. What comes back is the modal colour of the box's
 * left and right thirds, quantised so anti-aliasing does not split one colour
 * into fifty near-identical ones.
 */
async function sampleBoxColour(
  art: Buffer, artW: number, artH: number, rect: Rect,
): Promise<{ r: number; g: number; b: number }> {
  const left = Math.max(0, Math.round(rect.x * artW))
  const top = Math.max(0, Math.round(rect.y * artH))
  const width = Math.max(1, Math.min(artW - left, Math.round(rect.w * artW)))
  const height = Math.max(1, Math.min(artH - top, Math.round(rect.h * artH)))

  const { data, info } = await sharp(art)
    .extract({ left, top, width, height })
    .raw().toBuffer({ resolveWithObject: true })

  const ch = info.channels
  const counts = new Map<string, number>()

  // SAMPLED ABOVE AND BELOW THE TEXT, across the full width.
  //
  // The first attempt skipped the middle third horizontally, on the assumption
  // that the placeholder text sits in the centre. It does not: "[STORE NAME]"
  // runs nearly the full width of poster 5's ribbon, so both outer thirds
  // landed on white letters and the ribbon was painted white.
  //
  // The text does, however, always leave a gap above its cap height and below
  // its baseline. These two bands sit inside the design's own border and clear
  // of the lettering, which holds whether the text is narrow or full width.
  const h = info.height
  const inBand = (y: number) =>
    (y > h * 0.10 && y < h * 0.26) || (y > h * 0.74 && y < h * 0.90)

  for (let y = 0; y < info.height; y += 1) {
    if (!inBand(y)) continue
    for (let x = 0; x < info.width; x += 2) {
      const i = (y * info.width + x) * ch
      // Quantised to 16 levels per channel.
      const key = `${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }

  let best = '15,15,15', bestN = -1
  for (const [k, n] of counts) if (n > bestN) { best = k; bestN = n }
  const [r, g, b] = best.split(',').map(v => (Number(v) << 4) + 8)
  return { r, g, b }
}

/** White text on a dark box, near-black on a light one. */
function contrastInk(c: { r: number; g: number; b: number }): { r: number; g: number; b: number } {
  const lum = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255
  return lum > 0.6 ? { r: 26, g: 26, b: 46 } : { r: 255, g: 255, b: 255 }
}

function insetRect(rect: Rect): Rect {
  const dx = rect.w * INSET, dy = rect.h * INSET
  return { x: rect.x + dx, y: rect.y + dy, w: rect.w - 2 * dx, h: rect.h - 2 * dy }
}

/**
 * One finished unit of artwork: QR placed, name box cleared.
 *
 * `rasteriseName` bakes the store name in as well, for the JPEG outputs. The
 * PDF path leaves it off and lets pdf-lib draw it — see the module header.
 *
 * Returns the PNG plus the name box in pixels, so the PDF caller knows where
 * to put the text it is about to draw.
 */
export async function renderUnit(opts: {
  art: Buffer
  nameRect: Rect
  qrRect: Rect
  storeName: string
  qr: Buffer
  rasteriseName: boolean
  monochrome?: boolean
}): Promise<{
  /** A JPEG, despite the name — see the return statement. */
  png: Buffer
  width: number
  height: number
  nameBox: Rect
  ink: { r: number; g: number; b: number }
}> {
  const meta = await sharp(opts.art).metadata()
  const W = meta.width ?? 1000
  const H = meta.height ?? 1000

  const px = (r: Rect) => ({
    left: Math.max(0, Math.round(r.x * W)),
    top: Math.max(0, Math.round(r.y * H)),
    width: Math.max(1, Math.round(r.w * W)),
    height: Math.max(1, Math.round(r.h * H)),
  })

  const nameBg = await sampleBoxColour(opts.art, W, H, opts.nameRect)
  const ink = contrastInk(nameBg)

  const nameIn = px(insetRect(opts.nameRect))
  const qrIn = px(insetRect(opts.qrRect))

  const layers: sharp.OverlayOptions[] = []

  // 1. Blank the name placeholder in the box's own colour.
  layers.push({
    input: {
      create: {
        width: nameIn.width, height: nameIn.height, channels: 4,
        background: { ...nameBg, alpha: 1 },
      },
    },
    left: nameIn.left, top: nameIn.top,
  })

  // 2. White behind the QR, always. A code has to sit on white to scan, and
  //    that matters more than matching a template whose box is not.
  const qrSide = Math.min(qrIn.width, qrIn.height)
  layers.push({
    input: {
      create: {
        width: qrIn.width, height: qrIn.height, channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    },
    left: qrIn.left, top: qrIn.top,
  })

  // 3. The QR itself, square and centred in its box.
  //
  // INSET AGAIN, to 88%. Drawn edge to edge it had no quiet zone on its short
  // axis, and the table tent and window cling — whose boxes are drawn with a
  // black and a blue stroke right up against it — would not decode at all. A
  // QR needs clear white around it, not just behind it.
  const qrDrawn = Math.floor(qrSide * 0.88)
  const qrPng = await sharp(opts.qr).resize(qrDrawn, qrDrawn, { fit: 'fill' }).png().toBuffer()
  layers.push({
    input: qrPng,
    left: qrIn.left + Math.round((qrIn.width - qrDrawn) / 2),
    top: qrIn.top + Math.round((qrIn.height - qrDrawn) / 2),
  })

  // 4. The name, only for outputs that cannot draw text later.
  if (opts.rasteriseName) {
    layers.push({
      input: await rasteriseName(opts.storeName, nameIn.width, nameIn.height, ink),
      left: nameIn.left, top: nameIn.top,
    })
  }

  let pipeline = sharp(opts.art).composite(layers)
  if (opts.monochrome) pipeline = pipeline.greyscale()

  // JPEG, not PNG. Embedding five full-bleed PNG posters produced an 11MB PDF
  // that no merchant is going to email to a print shop; the same pages as
  // quality-88 JPEG come in around a tenth of that, and the artwork is
  // photographic, so there is nothing PNG was buying. Flattened first because
  // JPEG has no alpha channel.
  return {
    png: await pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: 88 }).toBuffer(),
    width: W,
    height: H,
    nameBox: {
      x: nameIn.left / W, y: nameIn.top / H,
      w: nameIn.width / W, h: nameIn.height / H,
    },
    ink,
  }
}

/**
 * The store name as a transparent PNG, for the JPEG outputs.
 *
 * DEPENDS ON A SYSTEM FONT. sharp renders SVG through librsvg, which asks
 * fontconfig for the family — so this is the one place in the pipeline that
 * can come out blank on a host with no fonts installed. The generic families
 * are listed last so any one of them will do. The PDF materials deliberately
 * do not go through here.
 *
 * The size is solved rather than guessed: shrink until the estimated width
 * fits the box, using the ~0.58em average advance of a bold sans face.
 */
async function rasteriseName(
  name: string, boxW: number, boxH: number, ink: { r: number; g: number; b: number },
): Promise<Buffer> {
  const text = name.trim() || 'Your Store'
  const font = nameFont()

  // Measured, not estimated. advanceWidth comes from the font itself, so the
  // size that fits is solved rather than guessed at 0.58em a character.
  let size = Math.floor(boxH * 0.62)
  while (size > 8 && font.getAdvanceWidth(text, size) > boxW * 0.92) size -= 1

  const width = font.getAdvanceWidth(text, size)

  // Centred on the cap height rather than the em box: a font's ascent and
  // descent leave the visual centre above the baseline midpoint, and centring
  // on the em box makes short text sit low in its box.
  const scale = size / font.unitsPerEm
  const capTop = (font.tables.os2?.sCapHeight ?? font.ascender * 0.72) * scale
  const baseline = boxH / 2 + capTop / 2

  const d = font.getPath(text, (boxW - width) / 2, baseline, size).toPathData(2)

  // A PATH, not <text>: no font-family for librsvg to look up, so this renders
  // identically on a host with no fonts installed.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(boxW)}" height="${Math.round(boxH)}">
    <path d="${d}" fill="rgb(${ink.r},${ink.g},${ink.b})"/>
  </svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}


/**
 * Lay finished units onto sheets and return a PDF.
 *
 * `sheet` absent means one design per page at the page's full size, which is
 * how the five posters are combined. With a sheet, the units are tiled and the
 * grid is centred on the page.
 *
 * The store name is drawn HERE for every PDF, in Helvetica-Bold, which pdf-lib
 * embeds — so the text never depends on the host's fonts.
 */
export async function buildPdf(opts: {
  units: { png: Buffer; nameBox: Rect; ink: { r: number; g: number; b: number } }[]
  spec: MaterialSpec
  storeName: string
}): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.HelveticaBold)
  const { spec } = opts

  /** Draw one unit at a rectangle given in points, name and all. */
  const place = async (
    page: import('pdf-lib').PDFPage,
    unit: { png: Buffer; nameBox: Rect; ink: { r: number; g: number; b: number } },
    x: number, y: number, w: number, h: number,
  ) => {
    const img = await pdf.embedJpg(unit.png)
    page.drawImage(img, { x, y, width: w, height: h })

    const nb = unit.nameBox
    const boxW = nb.w * w
    const boxH = nb.h * h
    // PDF's origin is bottom-left; the rect is measured from the top.
    const boxX = x + nb.x * w
    const boxY = y + h - (nb.y * h) - boxH

    const text = opts.storeName.trim() || 'Your Store'
    let size = boxH * 0.62
    while (size > 4 && font.widthOfTextAtSize(text, size) > boxW * 0.94) size -= 0.5

    page.drawText(text, {
      x: boxX + (boxW - font.widthOfTextAtSize(text, size)) / 2,
      y: boxY + (boxH - font.heightAtSize(size) * 0.72) / 2,
      size,
      font,
      color: rgb(unit.ink.r / 255, unit.ink.g / 255, unit.ink.b / 255),
    })
  }

  if (!spec.sheet) {
    // One design per page — the poster set.
    for (const unit of opts.units) {
      const meta = await sharp(unit.png).metadata()
      const ar = (meta.width ?? 850) / (meta.height ?? 1100)
      // Fitted to 8.5x11 portrait; a template at a different ratio is letterboxed
      // rather than stretched.
      const pageW = 8.5 * PT_PER_INCH, pageH = 11 * PT_PER_INCH
      const page = pdf.addPage([pageW, pageH])
      const w = Math.min(pageW, pageH * ar)
      const h = w / ar
      await place(page, unit, (pageW - w) / 2, (pageH - h) / 2, w, h)
    }
  } else {
    const s = spec.sheet
    const pageW = s.pageW * PT_PER_INCH, pageH = s.pageH * PT_PER_INCH
    const unitW = s.unitW * PT_PER_INCH, unitH = s.unitH * PT_PER_INCH
    const gridW = unitW * s.cols, gridH = unitH * s.rows
    const offX = (pageW - gridW) / 2, offY = (pageH - gridH) / 2

    const page = pdf.addPage([pageW, pageH])
    const unit = opts.units[0]
    for (let r = 0; r < s.rows; r++) {
      for (let c = 0; c < s.cols; c++) {
        await place(
          page, unit,
          offX + c * unitW,
          // Rows fill from the top of the page downwards.
          offY + gridH - (r + 1) * unitH,
          unitW, unitH,
        )
      }
    }

    // A fold line down the middle of the tent sheet, so the two panels can be
    // folded into a standing card without measuring.
    if (spec.slug === 'table-tent') {
      page.drawLine({
        start: { x: pageW / 2, y: offY },
        end: { x: pageW / 2, y: offY + gridH },
        thickness: 0.5,
        color: rgb(0.7, 0.7, 0.7),
        dashArray: [4, 4],
      })
    }
  }

  // Silences an unused import when no rotation is needed; kept because a
  // landscape sheet may want it later.
  void degrees

  return Buffer.from(await pdf.save())
}

/** A single 4x6 print, at DPI, with the name already baked in. */
export async function buildJpg(unitPng: Buffer, spec: MaterialSpec): Promise<Buffer> {
  const w = Math.round((spec.imageSize?.w ?? 4) * DPI)
  const h = Math.round((spec.imageSize?.h ?? 6) * DPI)
  return sharp(unitPng)
    .resize(w, h, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 92 })
    .toBuffer()
}

/**
 * Build one material for one store.
 *
 * Throws when a template has no artwork yet, which the route turns into a 409 —
 * the Marketing tab reads that as "coming soon" and disables the button rather
 * than handing a merchant a blank sheet.
 */
export async function renderMaterial(opts: {
  admin: ReturnType<typeof createAdminSupabaseClient>
  spec: MaterialSpec
  storeKey: string
  storeName: string
}): Promise<{ body: Buffer; contentType: string; filename: string }> {
  const { admin, spec, storeKey, storeName } = opts

  const templates = await loadTemplates(admin, spec.templates)
  const missing = templates.filter(t => !t.storage_path).map(t => t.slug)
  if (templates.length !== spec.templates.length || missing.length > 0) {
    throw new MaterialUnavailableError(
      missing.length ? missing : spec.templates.filter(s => !templates.some(t => t.slug === s)),
    )
  }

  const url = joinUrlFor(spec.qrTarget, storeKey)

  const units = []
  for (const t of templates) {
    const art = await downloadTemplate(admin, t)
    const meta = await sharp(art).metadata()
    // The QR is fetched at the size it will actually occupy, so it is never
    // upscaled from a smaller bitmap.
    const qrPx = Math.round((meta.width ?? 1000) * t.qr_rect.w)
    const qr = await fetchQr(url, qrPx)
    units.push(await renderUnit({
      art,
      nameRect: t.name_rect,
      qrRect: t.qr_rect,
      storeName,
      qr,
      rasteriseName: spec.output === 'jpg',
      monochrome: spec.monochrome,
    }))
  }

  const safe = (storeName || 'store').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()

  if (spec.output === 'jpg') {
    return {
      body: await buildJpg(units[0].png, spec),
      contentType: 'image/jpeg',
      filename: `${spec.fileStem}-${safe}.jpg`,
    }
  }

  return {
    body: await buildPdf({ units, spec, storeName }),
    contentType: 'application/pdf',
    filename: `${spec.fileStem}-${safe}.pdf`,
  }
}

/** Raised when admin has not uploaded the base artwork a material needs. */
export class MaterialUnavailableError extends Error {
  constructor(public readonly missing: string[]) {
    super(`missing artwork: ${missing.join(', ')}`)
    this.name = 'MaterialUnavailableError'
  }
}
