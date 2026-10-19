/**
 * Versioned agreements: which one is current, how a merchant's copy is filled
 * in, and the canonical text that gets hashed.
 *
 * ── WHY THE HASH MATTERS ───────────────────────────────────────────────────
 * Every acceptance stores the SHA-256 of the exact text that was on screen.
 * That is what makes "they agreed to this" checkable later: if the agreement
 * source is ever edited, the stored hash stops matching and the difference is
 * visible, instead of the page quietly rendering new words under an old
 * acceptance. It follows that a reworded agreement is a NEW VERSION with a new
 * id — never an edit to an existing one.
 *
 * The canonical text is built from the rendered blocks in document order, with
 * fields already substituted, so it is literally what the signer read. Table
 * cells are joined with a separator that cannot occur in the document, so two
 * different tables cannot serialise to the same string.
 *
 * ── CLIENT-SAFE, EXCEPT THE HASH ───────────────────────────────────────────
 * Everything here is pure except sha256, which uses Web Crypto and therefore
 * works in both the route handler and the browser. The acceptance page hashes
 * what it displayed and the server hashes what it rendered; they must agree,
 * which is a cheap guard against the two drifting apart.
 */

import { V3_6_VERSION, V3_6_BLOCKS } from './v3-6'
import type { AgreementBlock, AgreementFields, AcceptanceDetails } from './types'

export type { AgreementBlock, AgreementFields, AcceptanceDetails }

/** Every version the app can render, by id. Old ids stay forever: a merchant
 *  who accepted V3.6 must still be able to download exactly that. */
const VERSIONS: Record<string, AgreementBlock[]> = {
  [V3_6_VERSION]: V3_6_BLOCKS,
}

/** What a new merchant accepts today. */
export const CURRENT_AGREEMENT_VERSION = V3_6_VERSION

export function blocksForVersion(version: string): AgreementBlock[] | null {
  return VERSIONS[version] ?? null
}

/** The document's own wording for a review link that has not been set yet.
 *  Kept here so the Order Form never shows a bare placeholder. */
const REVIEW_FALLBACK = 'To be entered in merchant settings'

export interface MerchantAgreementSource {
  companyName: string | null
  ownerName: string | null
  ownerEmail: string | null
  phone: string | null
  stores: {
    displayName: string | null
    address: string | null
    addressLine2?: string | null
    city: string | null
    state: string | null
    zip: string | null
    websiteUrl?: string | null
    googleReviewUrl?: string | null
  }[]
}

/** A store's address on one line, skipping the parts that are missing. */
function oneLineAddress(s: MerchantAgreementSource['stores'][number]): string {
  const cityState = [s.city, s.state].filter(Boolean).join(', ')
  return [s.address, s.addressLine2, [cityState, s.zip].filter(Boolean).join(' ')]
    .filter(p => p && String(p).trim()).join(', ')
}

/**
 * Fill the Order Form from the merchant's own record.
 *
 * Nothing is left as a bracket placeholder: a merchant reading their copy
 * should not see "[EMAIL]" where their email belongs. Where there is genuinely
 * nothing to say, the document's own fallback wording is used — "None" for an
 * optional website, the settings note for a review link not yet entered.
 */
export function fieldsForMerchant(
  m: MerchantAgreementSource,
  acceptedAt: Date,
): AgreementFields {
  const first = m.stores[0]
  const contact = [m.ownerName, m.phone, m.ownerEmail].filter(Boolean).join(' / ')

  return {
    MERCHANT_LEGAL_NAME: m.companyName?.trim() || '—',
    STORE_NAME:          first?.displayName?.trim() || '—',
    STORE_WEBSITE:       first?.websiteUrl?.trim() || 'None',
    NOTICE_ADDRESS:      first ? (oneLineAddress(first) || '—') : '—',
    NOTICE_EMAIL:        m.ownerEmail?.trim() || '—',
    PRIMARY_CONTACT:     contact || '—',
    PARTICIPATING_LOCATIONS: m.stores.length
      ? m.stores.map(s => [s.displayName, oneLineAddress(s)].filter(Boolean).join(' — ')).join('\n')
      : '—',
    REVIEW_DESTINATION:  first?.googleReviewUrl?.trim() || REVIEW_FALLBACK,
    // No promotional waiver is recorded per merchant today; a discount applied
    // at checkout is a Stripe coupon, not an Order Form term.
    PROMO_WAIVER:        'None',
    EFFECTIVE_DATE:      formatAgreementDate(acceptedAt),
  }
}

/** "October 19, 2026" — the format the document already uses. */
export function formatAgreementDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
  })
}

const TOKEN = /\{\{([A-Z_]+)\}\}/g

function fill(text: string, fields: AgreementFields): string {
  return text.replace(TOKEN, (whole, key: string) =>
    (fields as unknown as Record<string, string>)[key] ?? whole)
}

/** The merchant's copy: every token replaced, blocks otherwise untouched. */
export function renderAgreement(
  version: string,
  fields: AgreementFields,
): AgreementBlock[] | null {
  const blocks = blocksForVersion(version)
  if (!blocks) return null
  return blocks.map(b => {
    if (b.k === 'tbl') return { k: 'tbl' as const, rows: b.rows.map(r => r.map(c => fill(c, fields))) }
    if (b.k === 'accept') return b
    return { k: b.k, t: fill(b.t, fields) }
  })
}

/**
 * The exact text that was accepted, as one string.
 *
 * Deterministic and lossless enough to hash: headings and paragraphs on their
 * own lines, table cells joined by a tab (which the document never contains),
 * and the acceptance block marked rather than rendered — the signer's name and
 * the timestamp live in the record, not in the document being hashed, or no
 * two acceptances of the same agreement could ever share a hash.
 */
export function canonicalAgreementText(blocks: AgreementBlock[]): string {
  const out: string[] = []
  for (const b of blocks) {
    if (b.k === 'tbl') {
      for (const row of b.rows) out.push(row.join('\t'))
    } else if (b.k === 'accept') {
      out.push('[ACCEPTANCE BLOCK]')
    } else {
      out.push(b.t)
    }
  }
  return out.join('\n')
}

/** SHA-256 hex. Web Crypto, so the same code runs on the server and in the
 *  browser and the two can be compared. */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** The sentence the merchant ticks. One wording, used by the page, the PDF and
 *  the certificate, so the record cannot describe something else. */
export function acceptanceStatement(merchantLegalName: string, version: string): string {
  return `I have read and agree to the BinPerks Merchant Participation and Platform `
       + `Agreement (${version}) and Order Form, and I am authorized to accept it on `
       + `behalf of ${merchantLegalName}.`
}

/** How the acceptance block reads in place of the two signature lines. */
export function acceptanceBlockLines(a: AcceptanceDetails): string[] {
  return [
    'BinPerks LLC — accepted by platform',
    '',
    `${a.merchantLegalName} — accepted electronically`,
    `By: ${a.signerName}, ${a.signerTitle}`,
    `Date: ${formatAgreementDate(new Date(a.acceptedAt))}`,
  ]
}
