import {
  OFFICIAL_CATEGORIES,
  OFFICIAL_INGESTION_METHODS,
  OFFICIAL_JURISDICTION_LEVELS,
  OFFICIAL_PRIORITIES,
  OFFICIAL_UPDATE_TYPES,
} from '../config/official.js';
import { AppError } from '../middleware/errorHandler.js';
import { assertSafeIngestionUrl } from '../ingestion/urlPolicy.js';
import { assertSafeHttpUrl } from '../middleware/officialAdmin.js';
import { officialRepository } from '../repositories/officialRepository.js';
import { getPool } from '../db/pool.js';

function publicUpdate(update) {
  if (!update) return null;
  // Strip internal metadata noise for public responses
  const { dedupeKey, contentHash, titleNormalized, reviewNotes, ...rest } = update;
  return {
    ...rest,
    informationType: 'official',
    isOfficial: true,
    isCommunity: false,
  };
}

export const officialService = {
  getTaxonomy() {
    return {
      categories: OFFICIAL_CATEGORIES,
      updateTypes: OFFICIAL_UPDATE_TYPES,
      priorities: OFFICIAL_PRIORITIES,
      jurisdictionLevels: OFFICIAL_JURISDICTION_LEVELS,
      ingestionMethods: OFFICIAL_INGESTION_METHODS,
    };
  },

  async list(query) {
    const data = await officialRepository.listUpdates(query);
    return {
      ...data,
      items: data.items.map(publicUpdate),
    };
  },

  async getById(id) {
    const update = await officialRepository.getUpdateById(id);
    if (!update || update.status !== 'published') {
      throw new AppError('Official update not found.', 404, 'NOT_FOUND');
    }
    return {
      update: publicUpdate(update),
      asOf: new Date().toISOString(),
      note: 'Snapshot time only — cached or offline copies must not be treated as newly published.',
    };
  },

  async nearby(query) {
    const data = await officialRepository.nearbyUpdates(query);
    return {
      ...data,
      results: (data.results || []).map(publicUpdate),
      count: (data.results || []).length,
    };
  },

  async forUserLocation({ locationId = null, stateId = null, limit = 8 } = {}) {
    let resolvedStateId = stateId;
    if (!resolvedStateId && locationId) {
      const pool = getPool();
      const result = await pool.query(`SELECT state_id FROM locations WHERE id = $1`, [
        locationId,
      ]);
      resolvedStateId = result.rows[0]?.state_id || null;
    }

    const data = await officialRepository.listForLocationContext({
      locationId,
      stateId: resolvedStateId,
      limit,
    });
    return {
      items: (data.items || []).map(publicUpdate),
      count: (data.items || []).length,
      asOf: data.asOf || new Date().toISOString(),
    };
  },

  async listPublicSources() {
    const sources = await officialRepository.listSources({
      status: 'active',
      includeInactive: false,
    });
    return sources
      .filter((s) => s.verificationStatus === 'verified')
      .map((s) => ({
        id: s.id,
        organizationName: s.organizationName,
        shortName: s.shortName,
        agencyType: s.agencyType,
        jurisdictionLevel: s.jurisdictionLevel,
        officialWebsite: s.officialWebsite,
        verificationStatus: s.verificationStatus,
        sourceUnavailable:
          s.healthStatus === 'failing' || (s.consecutiveFailures || 0) >= 3,
      }));
  },

  async getPublicSource(id, query = {}) {
    const data = await officialRepository.getPublicSource(id, query);
    if (!data) {
      throw new AppError('Official source not found.', 404, 'NOT_FOUND');
    }
    return {
      ...data,
      updates: data.updates.map(publicUpdate),
    };
  },

  async adminStatus() {
    return officialRepository.getAdminStatus();
  },

  async createSource(input, admin = {}) {
    const existing = await officialRepository.getSource(input.id);
    if (existing) {
      throw new AppError('Official source id already exists.', 409, 'CONFLICT');
    }

    if (input.officialWebsite) {
      assertSafeHttpUrl(input.officialWebsite, 'officialWebsite');
    }
    if (input.feedUrl && !String(input.feedUrl).startsWith('fixture:')) {
      assertSafeIngestionUrl(input.feedUrl, 'feedUrl', {
        requireAllowlist: true,
        allowLocalhost: process.env.INGESTION_ALLOW_LOCALHOST === 'true',
      });
    }

    return officialRepository.createSource({
      ...input,
      verifiedBy: admin.userId || null,
    });
  },

  async updateSource(id, patch, admin = {}) {
    const existing = await officialRepository.getSource(id);
    if (!existing) {
      throw new AppError('Official source not found.', 404, 'NOT_FOUND');
    }
    if (patch.officialWebsite) {
      assertSafeHttpUrl(patch.officialWebsite, 'officialWebsite');
    }
    if (patch.feedUrl && !String(patch.feedUrl).startsWith('fixture:')) {
      assertSafeIngestionUrl(patch.feedUrl, 'feedUrl', {
        requireAllowlist: true,
        allowLocalhost: process.env.INGESTION_ALLOW_LOCALHOST === 'true',
      });
    }
    return officialRepository.updateSource(id, {
      ...patch,
      verifiedBy: admin.userId || null,
    });
  },

  async getSource(id) {
    const source = await officialRepository.getSource(id);
    if (!source) {
      throw new AppError('Official source not found.', 404, 'NOT_FOUND');
    }
    return source;
  },
};
