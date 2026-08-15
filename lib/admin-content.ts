/**
 * Admin-managed content types.
 *
 * ONE definition drives the API routes, the admin CRUD screens and the member
 * feed. Five near-identical route files and five near-identical tab components
 * would have drifted the first time a field was added; this way a new field is
 * a single line here.
 *
 * The `slug` is the URL segment (/api/admin/content/<slug>) and the `table` is
 * the Postgres table. They differ deliberately — URLs stay kebab-case while
 * tables keep their snake_case names.
 */

export type FieldKind = 'text' | 'textarea' | 'url' | 'date' | 'color' | 'number' | 'boolean'

export interface ContentField {
  /** Column name, exactly as in Postgres. */
  name: string
  label: string
  kind: FieldKind
  required?: boolean
  placeholder?: string
}

export interface ContentType {
  slug: string
  table: string
  label: string
  /** Column rendered as the row heading in the admin list. */
  titleField: string
  /** Optional second line in the admin list. */
  subtitleField?: string
  /** Whether this type supports the pinned flag. suggested_perks does not. */
  pinned: boolean
  fields: ContentField[]
}

export const CONTENT_TYPES: ContentType[] = [
  {
    slug: 'suggested-perks',
    table: 'suggested_perks',
    label: 'Suggested Perks',
    titleField: 'title',
    subtitleField: 'description',
    pinned: false,
    fields: [
      { name: 'title',       label: 'Title',       kind: 'text',     required: true, placeholder: 'Early Bird Access' },
      { name: 'description', label: 'Description', kind: 'textarea', required: true, placeholder: 'What the member gets' },
    ],
  },
  {
    slug: 'promos',
    table: 'binperks_promos',
    label: 'BinPerks Promos',
    titleField: 'title',
    subtitleField: 'subtitle',
    pinned: true,
    fields: [
      { name: 'title',     label: 'Title',      kind: 'text',  required: true, placeholder: 'Upgrade to VIP' },
      { name: 'subtitle',  label: 'Subtitle',   kind: 'textarea', placeholder: 'Earn up to 5x faster' },
      { name: 'cta_label', label: 'CTA label',  kind: 'text',  placeholder: 'See VIP' },
      { name: 'cta_url',   label: 'CTA URL',    kind: 'url',   placeholder: '/member/upgrade' },
      { name: 'bg_color',  label: 'Background', kind: 'color' },
    ],
  },
  {
    slug: 'shop-from-home',
    table: 'shop_from_home',
    label: 'Shop From Home',
    titleField: 'store_name',
    subtitleField: 'product_title',
    pinned: true,
    fields: [
      { name: 'store_name',    label: 'Store name',    kind: 'text', required: true },
      { name: 'product_title', label: 'Product title', kind: 'text', required: true },
      { name: 'platform',      label: 'Platform',      kind: 'text', required: true, placeholder: 'Whatnot' },
      { name: 'cta_url',       label: 'CTA URL',       kind: 'url',  required: true, placeholder: 'https://…' },
    ],
  },
  {
    slug: 'beyond-the-bins',
    table: 'beyond_the_bins',
    label: 'Beyond The Bins',
    titleField: 'partner_name',
    subtitleField: 'description',
    pinned: true,
    fields: [
      { name: 'partner_name', label: 'Partner name', kind: 'text',     required: true },
      { name: 'description',  label: 'Description',  kind: 'textarea', required: true },
      { name: 'cta_label',    label: 'CTA label',    kind: 'text',     placeholder: 'Learn more' },
      { name: 'cta_url',      label: 'CTA URL',      kind: 'url',      placeholder: 'https://…' },
    ],
  },
  {
    slug: 'deals-near-you',
    table: 'deals_near_you',
    label: 'Deals Near You',
    titleField: 'event_name',
    subtitleField: 'location',
    pinned: true,
    fields: [
      { name: 'event_name',  label: 'Event name',  kind: 'text',     required: true },
      { name: 'event_type',  label: 'Event type',  kind: 'text',     required: true, placeholder: 'Flea market' },
      { name: 'location',    label: 'Location',    kind: 'text',     required: true, placeholder: 'Tampa, FL' },
      { name: 'event_date',  label: 'Date',        kind: 'date' },
      { name: 'description', label: 'Description', kind: 'textarea' },
      { name: 'cta_url',     label: 'CTA URL',     kind: 'url',      placeholder: 'https://…' },
    ],
  },
]

export function contentTypeBySlug(slug: string): ContentType | null {
  return CONTENT_TYPES.find(t => t.slug === slug) ?? null
}

/**
 * Every column the API is willing to read or write for a type.
 *
 * The write path builds its payload from THIS list rather than from the request
 * body, so an extra key in the body can never reach the table — a caller
 * cannot set `id`, `created_at`, or a column belonging to another type.
 */
export function columnsFor(type: ContentType): string[] {
  return [
    'id',
    ...type.fields.map(f => f.name),
    'display_order',
    'active',
    ...(type.pinned ? ['pinned'] : []),
    'created_at',
  ]
}

/** Writable columns — everything except the server-owned ones. */
export function writableColumnsFor(type: ContentType): string[] {
  return columnsFor(type).filter(c => c !== 'id' && c !== 'created_at')
}

/** Feed ordering: pinned first where supported, then display_order, then oldest. */
export function applyFeedOrder<T extends {
  order: (col: string, opts: { ascending: boolean }) => T
}>(query: T, type: ContentType): T {
  let q = query
  if (type.pinned) q = q.order('pinned', { ascending: false })
  return q.order('display_order', { ascending: true }).order('created_at', { ascending: true })
}
