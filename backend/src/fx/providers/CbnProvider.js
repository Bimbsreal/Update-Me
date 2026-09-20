import { FXProvider } from './FXProvider.js';
import { FX_RATE_TYPES } from '../../config/fx.js';
import { env } from '../../config/env.js';

/**
 * CBN official/reference provider placeholder.
 * Disabled until a verified official feed + credentials are configured.
 * Never invents rates; never activates without explicit env enablement.
 */
export class CbnProvider extends FXProvider {
  get key() {
    return 'cbn';
  }

  get sourceId() {
    return 'cbn';
  }

  get displayName() {
    return 'Central Bank of Nigeria (CBN)';
  }

  get rateType() {
    return FX_RATE_TYPES.OFFICIAL_REFERENCE;
  }

  get isEnabled() {
    return Boolean(env.FX_CBN_ENABLED && env.FX_CBN_API_URL);
  }

  async fetchLatest(_pairs) {
    if (!this.isEnabled) {
      throw new Error(
        'CBN FX provider is not configured. Set FX_CBN_ENABLED=true and FX_CBN_API_URL with a verified endpoint.'
      );
    }

    // Architecture ready: future official fetch goes here.
    // Intentionally unimplemented — do not scrape or invent CBN values.
    throw new Error(
      'CBN FX provider fetch is not yet implemented. Official rates will only appear after a verified integration.'
    );
  }

  async fetchHistory() {
    return [];
  }
}
