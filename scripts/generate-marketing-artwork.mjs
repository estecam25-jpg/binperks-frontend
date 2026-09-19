/**
 * Generates the base artwork for the five non-poster marketing materials,
 * uploads it to the marketing-templates bucket, and stores the overlay
 * rectangles.
 *
 * RUN WITH: node scripts/generate-marketing-artwork.mjs
 *
 * WHY A SCRIPT AND NOT A ROUTE: this runs once per design change, from a
 * machine with fonts, and writes artwork that is then static. Generating it
 * per request would put SVG text rendering — the one part of the pipeline that
 * depends on system fonts — into the serverless path for every download.
 *
 * THE RECTANGLES ARE EXACT, not measured. Every layout below is authored here,
 * so the placeholder boxes' positions are known rather than eyeballed off a
 * finished image (which is what poster 5 cost three passes).
 *
 * PLACEHOLDER TEXT IS DELIBERATELY SMALL inside its box. The renderer samples
 * the box's own colour from the bands at 10–26% and 74–90% of its height, so
 * the lettering has to stay clear of them — text at ~45% of the box height,
 * centred, spans 27–73% and leaves both bands clean.
 */

import sharp from 'sharp'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const DPI = 300
const BLUE = '#4A4B98'
const NAVY = '#1A1A2E'
const WHITE = '#FFFFFF'

/** Bold sans. Coiny and Montserrat are web fonts the brand uses in the app;
 *  neither is installed as a system face, so the print artwork uses a clean
 *  bold grotesque instead. */
const FONT = "Arial, Helvetica, 'DejaVu Sans', 'Liberation Sans', sans-serif"

const LOGO = 'public/BinPerks_Landscape_Logo.png'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })

const esc = s => s.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))

/** A centred line of text. `size` and `y` are fractions of the artwork height. */
const line = (W, H, text, { y, size, fill, weight = 'bold', spacing = 0 }) =>
  `<text x="${W / 2}" y="${H * y}" text-anchor="middle" dominant-baseline="central"
         font-family="${FONT}" font-size="${H * size}" font-weight="${weight}"
         letter-spacing="${spacing}" fill="${fill}">${esc(text)}</text>`

/**
 * A placeholder box plus its label.
 *
 * The label is drawn at 45% of the box height so the renderer's colour-sampling
 * bands stay on the box fill — see the module header.
 */
