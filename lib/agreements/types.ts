/**
 * The shape of a versioned agreement, shared by the generator, the acceptance
 * page, the PDF renderer and the hash.
 *
 * CLIENT-SAFE — types and pure functions only.
 */

/** One block of the document, in reading order. */
export type AgreementBlock =
  | { k: 'h';   t: string }                 // section heading
  | { k: 'p';   t: string }                 // paragraph ('' is a spacer)
  | { k: 'tbl'; rows: string[][] }          // Order Form / exhibit table
  | { k: 'accept' }                         // where the acceptance block is drawn

/**
 * What gets substituted into the Order Form for one merchant.
 *
 * Every field is a plain string by the time it reaches here — resolving "no
 * website" to "None" and "no review link yet" to the document's own fallback
 * wording happens once, in lib/agreements, so the page, the PDF and the hash
 * can never disagree about what was shown.
 */
export interface AgreementFields {
  MERCHANT_LEGAL_NAME: string
  STORE_NAME: string
  STORE_WEBSITE: string
  NOTICE_ADDRESS: string
  NOTICE_EMAIL: string
  PRIMARY_CONTACT: string
  PARTICIPATING_LOCATIONS: string
  REVIEW_DESTINATION: string
  PROMO_WAIVER: string
  EFFECTIVE_DATE: string
}

/** The acceptance itself, as the block and the certificate page render it. */
export interface AcceptanceDetails {
  signerName: string
  signerTitle: string
  signerEmail: string | null
  acceptedAt: string
  merchantLegalName: string
  agreementVersion: string
  ipAddress?: string | null
  userAgent?: string | null
  documentSha256?: string | null
}
