/**
 * Brave image search provider.
 *
 * CONTRACT: results are TRANSIENT. Brave's standard plan permits display only,
 * so a returned URL may be passed to the browser for this one render and must
 * never be written to Supabase, logged, or cached. `canPersistResults` is
 * `false` as a type-level statement of that, not a runtime toggle — nothing in
 * this codebase is allowed to set it true without a licence that says so.
 *
 * Every configuration value comes from the environment. Nothing here is tuned
 * by editing code.
 */

export interface ImageSearchResult {
  url: string      // transient — display only, never stored
  provider: 'brave'
}

export interface ImageSearchProvider {
  canPersistResults: false
  search(query: string): Promise<ImageSearchResult | null>
}

export class BraveImagesProvider implements ImageSearchProvider {
  canPersistResults = false as const

  /**
   * Returns the first usable https image URL, or null.
   *
   * Never throws: a missing key, a non-2xx, a timeout, and malformed JSON all
   * resolve to null. A decorative image is not worth failing a scan over, and
   * the caller logs the outcome either way.
   */
  async search(query: string): Promise<ImageSearchResult | null> {
    const apiKey = process.env.BRAVE_IMAGE_SEARCH_API_KEY
    if (!apiKey) return null

    const maxResults = Number(process.env.IMAGE_SEARCH_MAX_RESULTS ?? 3)
    const timeoutMs = Number(process.env.IMAGE_SEARCH_TIMEOUT_MS ?? 4000)

    const url = `https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(query)}&count=${maxResults}`

    try {
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': apiKey,
        },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) return null
      const data = await res.json()
      const results = data?.results ?? []
      for (const result of results) {
        const imageUrl = result?.properties?.url ?? result?.thumbnail?.src
        if (typeof imageUrl === 'string' && imageUrl.startsWith('https://')) {
          return { url: imageUrl, provider: 'brave' }
        }
      }
      return null
    } catch {
      return null
    }
    // IMPORTANT: Do not log or store result URLs.
    // Brave standard-plan results remain transient.
  }
}
