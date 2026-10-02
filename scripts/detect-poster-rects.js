/**
 * Finds the [STORE NAME] and [QR CODE] placeholder boxes in a poster PNG.
 *
 * Run from the repo root so sharp resolves:
 *   node scripts/detect-poster-rects.js <dir-of-images> [--debug <out-dir>]
 *
 * Rects come out as fractions of the image, which is what marketing_templates
 * stores and what lib/marketing-render multiplies back up.
 *
 * HOW IT FINDS THEM
 *   QR    the largest light, roughly square region that is enclosed by darker
 *         pixels — every design draws the code on a white panel, and the panel
 *         is the only big square of white on the sheet.
 *   NAME  the topmost run of dark text wide enough to be the title, grown
 *         outwards while the pixels beyond it stay light and uniform, so the
 *         rect lands on the pill the text sits in rather than the glyphs.
 *
 * Growth is capped: on the designs with a white background there is no pill to
 * stop at, and an uncapped grow would swallow the whole sheet.
 */

const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const LIGHT = 215          // min channel for a flat white
const DARK_LUM = 115       // max luminance for "dark"

/**
 * Light enough to be a placeholder panel.
 *
 * NOT just "all channels above 215": poster 9's title pill is a pale blue
 * (196,220,251), which a per-channel test rejects while the eye reads it as
 * white. Bright AND close to neutral catches those without letting a
 * saturated background in — the sheet blues sit near 110 luminance.
 */
function isLight(r, g, b) {
  if (lum(r, g, b) < 212) return false
  return Math.max(r, g, b) - Math.min(r, g, b) < 62
}

function lum(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b }

async function raw(file) {
  const img = sharp(file).removeAlpha()
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
  return { data, W: info.width, H: info.height, ch: info.channels }
}

/** Connected components over a boolean mask. Returns {bbox, area} list. */
function components(mask, W, H, minArea) {
  const label = new Int32Array(W * H).fill(-1)
  const out = []
  const stack = []
  for (let i = 0; i < W * H; i++) {
    if (!mask[i] || label[i] !== -1) continue
    const id = out.length
    let minX = W, maxX = 0, minY = H, maxY = 0, area = 0
    stack.push(i); label[i] = id
    while (stack.length) {
      const p = stack.pop()
      const x = p % W, y = (p - x) / W
      area++
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
      if (x > 0     && mask[p - 1] && label[p - 1] === -1) { label[p - 1] = id; stack.push(p - 1) }
      if (x < W - 1 && mask[p + 1] && label[p + 1] === -1) { label[p + 1] = id; stack.push(p + 1) }
      if (y > 0     && mask[p - W] && label[p - W] === -1) { label[p - W] = id; stack.push(p - W) }
      if (y < H - 1 && mask[p + W] && label[p + W] === -1) { label[p + W] = id; stack.push(p + W) }
    }
    if (area >= minArea) out.push({ minX, maxX, minY, maxY, area })
    else out.push(null)
  }
  return out.filter(Boolean)
}

/** Does this component touch the image border? A white background does. */
function touchesEdge(c, W, H) {
  return c.minX <= 1 || c.minY <= 1 || c.maxX >= W - 2 || c.maxY >= H - 2
}

/** Light regions that are enclosed by darker pixels — the panels a design
 *  draws its placeholders on. The sheet background is excluded by dropping
 *  anything that reaches the edge of the image. */
function lightPanels(img) {
  const { data, W, H, ch } = img
  const light = new Uint8Array(W * H)
  for (let i = 0, p = 0; i < data.length; i += ch, p++) {
    if (isLight(data[i], data[i + 1], data[i + 2])) light[p] = 1
  }
  return components(light, W, H, W * H * 0.0015)
    .filter(c => !touchesEdge(c, W, H))
    .map(c => {
      const w = c.maxX - c.minX + 1, h = c.maxY - c.minY + 1
      return { ...c, w, h, ratio: w / h, fill: c.area / (w * h), darkInside: darkCount(img, c) }
    })
    // A pill whose text fills most of it scores low; 0.28 keeps those and
    // still drops the ragged blobs that are several white things at once.
    .filter(c => c.fill >= 0.28)
}

/** Dark pixels inside a box — a placeholder panel always holds its label. */
function darkCount(img, box) {
  const { data, W, ch } = img
  let n = 0
  for (let y = box.minY; y <= box.maxY; y += 2) {
    for (let x = box.minX; x <= box.maxX; x += 2) {
      const i = (y * W + x) * ch
      if (lum(data[i], data[i + 1], data[i + 2]) < DARK_LUM) n++
    }
  }
  return n
}

