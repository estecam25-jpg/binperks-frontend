/**
 * The merchant marketing materials.
 *
 * CLIENT-SAFE. Types and the registry only — no sharp, no pdf-lib, no Supabase.
 * The merchant Marketing tab imports this to lay out its two sections, and the
 * render route imports it to know what to build, so the two cannot disagree
 * about what exists or which URL goes on it.
 *
 * ONE UNIT OF ARTWORK PER TEMPLATE. A six-up decal sheet is not stored as a
 * sheet: admin uploads one decal and the renderer tiles it. That keeps each
 * design's [STORE NAME] and [QR CODE] rectangles defined once, instead of once
 * per position on a page.
 *
 * WHICH QR GOES ON WHICH MATERIAL IS THE WHOLE POINT of the two sections.
 * At The Register carries the in-store source, whose signup awards that day's
 * visit stamp. In-Store Signage carries the plain join link, because a poster
 * on a wall is read by someone who may not be at the counter — see
 * lib/join-source.
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

export const SECTIONS: { id: 'register' | 'signage'; title: string; subtitle: string }[] = [
  {
    id: 'register',
    title: 'At The Register',
    subtitle: 'Stamp awarded when new members scan and sign up',
  },
  {
    id: 'signage',
    title: 'In-Store Signage',
    subtitle: 'Help customers discover BinPerks and sign up',
  },
]

/** Everything in one section, in registry order. */
export function materialsInSection(section: 'register' | 'signage'): MaterialSpec[] {
  return MATERIALS.filter(m => m.section === section)
}
