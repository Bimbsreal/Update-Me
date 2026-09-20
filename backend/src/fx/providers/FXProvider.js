/**
 * FXProvider — abstract provider contract.
 * Pipeline: Source → Fetch → Validate → Normalize → Store → Display
 */

export class FXProvider {
  /** @returns {string} Stable provider key (matches fx_sources.provider_key) */
  get key() {
    throw new Error('FXProvider.key must be implemented');
  }

  /** @returns {string} fx_sources.id */
  get sourceId() {
    throw new Error('FXProvider.sourceId must be implemented');
  }

  /** @returns {string} Human-readable source label (never claim CBN unless verified) */
  get displayName() {
    throw new Error('FXProvider.displayName must be implemented');
  }

  /** @returns {'official_reference'|'market_indicative'} */
  get rateType() {
    throw new Error('FXProvider.rateType must be implemented');
  }

  /** Whether this provider is enabled for scheduled/manual sync */
  get isEnabled() {
    return true;
  }

  /**
   * Fetch latest rates for the given pairs.
   * @param {{ base: string, quote: string }[]} pairs
   * @returns {Promise<import('./types.js').FxNormalizedRate[]>}
   */
  async fetchLatest(_pairs) {
    throw new Error('FXProvider.fetchLatest must be implemented');
  }

  /**
   * Optionally backfill historical daily rates (provider must return real observations).
   * @param {{ base: string, quote: string }[]} pairs
   * @param {{ days: number }} options
   * @returns {Promise<import('./types.js').FxNormalizedRate[]>}
   */
  async fetchHistory(_pairs, _options) {
    return [];
  }
}

/**
 * @typedef {object} FxNormalizedRate
 * @property {string} sourceId
 * @property {string} baseCurrency
 * @property {string} quoteCurrency
 * @property {number} rate
 * @property {'official_reference'|'market_indicative'} rateType
 * @property {string|Date} observedAt
 * @property {string} effectiveDate YYYY-MM-DD
 * @property {string} [rawFingerprint]
 */
