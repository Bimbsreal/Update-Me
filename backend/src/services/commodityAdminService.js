/**
 * Admin commodity price operations — catalogue, markets, observations.
 * Reuses commodities + commodity_variants + commodity_price_reports + reports.
 * Does not invent a second price-truth store or national average.
 */
import { getPool } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { adminAuditRepository } from '../repositories/adminAuditRepository.js';
import {
  COMMODITY_CATEGORIES,
  commodityCategoryLabel,
  placeTypeLabel,
  PRICE_PLACE_TYPES,
  pricingContextLabel,
  normalizeUnitPrice,
} from '../config/prices.js';
import {
  buildObservationApiFields,
  mapSourceType,
  mapVerificationStatus,
  sourceTypeLabel,
} from '../utils/priceObservationModel.js';

const PLACE_TYPES = new Set(PRICE_PLACE_TYPES.map((p) => p.id));
const CATEGORY_IDS = new Set(COMMODITY_CATEGORIES.map((c) => c.id));

async function writeAudit(admin, payload, req) {
  if (!admin?.userId && !admin?.id) return null;
  const newState = payload.newState ? { ...payload.newState } : {};
  if (req?.requestId) newState.requestId = req.requestId;
  return adminAuditRepository.create({
    actorUserId: admin.userId || admin.id,
    action: payload.action,
    entityType: payload.entityType,
    entityId: payload.entityId,
    previousState: payload.previousState || null,
    newState: Object.keys(newState).length ? newState : null,
    reason: payload.reason || null,
    ipAddress: req?.ip || null,
    userAgent: req?.get?.('user-agent') || req?.headers?.['user-agent'] || null,
  });
}

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function codeify(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function requireReason(body) {
  if (!body?.reason || String(body.reason).trim().length < 3) {
    throw new AppError('A correction reason is required.', 400, 'VALIDATION_ERROR');
  }
  return String(body.reason).trim();
}

async function resolveUnitId(unitCode) {
  const code = String(unitCode || 'unit').trim().toLowerCase().slice(0, 24);
  const found = await getPool().query(
    `SELECT id, code FROM price_units WHERE lower(code) = $1 AND is_active = TRUE LIMIT 1`,
    [code]
  );
  if (found.rows[0]) return found.rows[0];
  const fallback = await getPool().query(
    `SELECT id, code FROM price_units WHERE code = 'unit' LIMIT 1`
  );
  return fallback.rows[0] || { id: null, code };
}

async function resolveCategoryId(categoryCode) {
  if (!categoryCode) return null;
  const result = await getPool().query(
    `SELECT id, code, name, slug FROM commodity_categories WHERE code = $1 LIMIT 1`,
    [categoryCode]
  );
  return result.rows[0] || null;
}

const OBS_SELECT = `
  cpr.id AS price_id, cpr.report_id, cpr.price_amount, cpr.price_currency,
  cpr.place_label, cpr.source_reference,
  cpr.pricing_context::text AS pricing_context,
  cpr.published_at, cpr.effective_at,
  cpr.created_at AS price_created_at, cpr.updated_at AS price_updated_at,
  c.id AS commodity_id, c.code AS commodity_code, c.name AS commodity_name,
  c.slug AS commodity_slug, c.category AS commodity_category, c.category_id,
  cc.code AS category_code, cc.name AS category_name, cc.slug AS category_slug,
  cv.id AS variant_id, cv.code AS variant_code, cv.label AS variant_label,
  cv.unit_code, cv.unit_id, cv.display_name AS variant_display_name, cv.quantity,
  pu.code AS price_unit_code, pu.name AS price_unit_name,
  pu.symbol AS price_unit_symbol, pu.unit_type AS price_unit_type,
  pp.id AS place_id, COALESCE(pp.name, cpr.place_label) AS place_name, pp.place_type,
  r.user_id, r.location_id, r.title, r.description, r.source_type, r.status, r.moderation_state,
  r.latitude, r.longitude, r.occurred_at, r.expires_at, r.last_confirmed_at,
  r.confirmed_accurate_count, r.confirmed_inaccurate_count, r.created_at, r.updated_at,
  loc.name AS location_name, loc.state_id, loc.lga_id, loc.area_id,
  st.name AS state_name, lg.name AS lga_name, ar.name AS area_name,
  u.display_name AS author_display_name, p.stale_after_minutes
`;

const OBS_JOINS = `
  FROM commodity_price_reports cpr
  JOIN reports r ON r.id = cpr.report_id
  JOIN report_categories rc ON rc.id = r.category_id AND rc.code = 'prices'
  JOIN commodities c ON c.id = cpr.commodity_id
  LEFT JOIN commodity_categories cc ON cc.id = c.category_id
  JOIN commodity_variants cv ON cv.id = cpr.variant_id
  LEFT JOIN price_units pu ON pu.id = cv.unit_id
  JOIN locations loc ON loc.id = r.location_id
  LEFT JOIN states st ON st.id = loc.state_id
  LEFT JOIN lgas lg ON lg.id = loc.lga_id
  LEFT JOIN areas ar ON ar.id = loc.area_id
  LEFT JOIN price_places pp ON pp.id = cpr.place_id
  JOIN users u ON u.id = r.user_id
  LEFT JOIN category_freshness_policies p ON p.category_id = r.category_id
`;

function mapObservation(row) {
  if (!row) return null;
  const obs = buildObservationApiFields(row, { includeReporter: true });
  const categoryCode = row.category_code || row.commodity_category || null;
  return {
    id: row.price_id,
    reportId: row.report_id,
    commodity: {
      id: row.commodity_id,
      code: row.commodity_code,
      name: row.commodity_name,
      slug: row.commodity_slug,
      category: categoryCode,
      categoryId: row.category_id || null,
      categoryLabel: row.category_name || commodityCategoryLabel(categoryCode),
    },
    variant: {
      id: row.variant_id,
      code: row.variant_code,
      label: row.variant_label,
      displayName: row.variant_display_name,
      unitCode: row.unit_code,
      unitId: row.unit_id || null,
      unit: row.price_unit_code
        ? {
            id: row.unit_id,
            code: row.price_unit_code,
            name: row.price_unit_name,
            symbol: row.price_unit_symbol,
            unitType: row.price_unit_type,
          }
        : { code: row.unit_code, name: row.unit_code, symbol: row.unit_code },
      quantity: row.quantity != null ? Number(row.quantity) : null,
    },
    price: {
      amount: Number(row.price_amount),
      currency: row.price_currency || 'NGN',
      unit: row.price_unit_code
        ? {
            id: row.unit_id,
            code: row.price_unit_code,
            name: row.price_unit_name,
            symbol: row.price_unit_symbol,
          }
        : { code: row.unit_code, symbol: row.unit_code },
    },
    pricingContext: row.pricing_context || 'retail',
    pricingContextLabel: pricingContextLabel(row.pricing_context || 'retail'),
    publishedAt: row.published_at || null,
    effectiveAt: row.effective_at || null,
    normalized:
      normalizeUnitPrice({
        amount: row.price_amount,
        quantity: row.quantity,
        unitCode: row.price_unit_code || row.unit_code,
        unitType: row.price_unit_type,
      }) || null,
    place: row.place_id || row.place_name
      ? {
          id: row.place_id || null,
          name: row.place_name,
          type: row.place_type || null,
          typeLabel: row.place_type ? placeTypeLabel(row.place_type) : null,
        }
      : null,
    location: {
      id: row.location_id,
      name: row.location_name,
      stateId: row.state_id,
      stateName: row.state_name,
      lgaId: row.lga_id,
      lgaName: row.lga_name,
      areaId: row.area_id,
      areaName: row.area_name,
      state: row.state_name ? { id: row.state_id, name: row.state_name } : null,
      lga: row.lga_name ? { id: row.lga_id, name: row.lga_name } : null,
      area: row.area_name ? { id: row.area_id, name: row.area_name } : null,
    },
    coordinates:
      row.latitude != null && row.longitude != null
        ? { lat: Number(row.latitude), lng: Number(row.longitude) }
        : null,
    sourceType: row.source_type,
    sourceTypeMapped: mapSourceType(row.source_type),
    sourceTypeLabel: sourceTypeLabel(row.source_type),
    status: row.status,
    moderationState: row.moderation_state,
    ...obs,
    trustLabel: obs.source?.typeLabel
      ? `${obs.source.typeLabel}${obs.verification === 'verified' ? ' · Verified' : ''}`
      : sourceTypeLabel(row.source_type),
    title: row.title,
    description: row.description,
    authorDisplayName: row.author_display_name || null,
    confirmation: {
      stillAccurate: Number(row.confirmed_accurate_count || 0),
      noLongerAccurate: Number(row.confirmed_inaccurate_count || 0),
    },
    occurredAt: row.occurred_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const commodityAdminService = {
  async categories() {
    try {
      const result = await getPool().query(
        `SELECT code AS id, name, slug, description, is_active AS status, sort_order
         FROM commodity_categories
         WHERE is_active = TRUE
         ORDER BY sort_order ASC, name ASC`
      );
      if (result.rows.length) {
        return result.rows.map((r) => ({
          id: r.id,
          label: r.name,
          name: r.name,
          slug: r.slug,
          description: r.description,
          status: r.status ? 'active' : 'inactive',
        }));
      }
    } catch {
      /* table may not exist until migration */
    }
    return COMMODITY_CATEGORIES.map((c) => ({ ...c, label: c.label, name: c.label }));
  },

  async listUnits() {
    try {
      const result = await getPool().query(
        `SELECT id, code, name, symbol, unit_type, is_active
         FROM price_units
         WHERE is_active = TRUE
         ORDER BY name ASC`
      );
      return result.rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        symbol: r.symbol,
        unitType: r.unit_type,
        status: r.is_active ? 'active' : 'inactive',
      }));
    } catch {
      return [];
    }
  },

  placeTypes() {
    return PRICE_PLACE_TYPES.map((p) => ({ ...p }));
  },

  async dashboard() {
    const pool = getPool();
    const [
      active,
      today,
      review,
      verified,
      stale,
      hotLocs,
      conflicts,
      markets,
      anomalies,
      flagged,
    ] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS c FROM commodities WHERE is_active = TRUE`),
      pool.query(
        `SELECT COUNT(*)::int AS c ${OBS_JOINS}
         WHERE r.created_at >= date_trunc('day', NOW()) AND r.status <> 'removed'`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c ${OBS_JOINS}
         WHERE r.moderation_state IN ('flagged','queued','in_review','escalated')
            OR r.status IN ('flagged','under_review')`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c ${OBS_JOINS}
         WHERE r.status = 'confirmed' OR r.confirmed_accurate_count > 0`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c ${OBS_JOINS}
         WHERE r.status IN ('stale','expired')
            OR (r.expires_at IS NOT NULL AND r.expires_at <= NOW())`
      ),
      pool.query(
        `SELECT loc.id, loc.name, COUNT(*)::int AS c
         ${OBS_JOINS}
         WHERE r.created_at >= NOW() - INTERVAL '24 hours'
         GROUP BY loc.id, loc.name
         HAVING COUNT(*) >= 2
         ORDER BY c DESC
         LIMIT 8`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM (
           SELECT cpr.commodity_id, cpr.variant_id, r.location_id
           FROM commodity_price_reports cpr
           JOIN reports r ON r.id = cpr.report_id
           WHERE r.status IN ('submitted','active','confirmed','stale')
             AND r.created_at >= NOW() - INTERVAL '7 days'
           GROUP BY cpr.commodity_id, cpr.variant_id, r.location_id
           HAVING MAX(cpr.price_amount) - MIN(cpr.price_amount) >= 200
              AND COUNT(*) >= 2
         ) x`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM price_places WHERE is_active = TRUE`
      ),
      pool
        .query(
          `WITH peers AS (
             SELECT cpr.variant_id, cpr.pricing_context,
                    percentile_cont(0.5) WITHIN GROUP (ORDER BY cpr.price_amount::float) AS median_price,
                    COUNT(*)::int AS peer_count
             FROM commodity_price_reports cpr
             JOIN reports r ON r.id = cpr.report_id
             WHERE r.status IN ('submitted','active','confirmed','stale')
               AND cpr.price_amount IS NOT NULL
               AND r.created_at >= NOW() - INTERVAL '14 days'
             GROUP BY cpr.variant_id, cpr.pricing_context
             HAVING COUNT(*) >= 5
           )
           SELECT COUNT(*)::int AS c
           FROM commodity_price_reports cpr
           JOIN peers p ON p.variant_id = cpr.variant_id AND p.pricing_context = cpr.pricing_context
           JOIN reports r ON r.id = cpr.report_id
           WHERE r.status <> 'removed'
             AND r.created_at >= NOW() - INTERVAL '14 days'
             AND p.median_price > 0
             AND (
               cpr.price_amount::float >= GREATEST(p.median_price * 1.5, p.median_price + 5000)
               OR cpr.price_amount::float <= GREATEST(p.median_price * 0.45, 1)
               OR cpr.price_amount::float >= 500000
             )`
        )
        .catch(() => ({ rows: [{ c: 0 }] })),
      pool.query(
        `SELECT COUNT(*)::int AS c ${OBS_JOINS}
         WHERE r.moderation_state IN ('flagged','escalated') OR r.status = 'flagged'`
      ),
    ]);

    return {
      activeCommodities: active.rows[0]?.c || 0,
      observationsToday: today.rows[0]?.c || 0,
      awaitingReview: review.rows[0]?.c || 0,
      verifiedObservations: verified.rows[0]?.c || 0,
      staleOrExpired: stale.rows[0]?.c || 0,
      conflictingGroups: conflicts.rows[0]?.c || 0,
      activeMarkets: markets.rows[0]?.c || 0,
      priceAnomalies: anomalies.rows[0]?.c || 0,
      flaggedObservations: flagged.rows[0]?.c || 0,
      recentLocations: hotLocs.rows.map((r) => ({
        locationId: r.id,
        locationName: r.name,
        reportCount: r.c,
      })),
    };
  },

  async listCatalogue({ q, category, active, page = 1, limit = 50 } = {}) {
    const params = [];
    const where = [];
    if (q) {
      params.push(`%${String(q).trim()}%`);
      const i = params.length;
      where.push(`(c.name ILIKE $${i} OR c.code ILIKE $${i} OR c.slug ILIKE $${i})`);
    }
    if (category) {
      params.push(category);
      where.push(`(c.category = $${params.length} OR EXISTS (
        SELECT 1 FROM commodity_categories cc
        WHERE cc.id = c.category_id AND cc.code = $${params.length}
      ))`);
    }
    if (active === true || active === 'true') where.push(`c.is_active = TRUE`);
    if (active === false || active === 'false') where.push(`c.is_active = FALSE`);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const lim = Math.min(Number(limit) || 50, 100);
    const off = Math.max((Number(page) || 1) - 1, 0) * lim;
    params.push(lim, off);

    const result = await getPool().query(
      `SELECT c.id, c.code, c.name, c.slug, c.category, c.category_id, c.description, c.sort_order,
              c.is_active, c.created_at, c.updated_at,
              cc.name AS category_name, cc.code AS category_code,
              (
                SELECT json_agg(json_build_object(
                  'id', v.id,
                  'code', v.code,
                  'label', v.label,
                  'displayName', v.display_name,
                  'unitCode', v.unit_code,
                  'unitId', v.unit_id,
                  'quantity', v.quantity,
                  'isActive', v.is_active,
                  'sortOrder', v.sort_order
                ) ORDER BY v.sort_order, v.display_name)
                FROM commodity_variants v WHERE v.commodity_id = c.id
              ) AS variants,
              (
                SELECT COUNT(*)::int FROM commodity_price_reports cpr
                JOIN reports r ON r.id = cpr.report_id
                WHERE cpr.commodity_id = c.id AND r.status <> 'removed'
              ) AS observation_count
       FROM commodities c
       LEFT JOIN commodity_categories cc ON cc.id = c.category_id
       ${whereSql}
       ORDER BY c.sort_order ASC, c.name ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const count = await getPool().query(
      `SELECT COUNT(*)::int AS total FROM commodities c ${whereSql}`,
      params.slice(0, -2)
    );

    return {
      items: result.rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        slug: r.slug,
        category: r.category_code || r.category || null,
        categoryId: r.category_id || null,
        categoryLabel: r.category_name || commodityCategoryLabel(r.category_code || r.category),
        description: r.description || null,
        sortOrder: r.sort_order,
        isActive: r.is_active,
        observationCount: r.observation_count || 0,
        variants: r.variants || [],
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      total: count.rows[0]?.total || 0,
      page: Number(page) || 1,
      limit: lim,
      categories: await this.categories(),
      units: await this.listUnits(),
    };
  },

  async getCommodity(id) {
    const result = await getPool().query(
      `SELECT c.id, c.code, c.name, c.slug, c.category, c.category_id, c.description, c.sort_order,
              c.is_active, c.created_at, c.updated_at,
              cc.name AS category_name, cc.code AS category_code,
              (
                SELECT json_agg(json_build_object(
                  'id', v.id,
                  'code', v.code,
                  'label', v.label,
                  'displayName', v.display_name,
                  'unitCode', v.unit_code,
                  'unitId', v.unit_id,
                  'quantity', v.quantity,
                  'isActive', v.is_active,
                  'sortOrder', v.sort_order
                ) ORDER BY v.sort_order, v.display_name)
                FROM commodity_variants v WHERE v.commodity_id = c.id
              ) AS variants,
              (
                SELECT COUNT(*)::int FROM commodity_price_reports cpr
                JOIN reports r ON r.id = cpr.report_id
                WHERE cpr.commodity_id = c.id AND r.status <> 'removed'
              ) AS observation_count
       FROM commodities c
       LEFT JOIN commodity_categories cc ON cc.id = c.category_id
       WHERE c.id = $1`,
      [id]
    );
    if (!result.rows[0]) throw new AppError('Commodity not found.', 404, 'NOT_FOUND');
    const r = result.rows[0];
    const item = {
      id: r.id,
      code: r.code,
      name: r.name,
      slug: r.slug,
      category: r.category_code || r.category || null,
      categoryId: r.category_id || null,
      categoryLabel: r.category_name || commodityCategoryLabel(r.category_code || r.category),
      description: r.description || null,
      sortOrder: r.sort_order,
      isActive: r.is_active,
      observationCount: r.observation_count || 0,
      variants: r.variants || [],
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };

    const audits = await getPool()
      .query(
        `SELECT action, reason, previous_state, new_state, created_at
         FROM admin_audit_log
         WHERE entity_type = 'commodity' AND entity_id = $1
         ORDER BY created_at DESC LIMIT 20`,
        [id]
      )
      .catch(() => ({ rows: [] }));

    return {
      commodity: item,
      adminActivity: audits.rows.map((a) => ({
        action: a.action,
        reason: a.reason,
        previousState: a.previous_state,
        newState: a.new_state,
        createdAt: a.created_at,
      })),
    };
  },

  async createCommodity(body, admin, req) {
    const reason = requireReason(body);
    const name = String(body.name || '').trim();
    if (name.length < 2 || name.length > 80) {
      throw new AppError('Commodity name must be 2–80 characters.', 400, 'VALIDATION_ERROR');
    }
    const code = (body.code ? codeify(body.code) : codeify(name)) || null;
    const slug = (body.slug ? slugify(body.slug) : slugify(name)) || null;
    if (!code || !slug) {
      throw new AppError('Invalid commodity code or slug.', 400, 'VALIDATION_ERROR');
    }
    let category = body.category || null;
    if (category && !CATEGORY_IDS.has(category)) {
      throw new AppError('Invalid commodity category.', 400, 'VALIDATION_ERROR');
    }
    const categoryRow = category ? await resolveCategoryId(category) : null;
    const description = body.description
      ? String(body.description).trim().slice(0, 500)
      : null;
    const sortOrder = body.sortOrder != null ? Number(body.sortOrder) : 100;

    try {
      const result = await getPool().query(
        `INSERT INTO commodities (code, name, slug, category, category_id, description, sort_order, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE)
         RETURNING id`,
        [code, name, slug, category, categoryRow?.id || null, description, sortOrder]
      );
      const id = result.rows[0].id;

      if (Array.isArray(body.variants) && body.variants.length) {
        for (const [i, v] of body.variants.entries()) {
          await this._insertVariant(id, v, i);
        }
      }

      await writeAudit(
        admin,
        {
          action: 'commodity.create',
          entityType: 'commodity',
          entityId: id,
          newState: { code, name, slug, category },
          reason,
        },
        req
      );
      return this.getCommodity(id);
    } catch (err) {
      if (err?.code === '23505') {
        throw new AppError('A commodity with this code or slug already exists.', 409, 'CONFLICT');
      }
      throw err;
    }
  },

  async _insertVariant(commodityId, v, index = 0) {
    const code = String(v.code || v.unitCode || `u${index + 1}`).trim().slice(0, 40);
    const label = String(v.label || v.displayName || code).trim().slice(0, 80);
    const unitCode = String(v.unitCode || 'unit').trim().slice(0, 24);
    const displayName = String(v.displayName || label).trim().slice(0, 120);
    const quantity = v.quantity != null && v.quantity !== '' ? Number(v.quantity) : null;
    if (!code || !label || !unitCode) {
      throw new AppError('Variant requires code, label, and unit.', 400, 'VALIDATION_ERROR');
    }
    const unit = await resolveUnitId(unitCode);
    await getPool().query(
      `INSERT INTO commodity_variants (
         commodity_id, code, label, quantity, unit_code, unit_id, display_name, sort_order, is_active
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)`,
      [
        commodityId,
        code,
        label,
        quantity,
        unit?.code || unitCode,
        unit?.id || null,
        displayName,
        v.sortOrder ?? (index + 1) * 10,
      ]
    );
  },

  async updateCommodity(id, body, admin, req) {
    const reason = requireReason(body);
    const prev = await getPool().query(
      `SELECT id, code, name, slug, category, category_id, description, sort_order, is_active
       FROM commodities WHERE id = $1`,
      [id]
    );
    if (!prev.rows[0]) throw new AppError('Commodity not found.', 404, 'NOT_FOUND');
    const row = prev.rows[0];

    const nextName =
      body.name !== undefined ? String(body.name).trim().slice(0, 80) : row.name;
    if (nextName.length < 2) {
      throw new AppError('Commodity name must be 2–80 characters.', 400, 'VALIDATION_ERROR');
    }
    const nextSlug =
      body.slug !== undefined
        ? slugify(body.slug) || row.slug
        : body.name !== undefined
          ? slugify(nextName) || row.slug
          : row.slug;
    const nextCategory =
      body.category !== undefined
        ? body.category === null || body.category === ''
          ? null
          : CATEGORY_IDS.has(body.category)
            ? body.category
            : (() => {
                throw new AppError('Invalid commodity category.', 400, 'VALIDATION_ERROR');
              })()
        : row.category;
    const categoryRow = nextCategory ? await resolveCategoryId(nextCategory) : null;
    const nextCategoryId =
      body.category !== undefined ? categoryRow?.id || null : row.category_id;
    const nextDescription =
      body.description !== undefined
        ? body.description
          ? String(body.description).trim().slice(0, 500)
          : null
        : row.description;
    const nextSort =
      body.sortOrder != null ? Number(body.sortOrder) : row.sort_order;
    const nextActive =
      body.isActive != null ? Boolean(body.isActive) : row.is_active;

    try {
      await getPool().query(
        `UPDATE commodities SET
           name = $2, slug = $3, category = $4, category_id = $5, description = $6,
           sort_order = $7, is_active = $8, updated_at = NOW()
         WHERE id = $1`,
        [
          id,
          nextName,
          nextSlug,
          nextCategory,
          nextCategoryId,
          nextDescription,
          nextSort,
          nextActive,
        ]
      );
    } catch (err) {
      if (err?.code === '23505') {
        throw new AppError('Slug conflict with another commodity.', 409, 'CONFLICT');
      }
      throw err;
    }

    await writeAudit(
      admin,
      {
        action: 'commodity.update',
        entityType: 'commodity',
        entityId: id,
        previousState: {
          name: row.name,
          slug: row.slug,
          category: row.category,
          description: row.description,
          isActive: row.is_active,
        },
        newState: {
          name: nextName,
          slug: nextSlug,
          category: nextCategory,
          categoryId: nextCategoryId,
          description: nextDescription,
          isActive: nextActive,
        },
        reason,
      },
      req
    );
    return this.getCommodity(id);
  },

  async setCommodityActive(id, { isActive, reason }, admin, req) {
    return this.updateCommodity(
      id,
      { isActive, reason: reason || 'Commodity status updated' },
      admin,
      req
    );
  },

  async createVariant(commodityId, body, admin, req) {
    const reason = requireReason(body);
    const exists = await getPool().query(`SELECT id FROM commodities WHERE id = $1`, [
      commodityId,
    ]);
    if (!exists.rows[0]) throw new AppError('Commodity not found.', 404, 'NOT_FOUND');
    await this._insertVariant(commodityId, body, 0);
    const created = await getPool().query(
      `SELECT id FROM commodity_variants
       WHERE commodity_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [commodityId]
    );
    await writeAudit(
      admin,
      {
        action: 'commodity_variant.create',
        entityType: 'commodity_variant',
        entityId: created.rows[0].id,
        newState: { commodityId, code: body.code, unitCode: body.unitCode },
        reason,
      },
      req
    );
    return this.getCommodity(commodityId);
  },

  async updateVariant(variantId, body, admin, req) {
    const reason = requireReason(body);
    const prev = await getPool().query(
      `SELECT id, commodity_id, code, label, quantity, unit_code, unit_id, display_name, sort_order, is_active
       FROM commodity_variants WHERE id = $1`,
      [variantId]
    );
    if (!prev.rows[0]) throw new AppError('Variant not found.', 404, 'NOT_FOUND');
    const row = prev.rows[0];
    const nextLabel =
      body.label !== undefined ? String(body.label).trim().slice(0, 80) : row.label;
    const nextUnit =
      body.unitCode !== undefined
        ? String(body.unitCode).trim().slice(0, 24)
        : row.unit_code;
    const unit = body.unitCode !== undefined ? await resolveUnitId(nextUnit) : null;
    const nextUnitId =
      body.unitCode !== undefined ? unit?.id || null : row.unit_id;
    const nextDisplay =
      body.displayName !== undefined
        ? String(body.displayName).trim().slice(0, 120)
        : row.display_name;
    const nextQty =
      body.quantity !== undefined
        ? body.quantity === null || body.quantity === ''
          ? null
          : Number(body.quantity)
        : row.quantity;
    const nextActive =
      body.isActive != null ? Boolean(body.isActive) : row.is_active;

    await getPool().query(
      `UPDATE commodity_variants SET
         label = $2, unit_code = $3, unit_id = $4, display_name = $5, quantity = $6,
         is_active = $7, updated_at = NOW()
       WHERE id = $1`,
      [
        variantId,
        nextLabel,
        unit?.code || nextUnit,
        nextUnitId,
        nextDisplay,
        nextQty,
        nextActive,
      ]
    );

    await writeAudit(
      admin,
      {
        action: 'commodity_variant.update',
        entityType: 'commodity_variant',
        entityId: variantId,
        previousState: {
          label: row.label,
          unitCode: row.unit_code,
          displayName: row.display_name,
          isActive: row.is_active,
        },
        newState: {
          label: nextLabel,
          unitCode: unit?.code || nextUnit,
          unitId: nextUnitId,
          displayName: nextDisplay,
          isActive: nextActive,
        },
        reason,
      },
      req
    );
    return this.getCommodity(row.commodity_id);
  },

  async listObservations({
    q,
    commodityId,
    category,
    stateId,
    lgaId,
    areaId,
    market,
    sourceType,
    status,
    freshness,
    verification,
    from,
    to,
    page = 1,
    limit = 30,
  } = {}) {
    const params = [];
    const where = [`r.status <> 'removed'`];

    if (q) {
      params.push(`%${String(q).trim()}%`);
      const i = params.length;
      where.push(
        `(c.name ILIKE $${i} OR loc.name ILIKE $${i} OR COALESCE(pp.name, cpr.place_label) ILIKE $${i}
          OR r.title ILIKE $${i})`
      );
    }
    if (commodityId) {
      params.push(commodityId);
      where.push(`cpr.commodity_id = $${params.length}`);
    }
    if (category) {
      params.push(category);
      where.push(`(c.category = $${params.length} OR EXISTS (
        SELECT 1 FROM commodity_categories cc
        WHERE cc.id = c.category_id AND cc.code = $${params.length}
      ))`);
    }
    if (stateId) {
      params.push(stateId);
      where.push(`loc.state_id = $${params.length}`);
    }
    if (lgaId) {
      params.push(lgaId);
      where.push(`loc.lga_id = $${params.length}`);
    }
    if (areaId) {
      params.push(areaId);
      where.push(`loc.area_id = $${params.length}`);
    }
    if (market) {
      params.push(`%${String(market).trim()}%`);
      where.push(`COALESCE(pp.name, cpr.place_label) ILIKE $${params.length}`);
    }
    if (sourceType) {
      params.push(sourceType);
      where.push(`r.source_type = $${params.length}::report_source_type`);
    }
    if (status) {
      params.push(status);
      where.push(`r.status = $${params.length}::report_status`);
    }
    if (verification === 'verified') {
      where.push(`(r.status = 'confirmed' OR r.confirmed_accurate_count > 0)`);
    } else if (verification === 'unverified') {
      where.push(`r.status <> 'confirmed' AND COALESCE(r.confirmed_accurate_count,0) = 0`);
    }
    if (freshness === 'expired') {
      where.push(`(r.status = 'expired' OR (r.expires_at IS NOT NULL AND r.expires_at <= NOW()))`);
    } else if (freshness === 'stale') {
      where.push(`r.status = 'stale'`);
    } else if (freshness === 'fresh') {
      where.push(
        `r.status IN ('submitted','active','confirmed') AND (r.expires_at IS NULL OR r.expires_at > NOW())`
      );
    } else if (freshness === 'aging') {
      where.push(
        `r.status IN ('submitted','active','confirmed')
         AND COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at)
             < NOW() - make_interval(mins => GREATEST(COALESCE(p.stale_after_minutes, 720) / 2, 1))
         AND COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at)
             >= NOW() - make_interval(mins => COALESCE(p.stale_after_minutes, 720))`
      );
    }
    if (from) {
      params.push(from);
      where.push(`r.created_at >= $${params.length}::timestamptz`);
    }
    if (to) {
      params.push(to);
      where.push(`r.created_at <= $${params.length}::timestamptz`);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const lim = Math.min(Number(limit) || 30, 100);
    const off = Math.max((Number(page) || 1) - 1, 0) * lim;
    params.push(lim, off);

    const result = await getPool().query(
      `SELECT ${OBS_SELECT} ${OBS_JOINS} ${whereSql}
       ORDER BY COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const count = await getPool().query(
      `SELECT COUNT(*)::int AS total ${OBS_JOINS} ${whereSql}`,
      params.slice(0, -2)
    );

    return {
      items: result.rows.map(mapObservation),
      total: count.rows[0]?.total || 0,
      page: Number(page) || 1,
      limit: lim,
      note: 'Observations are location-specific — not a national average.',
    };
  },

  async getObservation(id) {
    const result = await getPool().query(
      `SELECT ${OBS_SELECT} ${OBS_JOINS} WHERE cpr.id = $1`,
      [id]
    );
    if (!result.rows[0]) throw new AppError('Price observation not found.', 404, 'NOT_FOUND');
    const item = mapObservation(result.rows[0]);

    const [history, audits, related] = await Promise.all([
      getPool().query(
        `SELECT cpr.id, cpr.price_amount, cpr.price_currency, r.source_type, r.status,
                r.occurred_at, r.created_at, r.confirmed_accurate_count,
                cv.display_name, cv.unit_code
         FROM commodity_price_reports cpr
         JOIN reports r ON r.id = cpr.report_id
         JOIN commodity_variants cv ON cv.id = cpr.variant_id
         WHERE cpr.commodity_id = $1
           AND cpr.variant_id = $2
           AND r.location_id = $3
           AND r.status <> 'removed'
         ORDER BY COALESCE(r.occurred_at, r.created_at) ASC
         LIMIT 100`,
        [item.commodity.id, item.variant.id, item.location.id]
      ),
      getPool()
        .query(
          `SELECT action, reason, previous_state, new_state, created_at
           FROM admin_audit_log
           WHERE entity_type = 'commodity_price' AND entity_id = $1
           ORDER BY created_at DESC LIMIT 20`,
          [id]
        )
        .catch(() => ({ rows: [] })),
      getPool().query(
        `SELECT ${OBS_SELECT} ${OBS_JOINS}
         WHERE cpr.commodity_id = $1 AND cpr.variant_id = $2 AND r.location_id = $3
           AND cpr.id <> $4 AND r.status <> 'removed'
           AND r.created_at >= NOW() - INTERVAL '14 days'
         ORDER BY r.created_at DESC LIMIT 10`,
        [item.commodity.id, item.variant.id, item.location.id, id]
      ),
    ]);

    const amounts = history.rows.map((r) => Number(r.price_amount));
    const variation =
      amounts.length >= 2
        ? {
            min: Math.min(...amounts),
            max: Math.max(...amounts),
            count: amounts.length,
            spread: Math.max(...amounts) - Math.min(...amounts),
            label: 'Same commodity · same unit · same location',
          }
        : amounts.length === 1
          ? { min: amounts[0], max: amounts[0], count: 1, spread: 0 }
          : null;

    return {
      item,
      historyPoints: history.rows.map((r) => ({
        id: r.id,
        amount: Number(r.price_amount),
        currency: r.price_currency || 'NGN',
        unit: r.unit_code,
        displayName: r.display_name,
        sourceType: r.source_type,
        status: r.status,
        trustLabel: sourceTypeLabel(r.source_type),
        verification: mapVerificationStatus(r),
        observedAt: r.occurred_at || null,
        submittedAt: r.created_at || null,
        at: r.occurred_at || r.created_at,
      })),
      variation,
      related: related.rows.map(mapObservation),
      adminActivity: audits.rows.map((a) => ({
        action: a.action,
        reason: a.reason,
        previousState: a.previous_state,
        newState: a.new_state,
        createdAt: a.created_at,
      })),
      note: 'Do not present a community observation as an official national price.',
    };
  },

  async updateObservationMeta(id, body, admin, req) {
    const reason = requireReason(body);
    const current = await this.getObservation(id);
    const item = current.item;

    // Metadata only — never rewrite price_amount (preserves historical observation)
    let nextPlaceLabel =
      body.placeLabel !== undefined
        ? body.placeLabel
          ? String(body.placeLabel).trim().slice(0, 160)
          : null
        : item.place?.name || null;
    let nextPlaceId =
      body.placeId !== undefined ? body.placeId || null : item.place?.id || null;
    const nextStatus =
      body.status != null
        ? body.status
        : item.status;

    const allowedStatus = new Set([
      'submitted',
      'active',
      'confirmed',
      'stale',
      'expired',
      'flagged',
      'under_review',
      'removed',
    ]);
    if (!allowedStatus.has(nextStatus)) {
      throw new AppError('Invalid status.', 400, 'VALIDATION_ERROR');
    }

    await getPool().query(
      `UPDATE commodity_price_reports SET
         place_id = $2, place_label = $3, updated_at = NOW()
       WHERE id = $1`,
      [id, nextPlaceId, nextPlaceLabel]
    );

    if (nextStatus !== item.status) {
      await getPool().query(
        `UPDATE reports SET status = $2::report_status, updated_at = NOW() WHERE id = $1`,
        [item.reportId, nextStatus]
      );
    }

    await writeAudit(
      admin,
      {
        action: 'commodity_price.update_meta',
        entityType: 'commodity_price',
        entityId: id,
        previousState: {
          placeId: item.place?.id || null,
          placeLabel: item.place?.name || null,
          status: item.status,
          priceAmount: item.price.amount,
        },
        newState: {
          placeId: nextPlaceId,
          placeLabel: nextPlaceLabel,
          status: nextStatus,
          priceAmount: item.price.amount,
          note: 'Amount unchanged — historical observation preserved',
        },
        reason,
      },
      req
    );

    return this.getObservation(id);
  },

  async listMarkets({ q, stateId, lgaId, active, page = 1, limit = 30 } = {}) {
    const params = [];
    const where = [];
    if (q) {
      params.push(`%${String(q).trim()}%`);
      const i = params.length;
      where.push(
        `(pp.name ILIKE $${i} OR loc.name ILIKE $${i}
          OR EXISTS (
            SELECT 1 FROM price_place_aliases a
            WHERE a.place_id = pp.id AND a.alias ILIKE $${i}
          ))`
      );
    }
    if (stateId) {
      params.push(stateId);
      where.push(`loc.state_id = $${params.length}`);
    }
    if (lgaId) {
      params.push(lgaId);
      where.push(`loc.lga_id = $${params.length}`);
    }
    if (active === true || active === 'true') where.push(`pp.is_active = TRUE`);
    if (active === false || active === 'false') where.push(`pp.is_active = FALSE`);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const lim = Math.min(Number(limit) || 30, 100);
    const off = Math.max((Number(page) || 1) - 1, 0) * lim;
    params.push(lim, off);

    const result = await getPool().query(
      `SELECT pp.id, pp.name, pp.place_type, pp.is_active, pp.location_id, pp.created_at, pp.updated_at,
              loc.name AS location_name, st.name AS state_name, lg.name AS lga_name, ar.name AS area_name,
              (
                SELECT COALESCE(json_agg(json_build_object('id', a.id, 'alias', a.alias) ORDER BY a.alias), '[]'::json)
                FROM price_place_aliases a WHERE a.place_id = pp.id
              ) AS aliases
       FROM price_places pp
       JOIN locations loc ON loc.id = pp.location_id
       LEFT JOIN states st ON st.id = loc.state_id
       LEFT JOIN lgas lg ON lg.id = loc.lga_id
       LEFT JOIN areas ar ON ar.id = loc.area_id
       ${whereSql}
       ORDER BY pp.name ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const count = await getPool().query(
      `SELECT COUNT(*)::int AS total
       FROM price_places pp
       JOIN locations loc ON loc.id = pp.location_id
       ${whereSql}`,
      params.slice(0, -2)
    );

    return {
      items: result.rows.map((r) => ({
        id: r.id,
        name: r.name,
        placeType: r.place_type,
        placeTypeLabel: placeTypeLabel(r.place_type),
        isActive: r.is_active,
        locationId: r.location_id,
        locationName: r.location_name,
        stateName: r.state_name,
        lgaName: r.lga_name,
        areaName: r.area_name,
        aliases: r.aliases || [],
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      total: count.rows[0]?.total || 0,
      page: Number(page) || 1,
      limit: lim,
      placeTypes: this.placeTypes(),
    };
  },

  async createMarket(body, admin, req) {
    const reason = requireReason(body);
    const name = String(body.name || '').trim();
    const locationId = body.locationId;
    if (name.length < 2 || !locationId) {
      throw new AppError('Market name and location are required.', 400, 'VALIDATION_ERROR');
    }
    const placeType =
      body.placeType && PLACE_TYPES.has(body.placeType) ? body.placeType : 'market';

    const loc = await getPool().query(`SELECT id FROM locations WHERE id = $1`, [locationId]);
    if (!loc.rows[0]) throw new AppError('Location not found.', 404, 'NOT_FOUND');

    try {
      const result = await getPool().query(
        `INSERT INTO price_places (location_id, name, place_type, is_active, created_by)
         VALUES ($1,$2,$3,TRUE,$4)
         RETURNING id`,
        [locationId, name, placeType, admin?.userId || admin?.id || null]
      );
      const id = result.rows[0].id;
      await writeAudit(
        admin,
        {
          action: 'price_place.create',
          entityType: 'price_place',
          entityId: id,
          newState: { name, locationId, placeType },
          reason,
        },
        req
      );
      const listed = await this.listMarkets({ page: 1, limit: 1 });
      const markets = await this.listMarkets({ q: name, limit: 20 });
      return { market: markets.items.find((m) => m.id === id) || listed.items[0] };
    } catch (err) {
      if (err?.code === '23505') {
        throw new AppError('An active market with this name already exists here.', 409, 'CONFLICT');
      }
      throw err;
    }
  },

  async updateMarket(id, body, admin, req) {
    const reason = requireReason(body);
    const prev = await getPool().query(
      `SELECT id, name, place_type, is_active, location_id FROM price_places WHERE id = $1`,
      [id]
    );
    if (!prev.rows[0]) throw new AppError('Market not found.', 404, 'NOT_FOUND');
    const row = prev.rows[0];

    const nextName =
      body.name !== undefined ? String(body.name).trim().slice(0, 160) : row.name;
    const nextType =
      body.placeType !== undefined
        ? PLACE_TYPES.has(body.placeType)
          ? body.placeType
          : (() => {
              throw new AppError('Invalid place type.', 400, 'VALIDATION_ERROR');
            })()
        : row.place_type;
    const nextActive =
      body.isActive != null ? Boolean(body.isActive) : row.is_active;
    const nextLocationId =
      body.locationId !== undefined ? body.locationId : row.location_id;

    if (body.locationId) {
      const loc = await getPool().query(`SELECT id FROM locations WHERE id = $1`, [
        nextLocationId,
      ]);
      if (!loc.rows[0]) throw new AppError('Location not found.', 404, 'NOT_FOUND');
    }

    try {
      await getPool().query(
        `UPDATE price_places SET
           name = $2, place_type = $3, is_active = $4, location_id = $5, updated_at = NOW()
         WHERE id = $1`,
        [id, nextName, nextType, nextActive, nextLocationId]
      );
    } catch (err) {
      if (err?.code === '23505') {
        throw new AppError('Market name conflict at this location.', 409, 'CONFLICT');
      }
      throw err;
    }

    await writeAudit(
      admin,
      {
        action: 'price_place.update',
        entityType: 'price_place',
        entityId: id,
        previousState: {
          name: row.name,
          placeType: row.place_type,
          isActive: row.is_active,
          locationId: row.location_id,
        },
        newState: {
          name: nextName,
          placeType: nextType,
          isActive: nextActive,
          locationId: nextLocationId,
        },
        reason,
      },
      req
    );

    const markets = await this.listMarkets({ limit: 100 });
    return { market: markets.items.find((m) => m.id === id) };
  },

  async addMarketAlias(placeId, body, admin, req) {
    const reason = requireReason(body);
    const alias = String(body.alias || '').trim();
    if (alias.length < 2) {
      throw new AppError('Alias must be at least 2 characters.', 400, 'VALIDATION_ERROR');
    }
    const place = await getPool().query(`SELECT id, name FROM price_places WHERE id = $1`, [
      placeId,
    ]);
    if (!place.rows[0]) throw new AppError('Market not found.', 404, 'NOT_FOUND');

    try {
      const result = await getPool().query(
        `INSERT INTO price_place_aliases (place_id, alias) VALUES ($1,$2) RETURNING id, alias, created_at`,
        [placeId, alias]
      );
      await writeAudit(
        admin,
        {
          action: 'price_place.alias_add',
          entityType: 'price_place',
          entityId: placeId,
          newState: { aliasId: result.rows[0].id, alias },
          reason,
        },
        req
      );
      return {
        id: result.rows[0].id,
        alias: result.rows[0].alias,
        createdAt: result.rows[0].created_at,
      };
    } catch (err) {
      if (err?.code === '23505') {
        throw new AppError('This alias already exists for the market.', 409, 'CONFLICT');
      }
      throw err;
    }
  },

  async removeMarketAlias(placeId, aliasId, body, admin, req) {
    const reason = requireReason(body || { reason: 'Remove alias' });
    const prev = await getPool().query(
      `SELECT id, alias FROM price_place_aliases WHERE id = $1 AND place_id = $2`,
      [aliasId, placeId]
    );
    if (!prev.rows[0]) throw new AppError('Alias not found.', 404, 'NOT_FOUND');
    await getPool().query(`DELETE FROM price_place_aliases WHERE id = $1`, [aliasId]);
    await writeAudit(
      admin,
      {
        action: 'price_place.alias_remove',
        entityType: 'price_place',
        entityId: placeId,
        previousState: { aliasId, alias: prev.rows[0].alias },
        reason,
      },
      req
    );
    return { removed: true };
  },

  async listConflicts({ limit = 40 } = {}) {
    const lim = Math.min(Number(limit) || 40, 100);
    const result = await getPool().query(
      `SELECT cpr.commodity_id, cpr.variant_id, r.location_id,
              MIN(cpr.price_amount)::float AS min_price,
              MAX(cpr.price_amount)::float AS max_price,
              COUNT(*)::int AS observation_count,
              array_agg(cpr.price_amount::float ORDER BY r.created_at DESC) AS amounts,
              MAX(c.name) AS commodity_name,
              MAX(cv.display_name) AS variant_name,
              MAX(cv.unit_code) AS unit_code,
              MAX(loc.name) AS location_name,
              MAX(COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at)) AS most_recent_at
       FROM commodity_price_reports cpr
       JOIN reports r ON r.id = cpr.report_id
       JOIN commodities c ON c.id = cpr.commodity_id
       JOIN commodity_variants cv ON cv.id = cpr.variant_id
       JOIN locations loc ON loc.id = r.location_id
       WHERE r.status IN ('submitted','active','confirmed','stale')
         AND r.created_at >= NOW() - INTERVAL '14 days'
       GROUP BY cpr.commodity_id, cpr.variant_id, r.location_id
       HAVING MAX(cpr.price_amount) - MIN(cpr.price_amount) >= 200
          AND COUNT(*) >= 2
       ORDER BY (MAX(cpr.price_amount) - MIN(cpr.price_amount)) DESC
       LIMIT $1`,
      [lim]
    );

    return {
      items: result.rows.map((r) => ({
        commodityId: r.commodity_id,
        variantId: r.variant_id,
        locationId: r.location_id,
        commodityName: r.commodity_name,
        variantName: r.variant_name,
        unitCode: r.unit_code,
        locationName: r.location_name,
        min: r.min_price,
        max: r.max_price,
        spread: r.max_price - r.min_price,
        observationCount: r.observation_count,
        recentAmounts: (r.amounts || []).slice(0, 8),
        mostRecentAt: r.most_recent_at,
        note: 'Conflict for review — no automatic winning price.',
      })),
      note: 'Same commodity, unit, and location only. Different units are never compared.',
    };
  },

  async listDuplicates({ limit = 40 } = {}) {
    const lim = Math.min(Number(limit) || 40, 100);
    const result = await getPool().query(
      `SELECT cpr.commodity_id, cpr.variant_id, r.location_id, r.user_id,
              COUNT(*)::int AS count,
              array_agg(cpr.id::text ORDER BY r.created_at DESC) AS ids,
              MAX(c.name) AS commodity_name,
              MAX(cv.display_name) AS variant_name,
              MAX(loc.name) AS location_name
       FROM commodity_price_reports cpr
       JOIN reports r ON r.id = cpr.report_id
       JOIN commodities c ON c.id = cpr.commodity_id
       JOIN commodity_variants cv ON cv.id = cpr.variant_id
       JOIN locations loc ON loc.id = r.location_id
       WHERE r.created_at >= NOW() - INTERVAL '6 hours'
         AND r.status <> 'removed'
       GROUP BY cpr.commodity_id, cpr.variant_id, r.location_id, r.user_id
       HAVING COUNT(*) >= 2
       ORDER BY count DESC
       LIMIT $1`,
      [lim]
    );

    return {
      sameReporterSamePlace: result.rows.map((r) => ({
        commodityId: r.commodity_id,
        variantId: r.variant_id,
        locationId: r.location_id,
        commodityName: r.commodity_name,
        variantName: r.variant_name,
        locationName: r.location_name,
        count: r.count,
        ids: r.ids,
      })),
      note: 'Candidates for human review — not auto-deleted.',
    };
  },

  async qualityIssues({ limit = 40 } = {}) {
    const lim = Math.min(Number(limit) || 40, 100);
    const [stale, missingPlace, flagged, unusual, conflicts, dups] = await Promise.all([
      getPool().query(
        `SELECT cpr.id, c.name AS commodity_name, cpr.price_amount, r.status, r.created_at
         ${OBS_JOINS}
         WHERE r.status IN ('stale','expired')
            OR (r.expires_at IS NOT NULL AND r.expires_at <= NOW())
         ORDER BY r.created_at DESC LIMIT $1`,
        [lim]
      ),
      getPool().query(
        `SELECT cpr.id, c.name AS commodity_name, loc.name AS location_name
         ${OBS_JOINS}
         WHERE cpr.place_id IS NULL AND (cpr.place_label IS NULL OR trim(cpr.place_label) = '')
           AND r.status IN ('submitted','active','confirmed')
         ORDER BY r.created_at DESC LIMIT $1`,
        [lim]
      ),
      getPool().query(
        `SELECT cpr.id, c.name AS commodity_name, r.moderation_state, r.status
         ${OBS_JOINS}
         WHERE r.moderation_state IN ('flagged','queued','in_review','escalated')
         ORDER BY r.updated_at DESC LIMIT $1`,
        [lim]
      ),
      getPool().query(
        `SELECT cpr.id, c.name AS commodity_name, cpr.price_amount, cv.display_name, loc.name AS location_name
         ${OBS_JOINS}
         WHERE cpr.price_amount >= 500000
           AND r.status IN ('submitted','active','confirmed')
         ORDER BY cpr.price_amount DESC LIMIT $1`,
        [lim]
      ),
      this.listConflicts({ limit: lim }),
      this.listDuplicates({ limit: lim }),
    ]);

    return {
      staleOrExpired: stale.rows,
      missingMarketContext: missingPlace.rows,
      flagged: flagged.rows,
      unusualHighPrices: unusual.rows,
      conflicts: conflicts.items,
      duplicateCandidates: dups.sameReporterSamePlace,
      counts: {
        staleOrExpired: stale.rows.length,
        missingMarketContext: missingPlace.rows.length,
        flagged: flagged.rows.length,
        unusualHighPrices: unusual.rows.length,
        conflicts: conflicts.items.length,
        duplicates: dups.sameReporterSamePlace.length,
      },
      note: 'Unusual prices are flagged for review, not auto-rejected.',
    };
  },

  async officialSources() {
    const result = await getPool()
      .query(
        `SELECT os.id, os.organization_name, os.short_name, os.status,
                os.verification_status, os.last_attempt_at, os.last_success_at,
                os.last_error_message, os.consecutive_failures, os.ingestion_method, os.notes
         FROM official_sources os
         WHERE os.notes ILIKE '%price%'
            OR os.notes ILIKE '%commodity%'
            OR os.notes ILIKE '%market%'
            OR os.provider_key ILIKE '%price%'
            OR os.organization_name ILIKE '%bureau%'
         ORDER BY os.organization_name ASC
         LIMIT 20`
      )
      .catch(() => ({ rows: [] }));

    return result.rows.map((r) => ({
      id: r.id,
      name: r.short_name || r.organization_name,
      organizationName: r.organization_name,
      status: r.status,
      verificationStatus: r.verification_status,
      ingestionMethod: r.ingestion_method,
      lastAttemptAt: r.last_attempt_at,
      lastSuccessAt: r.last_success_at,
      lastError: r.last_error_message || null,
      consecutiveFailures: r.consecutive_failures || 0,
      note: 'Reference data only — not a national retail price for every market.',
    }));
  },

  async listPriceAnomalies({ limit = 40 } = {}) {
    const lim = Math.min(Number(limit) || 40, 100);
    const result = await getPool().query(
      `WITH peers AS (
         SELECT cpr.variant_id, cpr.pricing_context,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY cpr.price_amount::float) AS median_price,
                COUNT(*)::int AS peer_count
         FROM commodity_price_reports cpr
         JOIN reports r ON r.id = cpr.report_id
         WHERE r.status IN ('submitted','active','confirmed','stale')
           AND cpr.price_amount IS NOT NULL
           AND r.created_at >= NOW() - INTERVAL '14 days'
         GROUP BY cpr.variant_id, cpr.pricing_context
         HAVING COUNT(*) >= 5
       )
       SELECT cpr.id, cpr.price_amount::float AS amount, cpr.pricing_context::text AS pricing_context,
              c.name AS commodity_name, cv.display_name AS variant_name, cv.quantity, cv.unit_code,
              loc.name AS location_name, COALESCE(pp.name, cpr.place_label) AS place_name,
              r.id AS report_id, r.source_type, r.status, r.created_at,
              p.median_price, p.peer_count
       FROM commodity_price_reports cpr
       JOIN peers p ON p.variant_id = cpr.variant_id AND p.pricing_context = cpr.pricing_context
       JOIN commodities c ON c.id = cpr.commodity_id
       JOIN commodity_variants cv ON cv.id = cpr.variant_id
       JOIN reports r ON r.id = cpr.report_id
       JOIN locations loc ON loc.id = r.location_id
       LEFT JOIN price_places pp ON pp.id = cpr.place_id
       WHERE r.status <> 'removed'
         AND cpr.price_amount IS NOT NULL
         AND r.created_at >= NOW() - INTERVAL '14 days'
         AND p.median_price > 0
         AND (
           cpr.price_amount::float >= GREATEST(p.median_price * 1.5, p.median_price + 5000)
           OR cpr.price_amount::float <= GREATEST(p.median_price * 0.45, 1)
           OR cpr.price_amount::float >= 500000
         )
       ORDER BY ABS(cpr.price_amount::float - p.median_price) DESC
       LIMIT $1`,
      [lim]
    );
    return {
      items: result.rows.map((r) => ({
        id: r.id,
        reportId: r.report_id,
        commodityName: r.commodity_name,
        variantName: r.variant_name,
        quantity: r.quantity != null ? Number(r.quantity) : null,
        unitCode: r.unit_code,
        locationName: r.location_name,
        placeName: r.place_name,
        pricingContext: r.pricing_context,
        pricingContextLabel: pricingContextLabel(r.pricing_context),
        amount: Number(r.amount),
        medianPrice: Number(r.median_price),
        peerCount: r.peer_count,
        sourceType: r.source_type,
        status: r.status,
        createdAt: r.created_at,
        flagReason:
          Number(r.amount) >= 500000
            ? 'Above hard review bound'
            : Number(r.amount) > Number(r.median_price)
              ? 'Unusually high vs recent median (same variant + context)'
              : 'Unusually low vs recent median (same variant + context)',
      })),
      note: 'Review signals only — never auto-rejected or deleted. Variants are never mixed.',
    };
  },

  async mergeMarkets(body, admin, req) {
    const survivorId = body.survivorPlaceId || body.survivorMarketId;
    const mergedId = body.mergedPlaceId || body.mergedMarketId;
    if (!survivorId || !mergedId) {
      throw new AppError('survivorPlaceId and mergedPlaceId are required.', 400, 'VALIDATION_ERROR');
    }
    if (survivorId === mergedId) {
      throw new AppError('Cannot merge a market into itself.', 400, 'VALIDATION_ERROR');
    }
    const reason = requireReason(body);
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const places = await client.query(
        `SELECT id, name, is_active FROM price_places WHERE id = ANY($1::uuid[])`,
        [[survivorId, mergedId]]
      );
      if (places.rows.length !== 2) throw new AppError('Market not found.', 404, 'NOT_FOUND');
      const movedReports = await client.query(
        `UPDATE commodity_price_reports SET place_id = $1, updated_at = NOW()
         WHERE place_id = $2`,
        [survivorId, mergedId]
      );
      const aliases = await client.query(
        `UPDATE price_place_aliases SET place_id = $1
         WHERE place_id = $2
           AND NOT EXISTS (
             SELECT 1 FROM price_place_aliases x
             WHERE x.place_id = $1 AND x.normalized_alias = price_place_aliases.normalized_alias
           )
         RETURNING id`,
        [survivorId, mergedId]
      );
      await client.query(`DELETE FROM price_place_aliases WHERE place_id = $1`, [mergedId]);
      await client.query(
        `UPDATE price_places SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
        [mergedId]
      );
      await client.query(
        `INSERT INTO price_place_merges (
           survivor_place_id, merged_place_id, reason, reports_moved, aliases_moved, merged_by
         ) VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          survivorId,
          mergedId,
          reason,
          movedReports.rowCount || 0,
          aliases.rowCount || 0,
          admin?.userId || admin?.id || null,
        ]
      );
      await client.query('COMMIT');
      await writeAudit(
        admin,
        {
          action: 'commodity_market.merge',
          entityType: 'price_place',
          entityId: survivorId,
          previousState: { mergedPlaceId: mergedId },
          newState: {
            reportsMoved: movedReports.rowCount || 0,
            aliasesMoved: aliases.rowCount || 0,
          },
          reason,
        },
        req
      );
      return {
        survivorPlaceId: survivorId,
        mergedPlaceId: mergedId,
        reportsMoved: movedReports.rowCount || 0,
        aliasesMoved: aliases.rowCount || 0,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async compareNearby({
    commodity,
    variant,
    locationId,
    lat,
    lng,
    pricingContext = 'retail',
    radiusKm = 8,
    limit = 20,
  } = {}) {
    if (!commodity || !variant) {
      throw new AppError('commodity and variant are required.', 400, 'VALIDATION_ERROR');
    }
    const pool = getPool();
    const commodityRow = await pool.query(
      `SELECT id, name, slug, code FROM commodities
       WHERE (code = $1 OR slug = $1) AND is_active = TRUE LIMIT 1`,
      [commodity]
    );
    if (!commodityRow.rows[0]) throw new AppError('Commodity not found.', 404, 'COMMODITY_NOT_FOUND');
    const variantRow = await pool.query(
      `SELECT id, code, display_name, quantity, unit_code, unit_id
       FROM commodity_variants
       WHERE commodity_id = $1 AND (code = $2 OR id::text = $2) AND is_active = TRUE
       LIMIT 1`,
      [commodityRow.rows[0].id, variant]
    );
    if (!variantRow.rows[0]) throw new AppError('Variant not found.', 404, 'VARIANT_NOT_FOUND');

    const params = [commodityRow.rows[0].id, variantRow.rows[0].id];
    let locFilter = '';
    let orderSql = `ORDER BY
      CASE WHEN freshness_rank = 'fresh' THEN 0 WHEN freshness_rank = 'aging' THEN 1
           WHEN freshness_rank = 'stale' THEN 2 ELSE 3 END,
      observed_at DESC NULLS LAST,
      amount ASC`;

    if (lat != null && lng != null) {
      params.push(Number(lat), Number(lng), Number(radiusKm) || 8);
      locFilter = `
        AND r.latitude IS NOT NULL AND r.longitude IS NOT NULL
        AND (
          6371 * acos(LEAST(1::float, GREATEST(-1::float,
            cos(radians($${params.length - 2})) * cos(radians(r.latitude))
            * cos(radians(r.longitude) - radians($${params.length - 1}))
            + sin(radians($${params.length - 2})) * sin(radians(r.latitude))
          )))
        ) <= $${params.length}`;
      orderSql = `ORDER BY
        CASE WHEN freshness_rank = 'fresh' THEN 0 WHEN freshness_rank = 'aging' THEN 1
             WHEN freshness_rank = 'stale' THEN 2 ELSE 3 END,
        distance_km ASC NULLS LAST,
        observed_at DESC NULLS LAST`;
    } else if (locationId) {
      params.push(locationId);
      locFilter = ` AND (r.location_id = $${params.length}
        OR loc.area_id = (SELECT area_id FROM locations WHERE id = $${params.length})
        OR loc.lga_id = (SELECT lga_id FROM locations WHERE id = $${params.length}))`;
    } else {
      throw new AppError('locationId or coordinates required.', 400, 'VALIDATION_ERROR');
    }

    if (pricingContext) {
      params.push(pricingContext);
    }
    const contextFilter = pricingContext
      ? ` AND cpr.pricing_context = $${params.length}::commodity_pricing_context`
      : '';

    params.push(Math.min(Number(limit) || 20, 50));

    const result = await pool.query(
      `SELECT * FROM (
         SELECT cpr.id, cpr.price_amount::float AS amount, cpr.price_currency,
                cpr.pricing_context::text AS pricing_context,
                COALESCE(pp.name, cpr.place_label, loc.name) AS place_name,
                pp.place_type, loc.name AS location_name, r.source_type, r.status,
                COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) AS observed_at,
                CASE
                  WHEN r.status = 'expired' OR (r.expires_at IS NOT NULL AND r.expires_at <= NOW()) THEN 'expired'
                  WHEN r.status = 'stale' THEN 'stale'
                  WHEN COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at)
                       < NOW() - make_interval(mins => COALESCE(pol.stale_after_minutes, 720)) THEN 'stale'
                  WHEN COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at)
                       < NOW() - make_interval(mins => GREATEST(COALESCE(pol.stale_after_minutes, 720) / 2, 1)) THEN 'aging'
                  ELSE 'fresh'
                END AS freshness_rank
                ${
                  lat != null && lng != null
                    ? `, (6371 * acos(LEAST(1::float, GREATEST(-1::float,
                        cos(radians($3)) * cos(radians(r.latitude))
                        * cos(radians(r.longitude) - radians($4))
                        + sin(radians($3)) * sin(radians(r.latitude))
                      )))) AS distance_km`
                    : `, NULL::float AS distance_km`
                }
         FROM commodity_price_reports cpr
         JOIN reports r ON r.id = cpr.report_id
         JOIN locations loc ON loc.id = r.location_id
         LEFT JOIN price_places pp ON pp.id = cpr.place_id
         LEFT JOIN category_freshness_policies pol ON pol.category_id = r.category_id
         WHERE cpr.commodity_id = $1
           AND cpr.variant_id = $2
           AND r.status IN ('submitted','active','confirmed','stale')
           ${locFilter}
           ${contextFilter}
       ) x
       WHERE freshness_rank IN ('fresh','aging')
       ${orderSql}
       LIMIT $${params.length}`,
      params
    );

    const v = variantRow.rows[0];
    const items = result.rows.map((r) => ({
      id: r.id,
      placeName: r.place_name,
      placeType: r.place_type,
      placeTypeLabel: r.place_type ? placeTypeLabel(r.place_type) : null,
      locationName: r.location_name,
      amount: Number(r.amount),
      currency: r.price_currency || 'NGN',
      pricingContext: r.pricing_context,
      pricingContextLabel: pricingContextLabel(r.pricing_context),
      sourceType: r.source_type,
      sourceTypeLabel: sourceTypeLabel(r.source_type),
      freshness: r.freshness_rank,
      observedAt: r.observed_at,
      distanceKm: r.distance_km != null ? Number(Number(r.distance_km).toFixed(2)) : null,
      normalized:
        normalizeUnitPrice({
          amount: r.amount,
          quantity: v.quantity,
          unitCode: v.unit_code,
        }) || null,
    }));

    return {
      commodity: {
        id: commodityRow.rows[0].id,
        name: commodityRow.rows[0].name,
        slug: commodityRow.rows[0].slug,
        code: commodityRow.rows[0].code,
      },
      variant: {
        id: v.id,
        code: v.code,
        displayName: v.display_name,
        quantity: v.quantity != null ? Number(v.quantity) : null,
        unitCode: v.unit_code,
      },
      pricingContext: pricingContext || 'retail',
      note: 'Fresh/aging observations only · sorted by freshness then distance — not lowest price alone. Aggregates are not official prices.',
      items,
    };
  },
};

export default commodityAdminService;
