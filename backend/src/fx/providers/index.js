import { OpenErApiProvider } from './OpenErApiProvider.js';
import { FrankfurterProvider } from './FrankfurterProvider.js';
import { CbnProvider } from './CbnProvider.js';

/**
 * Registry of FX providers. Add new providers here without changing callers.
 */
const providers = [
  new OpenErApiProvider(),
  new FrankfurterProvider(),
  new CbnProvider(),
];

export function listFxProviders() {
  return [...providers];
}

export function getEnabledFxProviders() {
  return providers.filter((p) => p.isEnabled);
}

export function getFxProvider(key) {
  const found = providers.find((p) => p.key === key);
  if (!found) {
    throw new Error(`Unknown FX provider: ${key}`);
  }
  return found;
}

export { OpenErApiProvider, FrankfurterProvider, CbnProvider };
