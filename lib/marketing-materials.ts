/**
 * The merchant marketing materials — the half of them that lives in code.
 *
 * CLIENT-SAFE. Types and the recipes only — no sharp, no pdf-lib, no Supabase.
 *
 * A MATERIAL IS NOW SPLIT IN TWO, and the seam matters:
 *
 *   RECIPE (here)  the geometry. Sheet layout, print size, how many up, which
 *                  designs it is built from, whether it prints mono, which
 *                  join URL the QR encodes. This is the rendering logic, so it
 *                  stays in code where it can be reviewed and tested.
 *   ROW (database) what admin can safely change without a deploy. Title,
 *                  description, category, order, active, lifestyle photo.
 *                  See the marketing_materials table.
 *
 * A row names its recipe in `render_recipe`. Together they make the
 * MaterialSpec the renderer has always taken — see specForMaterial — so
 * lib/marketing-render did not have to change at all.
 *
 * ONE UNIT OF ARTWORK PER TEMPLATE. A six-up decal sheet is not stored as a
 * sheet: admin uploads one decal and the renderer tiles it. That keeps each
 * design's [STORE NAME] and [QR CODE] rectangles defined once, instead of once
 * per position on a page.
 *
 * WHICH QR GOES ON WHICH MATERIAL IS THE WHOLE POINT of the categories.
 * At The Register carries the in-store source, whose signup awards that day's
 * visit stamp. In-Store Signage carries the plain join link, because a poster
 * on a wall is read by someone who may not be at the counter — see
 * lib/join-source. A material's recipe decides this, not its category, so
 * moving a card between sections cannot silently change what its QR does.
 */

/** Which join URL a material's QR encodes. */
export type QrTarget = 'register' | 'social'

export type MaterialOutput = 'pdf' | 'jpg'

/** US Letter at 72pt/inch, the unit pdf-lib works in. */
export const PT_PER_INCH = 72

export interface SheetLayout {
  /** Page size in inches. */
  pageW: number
  pageH: number
  /** How many units across and down. */
  cols: number
  rows: number
  /** One unit's size in inches. */
  unitW: number
  unitH: number
}

export interface MaterialSpec {
  slug: string
  label: string
  /** Which section of the Marketing tab it belongs to. */
  section: 'register' | 'signage'
  /** Shown under the label on the card. */
  description: string
  qrTarget: QrTarget
  output: MaterialOutput
  /**
   * The template slugs this material is built from, in order.
   *
   * One for everything except the posters, which combine five designs into one
   * five-page PDF.
   */
  templates: string[]
  /** Absent for the multi-page poster PDF, which is one design per page. */
  sheet?: SheetLayout
  /** Single-image output size in inches (the 4x6 photo prints). */
  imageSize?: { w: number; h: number }
  /** Rendered greyscale. The table tent is printed on an office laser. */
  monochrome?: boolean
  /** File name stem; the store slug and extension are appended. */
  fileStem: string
}

/** 11x8.5 landscape, six 3.67x4.25 decals three across and two down. */
const DECAL_SHEET: SheetLayout = {
  pageW: 11, pageH: 8.5, cols: 3, rows: 2, unitW: 3.6667, unitH: 4.25,
}

export const MATERIALS: MaterialSpec[] = [
  {
    slug: 'table-tent',
    label: 'Table Tent',
    section: 'register',
    description: '2 tents per sheet · fold in half to stand on the counter · black & white',
    qrTarget: 'register',
    output: 'pdf',
    templates: ['table-tent'],
    // Two 5.5x8.5 panels side by side fill an 11x8.5 landscape sheet exactly.
    sheet: { pageW: 11, pageH: 8.5, cols: 2, rows: 1, unitW: 5.5, unitH: 8.5 },
    monochrome: true,
    fileStem: 'binperks-table-tent',
  },
  {
    slug: 'countertop-display',
    label: 'Countertop Display',
    section: 'register',
    description: '6 decals per sheet · 4.25" × 3.67" each · full colour',
    qrTarget: 'register',
    output: 'pdf',
    templates: ['countertop-display'],
    sheet: DECAL_SHEET,
    fileStem: 'binperks-countertop-display',
  },
  {
    slug: 'countertop-photo',
    label: 'Countertop Photo Print',
    section: 'register',
    description: 'Single 4" × 6" print · full colour · order from any photo lab',
    qrTarget: 'register',
    output: 'jpg',
    templates: ['countertop-photo'],
    imageSize: { w: 4, h: 6 },
    fileStem: 'binperks-countertop-photo',
  },
  {
    slug: 'store-posters',
    label: 'Store Posters',
    section: 'signage',
    description: '5 poster designs — print and display throughout your store',
    qrTarget: 'social',
    output: 'pdf',
    templates: ['poster-1', 'poster-2', 'poster-3', 'poster-4', 'poster-5'],
    fileStem: 'binperks-posters',
  },
  {
    slug: 'window-cling',
    label: 'Window Cling Decals',
    section: 'signage',
    description: '6 decals per sheet · 4.25" × 3.67" each · print on cling paper',
    qrTarget: 'social',
    output: 'pdf',
    templates: ['window-cling'],
    sheet: DECAL_SHEET,
    fileStem: 'binperks-window-cling',
  },
  {
    slug: 'storefront-photo',
    label: 'Storefront Photo Print',
    section: 'signage',
    description: 'Single 4" × 6" print · order from any photo lab',
    qrTarget: 'social',
    output: 'jpg',
    templates: ['storefront-photo'],
    imageSize: { w: 4, h: 6 },
    fileStem: 'binperks-storefront-photo',
  },
]