/** The title on a design with no pill behind it — a white sheet.
 *
 *  Row profiles do not work there: the character's blue hoodie is as dark as
 *  the lettering and runs most of the height, so every band merges into one.
 *  This works on the GLYPHS instead — small dark blobs sitting on light
 *  pixels — and groups the ones that share a line.
 */
function titleFromGlyphs(img) {
  const { data, W, H, ch } = img
  const dark = new Uint8Array(W * H)
  for (let i = 0, p = 0; i < data.length; i += ch, p++) {
    if (lum(data[i], data[i + 1], data[i + 2]) < DARK_LUM) dark[p] = 1
  }
  const allDark = components(dark, W, H, 40)
    .map(c => ({ ...c, w: c.maxX - c.minX + 1, h: c.maxY - c.minY + 1 }))
  const glyphs = allDark
    // THE TITLE BAND. Every one of these designs puts [STORE NAME] in the
    // top fifth of the sheet; the lines below it are the BinPerks wordmark and
    // "participating store", which carry more ink and would otherwise win.
    .filter(g => g.minY < H * 0.22)
    .filter(g => g.h > H * 0.012 && g.h < H * 0.07)   // the size of a capital
    .filter(g => g.w < W * 0.12)
    .filter(g => {
      // Sitting on light: check the strip just above and below the glyph.
      //
      // A THIN STRIP, not a quarter of the glyph's height. Brackets are taller
      // than the capitals beside them, so a probe scaled to their height
      // reached past the top and bottom of the pill and onto the artwork —
      // and "[STORE NAME]" lost its brackets, which then showed through at
      // both ends of the finished poster.
      const pad = Math.max(2, Math.round(g.h * 0.08))
      const top = Math.max(0, g.minY - pad), bot = Math.min(H - 1, g.maxY + pad)
      return lightShare(img, g.minX, g.maxX, top, Math.max(top, g.minY - 1)) > 0.6
          && lightShare(img, g.minX, g.maxX, Math.min(bot, g.maxY + 1), bot) > 0.6
    })
  if (!glyphs.length) return null

  // Group glyphs into lines by where their CENTRES sit.
  //
  // The first version grew each group out from a seed glyph and marked the
  // members used. Glyphs then got stolen: a tall bracket overlaps the line
  // above as well as its own, so whichever seed ran first took it, and poster
  // 9's title came out split — half the lettering in one group, "ME]" in
  // another, and the box stopped mid-word. A centre line cannot be shared, so
  // grouping on it keeps a line whole.
  const byCentre = glyphs
    .map(g => ({ ...g, cy: (g.minY + g.maxY) / 2 }))
    .sort((a, b) => a.cy - b.cy)

  const groups = []
  for (const g of byCentre) {
    const last = groups[groups.length - 1]
    const tol = Math.max(6, g.h * 0.4)
    if (last && Math.abs(g.cy - last.cy) <= tol) {
      last.items.push(g)
      last.cy = last.items.reduce((s, i) => s + i.cy, 0) / last.items.length
    } else {
      groups.push({ cy: g.cy, items: [g] })
    }
  }

  const lines = []
  for (const group of groups) {
    const line = group.items
    if (line.length < 4) continue

    // Trim decoration off the ends. A sparkle beside the title shares its
    // line, and keeping it would stretch the box out over artwork the design
    // means to show. Letters sit close together; a mark set well apart from
    // its neighbour is not one of them.
    const sorted = line.sort((a, b) => a.minX - b.minX)
    const widths = sorted.map(g => g.w).sort((a, b) => a - b)
    const medianW = widths[Math.floor(widths.length / 2)] || 1
    const maxGap = medianW * 1.6
    let lo = 0, hi = sorted.length - 1
    while (hi - lo >= 4 && sorted[lo + 1].minX - sorted[lo].maxX > maxGap) lo++
    while (hi - lo >= 4 && sorted[hi].minX - sorted[hi - 1].maxX > maxGap) hi--
    const kept = sorted.slice(lo, hi + 1)

    const minX = Math.min(...kept.map(l => l.minX)), maxX = Math.max(...kept.map(l => l.maxX))
    const minY = Math.min(...kept.map(l => l.minY)), maxY = Math.max(...kept.map(l => l.maxY))
    const ink = kept.reduce((sum, l) => sum + l.area, 0)
    if (maxX - minX > W * 0.2 && kept.length >= 4) lines.push({ minX, maxX, minY, maxY, ink })
  }

  // THE MOST INK WINS, not the topmost line. Poster 9 draws little purple
  // sparkle dashes above its title: they are dark, they sit on light, they
  // span the width, and they are higher up — so "topmost" picked them and the
  // box landed above the lettering. A row of capitals carries several times
  // the ink of a handful of thin strokes.
  const best = lines.sort((a, b) => b.ink - a.ink)[0]
  if (!best) return null

  // RE-ATTACH THE CHARACTERS THE FILTERS DROPPED.
  //
  // A bracket at the end of "[STORE NAME]" can sit where the pill's rounded
  // corner has already given way to the artwork, so the "is it on light?"
  // test throws it out and the box stops just short of it — poster 9 printed
  // its closing bracket for exactly that reason. Anything of the right size,
  // on the same centre line, within a character or two of the ends, belongs
  // to the title whatever the background behind it.
  const cy = (best.minY + best.maxY) / 2
  const bandH = best.maxY - best.minY + 1
  const reach = bandH * 1.5
  let { minX, maxX, minY, maxY } = best
  for (const c of allDark) {
    if (c.h < bandH * 0.4 || c.h > bandH * 1.8) continue
    if (Math.abs((c.minY + c.maxY) / 2 - cy) > bandH * 0.35) continue
    if (c.minX > maxX + reach || c.maxX < minX - reach) continue
    minX = Math.min(minX, c.minX); maxX = Math.max(maxX, c.maxX)
    minY = Math.min(minY, c.minY); maxY = Math.max(maxY, c.maxY)
  }
  return { minX, maxX, minY, maxY, ink: best.ink }
}

