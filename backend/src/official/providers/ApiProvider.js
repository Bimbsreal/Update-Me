import { OfficialSourceProvider } from './OfficialSourceProvider.js';
import { fetchJsonWithTimeout } from './utils.js';
import { env } from '../../config/env.js';

/**
 * JSON API provider for explicitly configured official endpoints.
 * Expects { updates: [...] } or a bare array of update objects.
 */
export class ApiProvider extends OfficialSourceProvider {
  get key() {
    return 'api';
  }

  async fetchUpdates(source) {
    if (!source.feedUrl || source.feedUrl.startsWith('fixture:')) {
      throw new Error(`API provider requires an https feed_url for source ${source.id}`);
    }

    const data = await fetchJsonWithTimeout(source.feedUrl, {
      timeoutMs: env.OFFICIAL_PROVIDER_TIMEOUT_MS || 12000,
      headers: source.config?.headers || {},
    });

    const list = Array.isArray(data) ? data : data?.updates;
    if (!Array.isArray(list)) {
      throw new Error('API provider expected an array or { updates: [] } payload');
    }
    return list;
  }
}
