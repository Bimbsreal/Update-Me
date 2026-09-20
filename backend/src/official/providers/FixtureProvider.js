import { OfficialSourceProvider } from './OfficialSourceProvider.js';
import { getFixtureUpdates } from '../fixtures/index.js';

/**
 * Fixture provider — local/dev approved sample notices only.
 * Never invents live government content.
 */
export class FixtureProvider extends OfficialSourceProvider {
  get key() {
    return 'fixture';
  }

  async fetchUpdates(source) {
    const fixtureKey = source.config?.fixtureKey || source.id.replace(/^fixture_/, '');
    return getFixtureUpdates(fixtureKey);
  }
}
