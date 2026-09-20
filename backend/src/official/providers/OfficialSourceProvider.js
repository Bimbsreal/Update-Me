/**
 * OfficialSourceProvider — abstract ingestion contract.
 * Pipeline: Approved Source → Fetch → Validate → Normalize → Store → Display
 */

export class OfficialSourceProvider {
  get key() {
    throw new Error('OfficialSourceProvider.key must be implemented');
  }

  /**
   * @param {object} source — official_sources row (mapped)
   * @returns {Promise<object[]>} normalized update payloads (pre-dedupe)
   */
  async fetchUpdates(_source) {
    throw new Error('OfficialSourceProvider.fetchUpdates must be implemented');
  }
}