function placeholder(W, H, rect, { fill, stroke, label, labelFill, radius = 0.35 }) {
  const x = rect.x * W, y = rect.y * H, w = rect.w * W, h = rect.h * H
  const r = h * radius

  // CLAMPED BY WIDTH AS WELL AS HEIGHT. Sized off the height alone, the label
  // inside a near-square QR box came out enormous and overflowed the box — and
  // the part that spilled past the edge is outside the area the renderer paints
  // over, so fragments of "[QR CODE]" survived on the finished decal and stopped
  // it scanning. ~0.6em average advance for a bold grotesque.
  const size = Math.min(h * 0.45, (w * 0.86) / (label.length * 0.6))

  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}"
          fill="${fill}" ${stroke ? `stroke="${stroke}" stroke-width="${H * 0.004}"` : ''}/>
    <text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" dominant-baseline="central"
          font-family="${FONT}" font-size="${size}" font-weight="bold"
          fill="${labelFill}">${label}</text>`
}

/** Composite the wordmark, scaled to a fraction of the artwork width. */
async function logoLayer(W, H, { widthFrac, yFrac, greyscale = false }) {
  const targetW = Math.round(W * widthFrac)
  let pipe = sharp(LOGO).resize(targetW)
  if (greyscale) pipe = pipe.greyscale()
  const buf = await pipe.png().toBuffer()
  const meta = await sharp(buf).metadata()
  return {
    input: buf,
    left: Math.round((W - targetW) / 2),
    top: Math.round(H * yFrac),
    height: meta.height,
  }
}

// ── The five designs ───────────────────────────────────────────────────────
//
// Each returns { png, nameRect, qrRect }. Sizes are the real print sizes at
// 300dpi, so the artwork is never upscaled by the renderer.

async function tableTent() {
  const W = Math.round(5.5 * DPI), H = Math.round(8.5 * DPI)   // 1650 x 2550
  // Black and white throughout: this prints on an office laser, and the
  // renderer greyscales the result anyway.
  const nameRect = { x: 0.100, y: 0.310, w: 0.800, h: 0.062 }
  const qrRect   = { x: 0.2275, y: 0.455, w: 0.545, h: 0.353 } // 3.0in square

  const logo = await logoLayer(W, H, { widthFrac: 0.62, yFrac: 0.065, greyscale: true })

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="${WHITE}"/>
    ${line(W, H, 'Join BinPerks', { y: 0.205, size: 0.055, fill: '#000000' })}
    ${line(W, H, 'Earn stamps. Unlock rewards.', { y: 0.258, size: 0.027, fill: '#333333' })}
    ${placeholder(W, H, nameRect, {
      fill: '#EDEDED', stroke: '#000000', label: '[STORE NAME]', labelFill: '#000000',
    })}
    ${placeholder(W, H, qrRect, {
      fill: WHITE, stroke: '#000000', label: '[QR CODE]', labelFill: '#000000', radius: 0.05,
    })}
    ${/* A literal ampersand: line() escapes for XML, so pre-escaping it here
          produced "&amp;" on the printed tent. */ ''}
    ${line(W, H, 'Scan to join & earn your first stamp!', { y: 0.862, size: 0.026, fill: '#000000' })}
    ${line(W, H, 'More Bins. More Wins!', { y: 0.935, size: 0.024, fill: '#555555' })}
  </svg>`

  const png = await sharp(Buffer.from(svg))
    .composite([{ input: logo.input, left: logo.left, top: logo.top }])
    .greyscale().png().toBuffer()
  return { png, nameRect, qrRect }
}

/** Blue-background designs share everything but their proportions. */
async function blueCard(W, H, layout) {
  const { logoY, logoW, headY, headSize, qrRect, nameRect, tagY, tagSize } = layout

  // The wordmark is white with a blue outline, so on blue it needs something
  // behind it. A white rounded card is the same treatment the app's own entry
  // screens use, and it reads as deliberate rather than as a clipping mistake.
  const logo = await logoLayer(W, H, { widthFrac: logoW, yFrac: logoY })
  const padX = W * 0.035, padY = H * 0.016
  const cardX = (W - W * logoW) / 2 - padX
  const cardY = H * logoY - padY
  const cardW = W * logoW + padX * 2
  const cardH = logo.height + padY * 2

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="${BLUE}"/>
    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}"
          rx="${cardH * 0.28}" ry="${cardH * 0.28}" fill="${WHITE}"/>
    ${line(W, H, 'Scan to Join', { y: headY, size: headSize, fill: WHITE })}
    ${placeholder(W, H, qrRect, {
      fill: WHITE, stroke: 'none', label: '[QR CODE]', labelFill: NAVY, radius: 0.06,
    })}
    ${placeholder(W, H, nameRect, {
      fill: '#3A3B80', stroke: WHITE, label: '[STORE NAME]', labelFill: WHITE,
    })}
    ${line(W, H, 'Earn stamps every visit!', { y: tagY, size: tagSize, fill: '#E6E6F5' })}
  </svg>`

  const png = await sharp(Buffer.from(svg))
    .composite([{ input: logo.input, left: logo.left, top: logo.top }])
    .png().toBuffer()
  return { png, nameRect, qrRect }
}

/** White designs, blue border. */
async function whiteCard(W, H, layout) {
  const { logoY, logoW, headY, headSize, qrRect, nameRect, tagY, tagSize } = layout
  const logo = await logoLayer(W, H, { widthFrac: logoW, yFrac: logoY })
  const b = Math.round(Math.min(W, H) * 0.022)   // the thin blue border

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="${WHITE}"/>
    <rect x="${b / 2}" y="${b / 2}" width="${W - b}" height="${H - b}"
          rx="${b * 1.6}" ry="${b * 1.6}" fill="none" stroke="${BLUE}" stroke-width="${b}"/>
    ${line(W, H, "We're on BinPerks!", { y: headY, size: headSize, fill: NAVY })}
    ${placeholder(W, H, qrRect, {
      fill: WHITE, stroke: BLUE, label: '[QR CODE]', labelFill: NAVY, radius: 0.06,
    })}
    ${placeholder(W, H, nameRect, {
      fill: '#EEEEF7', stroke: BLUE, label: '[STORE NAME]', labelFill: NAVY,
    })}
    ${line(W, H, 'Join free. Earn rewards.', { y: tagY, size: tagSize, fill: BLUE })}
  </svg>`

  const png = await sharp(Buffer.from(svg))
    .composite([{ input: logo.input, left: logo.left, top: logo.top }])
    .png().toBuffer()
  return { png, nameRect, qrRect }
}

