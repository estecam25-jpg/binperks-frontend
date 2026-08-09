/**
 * Product fingerprinting for the scanner catalog.
 *
 * Turns whatever the vision model returned into a stable key so the same
 * physical product scanned twice lands on one catalog row. Three tiers, most
 * trustworthy first: a UPC read off the barcode, a brand + model pair, then a
 * normalised form of the product name.
 *
 * The name tier is a fallback, not an identity — the model writes the same
 * item differently from photo to photo, so two rows for one product is an
 * expected outcome there rather than a bug.
 */

export function generateProductKey(fields: {
  upc?: string | null
  brand?: string | null
  modelNumber?: string | null
  identifiedProduct?: string | null
}): { productKey: string; keyType: 'upc' | 'brand_model' | 'normalized' } {
  if (fields.upc) return { productKey: fields.upc.trim(), keyType: 'upc' }
  if (fields.brand && fields.modelNumber) {
    const key = `${fields.brand}-${fields.modelNumber}`.toLowerCase().replace(/\s+/g, '-')
    return { productKey: key, keyType: 'brand_model' }
  }
  const normalized = (fields.identifiedProduct ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 100)
  return { productKey: normalized, keyType: 'normalized' }
}

/**
 * Whether a product name is specific enough to be worth searching for.
 *
 * "Blue plastic cup" returns nothing useful and still costs an API call. A
 * name needs some length plus a proper noun, an acronym, or a 3+ digit run —
 * the shape of a brand or model number.
 */
export function isSpecificEnough(identifiedProduct: string): boolean {
  if (!identifiedProduct || identifiedProduct.length < 15) return false
  return /[A-Z][a-z]+|[A-Z]{2,}|\d{3,}/.test(identifiedProduct)
}

/**
 * Canonical form used by the name-matching tier.
 *
 * Punctuation becomes a SPACE, not nothing. Deleting it fused hyphenated words
 * — "Eczema-Relief" collapsed to "eczemarelief", which then failed to match
 * the same product written "Eczema Relief" and produced a duplicate catalog
 * row. Substituting a space makes both normalise to "eczema relief".
 */
export function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')  // replace with space, not delete
    .replace(/\s+/g, ' ')
    .trim()
}