export function materialBySlug(slug: string): MaterialSpec | null {
  return MATERIALS.find(m => m.slug === slug) ?? null
}

// ── Categories ───────────────────────────────────────────────────────────────

/**
 * The database's category values.
 *
 * `social_media_post` is listed so admin sees the section, but nothing is
 * stored under it: the Social Media tab already owns that content and
 * duplicating it here would give two places to edit one thing.
 */
export type MaterialCategory = 'at_the_register' | 'in_store_signage' | 'social_media_post'

export const CATEGORIES: {
  id: MaterialCategory
  title: string
  subtitle: string
  /** False for the category the Social Media tab owns. */
  editable: boolean
}[] = [
  {
    id: 'at_the_register',
    title: 'At The Register',
    subtitle: 'Stamp awarded when new members scan and sign up',
    editable: true,
  },
  {
    id: 'in_store_signage',
    title: 'In-Store Signage',
    subtitle: 'Help customers discover BinPerks and sign up',
    editable: true,
  },
  {
    id: 'social_media_post',
    title: 'Social Media Post',
    subtitle: 'Managed in the Social Media tab',
    editable: false,
  },
]

// ── Recipes ──────────────────────────────────────────────────────────────────

/**
 * The geometry a material can be built with, by name.
 *
 * Keyed on the same slugs the six original materials used, so the seeded rows
 * point at exactly the layout they have always rendered with.
 */
export const RENDER_RECIPES: Record<string, MaterialSpec> =
  Object.fromEntries(MATERIALS.map(m => [m.slug, m]))

export function recipeBySlug(slug: string | null | undefined): MaterialSpec | null {
  return slug ? RENDER_RECIPES[slug] ?? null : null
}

/** What a recipe can actually produce. A sheet is a PDF and a photo print is a
 *  JPEG — the two paths through the renderer are different, and neither can
 *  emit the other's format. The admin format selector is limited to this. */
export function formatsForRecipe(slug: string | null | undefined): MaterialOutput[] {
  const r = recipeBySlug(slug)
  return r ? [r.output] : []
}

/** The database row, as the admin and merchant routes both see it. */
export interface MaterialRow {
  id: string
  slug: string
  category: MaterialCategory
  title: string
  description: string
  render_recipe: string | null
  template_slugs: string[]
  lifestyle_image_path: string | null
  download_format: 'pdf' | 'jpg' | 'both'
  display_order: number
  active: boolean
}

/**
 * The spec the renderer takes, assembled from a row and its recipe.
 *
 * The recipe supplies everything that decides how pixels land — sheet, size,
 * fold lines, QR target. The row supplies only which designs to draw and what
 * to call the file, which is what lets admin add a second poster set without a
 * deploy. Null when the row names no recipe, or one that no longer exists:
 * callers treat that as an unrenderable material rather than guessing.
 *
 * SLUG STAYS THE RECIPE'S. The renderer reads spec.slug to decide whether to
 * draw the tent's fold line, so it identifies the geometry, not the material.
 * A second tent added by admin has its own row slug and still folds; handing
 * the row's slug down here would have silently dropped that line.
 */
export function specForMaterial(row: MaterialRow): MaterialSpec | null {
  const recipe = recipeBySlug(row.render_recipe)
  if (!recipe) return null

  const templates = row.template_slugs.length > 0 ? row.template_slugs : recipe.templates
  // A recipe's page geometry assumes a fixed number of designs — the poster PDF
  // is one page per template, the sheets are one design tiled. Taking a
  // different count would render a page short or drop artwork silently.
  if (templates.length !== recipe.templates.length) return null

  return {
    ...recipe,
    label: row.title,
    description: row.description,
    templates,
    // A material that IS its recipe keeps the recipe's own stem, so the six
    // original downloads are named exactly what they have always been named —
    // Store Posters stays binperks-posters, not binperks-store-posters.
    // Anything admin adds later is named for itself, so two materials sharing
    // a recipe do not overwrite each other in a merchant's Downloads folder.
    fileStem: row.slug === recipe.slug ? recipe.fileStem : `binperks-${row.slug}`,
  }
}