const DESIGNS = {
  'table-tent': tableTent,

  'countertop-display': () => blueCard(Math.round(3.6667 * DPI), Math.round(4.25 * DPI), {
    logoY: 0.055, logoW: 0.62, headY: 0.245, headSize: 0.062,
    qrRect:   { x: 0.2568, y: 0.300, w: 0.4864, h: 0.420 },
    nameRect: { x: 0.080, y: 0.757, w: 0.840, h: 0.088 },
    tagY: 0.895, tagSize: 0.036,
  }),

  'countertop-photo': () => blueCard(Math.round(4 * DPI), Math.round(6 * DPI), {
    logoY: 0.048, logoW: 0.62, headY: 0.205, headSize: 0.046,
    qrRect:   { x: 0.2450, y: 0.262, w: 0.5100, h: 0.340 },
    nameRect: { x: 0.080, y: 0.648, w: 0.840, h: 0.066 },
    tagY: 0.762, tagSize: 0.027,
  }),

  'window-cling': () => whiteCard(Math.round(3.6667 * DPI), Math.round(4.25 * DPI), {
    logoY: 0.070, logoW: 0.58, headY: 0.248, headSize: 0.052,
    qrRect:   { x: 0.2685, y: 0.305, w: 0.4630, h: 0.400 },
    nameRect: { x: 0.090, y: 0.742, w: 0.820, h: 0.085 },
    tagY: 0.888, tagSize: 0.034,
  }),

  'storefront-photo': () => whiteCard(Math.round(4 * DPI), Math.round(6 * DPI), {
    logoY: 0.055, logoW: 0.58, headY: 0.198, headSize: 0.040,
    qrRect:   { x: 0.2450, y: 0.250, w: 0.5100, h: 0.340 },
    nameRect: { x: 0.090, y: 0.636, w: 0.820, h: 0.062 },
    tagY: 0.742, tagSize: 0.026,
  }),
}

const only = process.argv[2]
const out = []

for (const [slug, build] of Object.entries(DESIGNS)) {
  if (only && only !== slug) continue
  const { png, nameRect, qrRect } = await build()
  const meta = await sharp(png).metadata()

  const path = `${slug}.png`
  const { error: upErr } = await admin.storage.from('marketing-templates')
    .upload(path, png, { contentType: 'image/png', upsert: true })

  const { error: dbErr } = await admin.from('marketing_templates').update({
    storage_path: path,
    name_rect: nameRect,
    qr_rect: qrRect,
    updated_at: new Date().toISOString(),
    updated_by: 'artwork-generator',
  }).eq('slug', slug)

  // A local copy, so the design can be eyeballed without a round trip.
  fs.mkdirSync('.artwork-preview', { recursive: true })
  fs.writeFileSync(`.artwork-preview/${slug}.png`, png)

  out.push({
    slug, size: `${meta.width}x${meta.height}`, kb: Math.round(png.length / 1024),
    uploaded: !upErr, seeded: !dbErr, err: upErr?.message ?? dbErr?.message ?? null,
  })
}

console.table(out)