/** Share of light pixels in a span. */
function lightShare({ data, W, ch }, x0, x1, y0, y1) {
  let n = 0, total = 0
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * W + x) * ch
      total++
      if (isLight(data[i], data[i + 1], data[i + 2])) n++
    }
  }
  return total ? n / total : 0
}

/** Grow a text box outwards while the pixels beyond it stay light. Capped: a
 *  white-background design has nothing to stop the growth. */
function growToPanel(img, box, caps) {
  const { W, H } = img
  let { minX, maxX, minY, maxY } = box
  const step = 2
  let moved = 0
  while (moved < caps.vert && minY - step > 0 && lightShare(img, minX, maxX, minY - step, minY - 1) > 0.9) { minY -= step; moved += step }
  moved = 0
  while (moved < caps.vert && maxY + step < H - 1 && lightShare(img, minX, maxX, maxY + 1, maxY + step) > 0.9) { maxY += step; moved += step }
  moved = 0
  while (moved < caps.horiz && minX - step > 0 && lightShare(img, minX - step, minX - 1, minY, maxY) > 0.9) { minX -= step; moved += step }
  moved = 0
  while (moved < caps.horiz && maxX + step < W - 1 && lightShare(img, maxX + 1, maxX + step, minY, maxY) > 0.9) { maxX += step; moved += step }
  return { minX, maxX, minY, maxY }
}

function toRect(box, W, H) {
  return {
    x: +(box.minX / W).toFixed(4),
    y: +(box.minY / H).toFixed(4),
    w: +((box.maxX - box.minX + 1) / W).toFixed(4),
    h: +((box.maxY - box.minY + 1) / H).toFixed(4),
  }
}

