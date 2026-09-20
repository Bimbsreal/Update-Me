/**
 * Routing provider abstraction.
 * Frontend/API must not couple to a specific routing engine.
 */

export class RoutingProviderError extends Error {
  constructor(message, code = 'ROUTING_UNAVAILABLE') {
    super(message);
    this.name = 'RoutingProviderError';
    this.code = code;
  }
}

/**
 * @typedef {object} RoutingRequest
 * @property {{ id: string, lat?: number|null, lng?: number|null, name?: string }} origin
 * @property {{ id: string, lat?: number|null, lng?: number|null, name?: string }} destination
 * @property {'driving'|'public_transport'|'walking'} mode
 */

/**
 * @typedef {object} RoutingResult
 * @property {boolean} available
 * @property {string} provider
 * @property {string|null} message
 * @property {object|null} route  // geometry/legs only when a real provider returns them
 */

export class RoutingProvider {
  get name() {
    return 'base';
  }

  /**
   * @param {RoutingRequest} _request
   * @returns {Promise<RoutingResult>}
   */
  async getRoute(_request) {
    throw new RoutingProviderError('Routing provider not implemented.');
  }
}

/**
 * Default provider for local development — never fabricates routes.
 * Returns an honest unavailable result so the UI can show empty/context states.
 */
export class UnavailableRoutingProvider extends RoutingProvider {
  get name() {
    return 'unavailable';
  }

  async getRoute(_request) {
    return {
      available: false,
      provider: this.name,
      message: 'Directions are temporarily unavailable for this route.',
      route: null,
    };
  }
}

/**
 * Placeholder for a future OpenStreetMap / OSRM-backed provider.
 * Explicitly refuses to invent geometry until configured.
 */
export class OsmRoutingProviderStub extends RoutingProvider {
  constructor({ enabled = false } = {}) {
    super();
    this.enabled = enabled;
  }

  get name() {
    return 'osm_stub';
  }

  async getRoute(_request) {
    if (!this.enabled) {
      return {
        available: false,
        provider: this.name,
        message: 'External OSM routing is not enabled in this environment.',
        route: null,
      };
    }
    throw new RoutingProviderError(
      'OSM routing provider is enabled but not yet connected.',
      'ROUTING_NOT_CONFIGURED'
    );
  }
}

let activeProvider = new UnavailableRoutingProvider();

export function getRoutingProvider() {
  return activeProvider;
}

export function setRoutingProvider(provider) {
  if (!(provider instanceof RoutingProvider)) {
    throw new TypeError('provider must extend RoutingProvider');
  }
  activeProvider = provider;
  return activeProvider;
}

export function resetRoutingProvider() {
  activeProvider = new UnavailableRoutingProvider();
  return activeProvider;
}
