import { FXProvider } from './FXProvider.js';
import { FX_RATE_TYPES } from '../../config/fx.js';
import { env } from '../../config/env.js';

/**
 * Frankfurter — ECB-derived rates. Kept in the registry for architecture
 * completeness, but disabled by default because NGN is not reliably available.
 */
export class FrankfurterProvider extends FXProvider {
  get key() {
    return 'frankfurter';
  }

  get sourceId() {
    return 'frankfurter';
  }

  get displayName() {
    return 'External market data (Frankfurter / ECB reference)';
  }

  get rateType() {
    return FX_RATE_TYPES.MARKET_INDICATIVE;
  }

  get isEnabled() {
    return env.FX_FRANKFURTER_ENABLED === true;
  }

  async fetchLatest() {
    throw new Error(
      'Frankfurter provider is disabled by default (NGN not reliably available). Enable FX_FRANKFURTER_ENABLED only if you have a compatible endpoint.'
    );
  }

  async fetchHistory() {
    return [];
  }
}