async function detect(file) {
  const img = await raw(file)
  const { W, H } = img
  const panels = lightPanels(img)

  // The QR panel: the biggest square-ish panel carrying a label.
  const qr = panels
    .filter(p => p.ratio > 0.70 && p.ratio < 1.45)
    .filter(p => p.w * p.h > W * H * 0.008)
    .filter(p => p.fill >= 0.7)          // a QR panel is a solid white square
    .filter(p => p.darkInside > 40)
    .sort((a, b) => b.w * b.h - a.w * a.h)[0]
  if (!qr) throw new Error(`${path.basename(file)}: no QR panel found`)

  // The title panel: a wide panel in the upper half, not the QR one.
  // THE TITLE IS FOUND FROM ITS LETTERS, not from the panel behind it.
  //
  // Taking the panel looked right on most designs and was wrong on two: on
  // poster 10 one white panel holds "[STORE NAME]" AND "is a" below it, so
  // painting the panel would wipe out the second line; on poster 9 the pill
  // is a pale blue that a white test misses entirely. The letters are in the
  // same place on every sheet, so they are what gets measured — then the box
  // grows outwards into the pill, and stops before it reaches the next line.
  const line = titleFromGlyphs(img)
  if (process.env.RECT_DEBUG) console.log('   line', JSON.stringify(line))
  if (!line) throw new Error(`${path.basename(file)}: no title found`)
  const lineH = line.maxY - line.minY + 1
  const lineW = line.maxX - line.minX + 1
  const grown = growToPanel(img, line, { vert: lineH * 0.45, horiz: lineH * 1.3 })

  // MUST CLEAR THE PLACEHOLDER, INSET AND ALL.
  //
  // lib/marketing-render paints the rect inset by 6% on every side, so a rect
  // drawn tight to the lettering leaves the outer 6% of it showing — the
  // brackets of "[STORE NAME]" survived at both ends on half the designs.
  // 6% of the box has to fall outside the text, so the box carries at least
  // that much padding of its own. Growth usually supplies it; this is the
  // floor when there is no pill to grow into.
  // Generous on purpose. The glyph pass can miss an end character where the
  // pill's rounded corner leaves it sitting on the artwork rather than on the
  // panel — poster 9 loses its closing bracket that way — and the padding is
  // what still covers it. Painting a little of the pill is invisible; leaving
  // a bracket is not.
  const padX = Math.round(lineW * 0.18)
  const padY = Math.round(lineH * 0.22)
  let nameBox = {
    minX: Math.max(0, Math.min(grown.minX, line.minX - padX)),
    maxX: Math.min(W - 1, Math.max(grown.maxX, line.maxX + padX)),
    minY: Math.max(0, Math.min(grown.minY, line.minY - padY)),
    maxY: Math.min(H - 1, Math.max(grown.maxY, line.maxY + padY)),
  }

  // THE PILL WINS WHEN THERE IS ONE.
  //
  // Measuring the lettering is what works on every design, but it is only ever
  // an estimate of the box the designer drew. Where the title sits on a panel
  // of its own, that panel IS the answer: it clears the placeholder completely
  // however the glyph pass did, and it is the shape the old five templates
  // used. Taken only when it sits in the title band and is not the whole
  // sheet, so a white background cannot be mistaken for a pill.
  const pill = panels
    .filter(p => p !== qr)
    .filter(p => p.minX <= line.minX + 4 && p.maxX >= line.maxX - 4)
    .filter(p => p.minY <= line.minY + 4 && p.maxY >= line.maxY - 4)
    .filter(p => p.w < W * 0.95 && p.h < H * 0.25)
    // And no taller or wider than a single line needs: poster 10 draws ONE
    // white panel around "[STORE NAME]" and "is a" together, and painting that
    // would erase the second line.
    .filter(p => p.h <= lineH * 2.0 && p.w <= lineW * 1.6)
    .sort((a, b) => a.w * a.h - b.w * b.h)[0]
  if (pill) nameBox = { minX: pill.minX, maxX: pill.maxX, minY: pill.minY, maxY: pill.maxY }

  return { nameRect: toRect(nameBox, W, H), qrRect: toRect(qr, W, H), W, H }
}

async function debugOverlay(file, out, r) {
  const { width: W, height: H } = await sharp(file).metadata()
  const box = (rect, colour) => {
    const x = Math.round(rect.x * W), y = Math.round(rect.y * H)
    const w = Math.round(rect.w * W), h = Math.round(rect.h * H)
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${colour}" stroke-width="6"/>`
  }
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${box(r.nameRect, '#FF00AA')}${box(r.qrRect, '#00FF66')}</svg>`
  await sharp(file).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toFile(out)
}

;(async () => {
  const dir = process.argv[2]
  const debugDir = process.argv.includes('--debug') ? process.argv[process.argv.indexOf('--debug') + 1] : null
  if (debugDir) fs.mkdirSync(debugDir, { recursive: true })

  const files = fs.readdirSync(dir)
    .filter(f => /\.(webp|png|jpg|jpeg)$/i.test(f))
    .sort((a, b) => parseInt(a) - parseInt(b))

  const result = {}
  for (const f of files) {
    const n = parseInt(f)
    const full = path.join(dir, f)
    const r = await detect(full)
    result[`poster-${n}`] = { name_rect: r.nameRect, qr_rect: r.qrRect }
    console.log(
      `poster-${String(n).padEnd(2)} ${r.W}x${r.H}  name ${JSON.stringify(r.nameRect)}  qr ${JSON.stringify(r.qrRect)}`,
    )
    if (debugDir) await debugOverlay(full, path.join(debugDir, `poster-${n}.png`), r)
  }
  fs.writeFileSync(path.join(dir, 'rects.json'), JSON.stringify(result, null, 2))
  console.log('\nwrote', path.join(dir, 'rects.json'))
})()
