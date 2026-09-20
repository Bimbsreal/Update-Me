import { FixtureProvider } from './FixtureProvider.js';
import { ApiProvider } from './ApiProvider.js';
import { RssProvider, FeedProvider } from './RssProvider.js';
import { WebPublicationProvider } from './WebPublicationProvider.js';

const providers = [
  new FixtureProvider(),
  new ApiProvider(),
  new RssProvider(),
  new FeedProvider(),
  new WebPublicationProvider(),
];

export function listOfficialProviders() {
  return [...providers];
}

export function getOfficialProvider(key) {
  const found = providers.find((p) => p.key === key);
  if (!found) {
    throw new Error(`Unknown official source provider: ${key}`);
  }
  return found;
}

export function resolveProviderForSource(source) {
  // Prefer explicit provider_key; fall back to ingestion_method mapping
  const key = source.providerKey || source.ingestionMethod;
  if (key === 'atom') return getOfficialProvider('rss');
  return getOfficialProvider(key);
}

export {
  FixtureProvider,
  ApiProvider,
  RssProvider,
  FeedProvider,
  WebPublicationProvider,
};
