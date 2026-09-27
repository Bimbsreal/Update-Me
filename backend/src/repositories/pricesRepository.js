import { getPool } from '../db/pool.js';
import { historyPeriodMeta, placeTypeLabel, normalizeUnitPrice, pricingContextLabel, priceSourceLabel } from '../config/prices.js';
import {
  buildObservationApiFields,
  freshnessFromObservation,
  mapSourceType,
  sourceTypeLabel,
} from '../utils/priceObservationModel.js';

function computeTrustLabels(row) {
  const labels = [];
  const source = mapSourceType(row.source_type);
  if (source === 'official') labels.push('Official / reference');
  else if (source === 'market_reference') labels.push('Market / institutional reference');
  else labels.push('Community report');
  const obs = buildObservationApiFields(row);
  if (obs.verification === 'verified') labels.push('Verified');
  if (obs.freshness === 'stale') labels.push('Stale');
  if (obs.freshness === 'expired') labels.push('Expired');
  if (obs.freshness === 'expired') labels.push('Historical');
  return [...new Set(labels)];
}

function computeFreshnessLabel(row, now = new Date()) {
  return freshnessFromObservation(row, now, row.stale_after_minutes || 720);
}

function mapCommodity(row) {
  if (!row) return null;
  return {
    id: row.commodity_id || row.id,
    code: row.commodity_code || row.code,
    name: row.commodity_name || row.name,
    slug: row.commodity_slug || row.slug,
    categoryId: row.category_id || row.commodity_category_id || null,
    category:
      row.category_name || row.commodity_category_name
        ? {
            id: row.category_id || row.commodity_category_id,
            code: row.category_code || row.commodity_category_code,
            name: row.category_name || row.commodity_category_name,
            slug: row.category_slug || row.commodity_category_slug,
          }
        : null,
    sortOrder: row.commodity_sort_order ?? row.sort_order,
    isActive: row.commodity_is_active !== false && row.is_active !== false,
    variants: row.variants || undefined,
  };
}

function mapVariant(row) {
  if (!row) return null;
  return {
    id: row.variant_id || row.id,
    code: row.variant_code || row.code,
    label: row.variant_label || row.label,
    quantity: row.quantity != null ? Number(row.quantity) : null,
    unitCode: row.unit_code,
    unitId: row.unit_id || row.price_unit_id || null,
    unit: row.price_unit_code
      ? {
          id: row.unit_id || row.price_unit_id,
          code: row.price_unit_code,
          name: row.price_unit_name,
          symbol: row.price_unit_symbol,
          unitType: row.price_unit_type,
        }
      : {
          code: row.unit_code,
          name: row.unit_code,
          symbol: row.unit_code,
        },
    displayName: row.display_name || row.variant_display_name,
    sortOrder: row.variant_sort_order ?? row.sort_order,
    commodityId: row.commodity_id,
  };
}

function mapPriceReport(row) {
  if (!row) return null;
  const freshness = computeFreshnessLabel(row);
  const obsFields = buildObservationApiFields(row, { includeReporter: false });
  return {
    id: row.price_id,
    reportId: row.report_id,
    commodity: mapCommodity(row),
    variant: mapVariant(row),
    price: {
      amount: Number(row.price_amount),
      currency: row.price_currency || 'NGN',
      unit: mapVariant(row)?.unit || null,
      displayName: mapVariant(row)?.displayName || null,
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
    place: row.place_id || row.place_label
      ? {
          id: row.place_id || null,
          name: row.place_name || row.place_label || null,
          type: row.place_type || null,
          typeLabel: row.place_type ? placeTypeLabel(row.place_type) : null,
        }
      : null,
    location: {
      id: row.location_id,
      name: row.location_name,
      type: row.location_type,
      slug: row.location_slug,
      subtitle: row.location_subtitle,
      state: row.state_name
        ? { id: row.state_id, name: row.state_name, code: row.state_code }
        : null,
      lga: row.lga_name ? { id: row.lga_id, name: row.lga_name } : null,
      area: row.area_name ? { id: row.area_id, name: row.area_name } : null,
    },
    coordinates:
      row.latitude != null && row.longitude != null
        ? { lat: Number(row.latitude), lng: Number(row.longitude) }
        : null,
    distanceKm:
      row.distance_km != null ? Number(Number(row.distance_km).toFixed(2)) : undefined,
    ...obsFields,
    report: {
      id: row.report_id,
      title: row.title,
      description: row.description,
      sourceType: row.source_type,
      sourceTypeMapped: mapSourceType(row.source_type),
      sourceTypeLabel: sourceTypeLabel(row.source_type),
      status: row.status,
      moderationState: row.moderation_state,
      freshness,
      verification: obsFields.verification,
      moderation: obsFields.moderation,
      trustLabels: computeTrustLabels(row),
      observedAt: obsFields.observedAt,
      submittedAt: obsFields.submittedAt,
      occurredAt: row.occurred_at,
      expiresAt: row.expires_at,
      lastConfirmedAt: row.last_confirmed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      confirmation: {
        stillAccurate: Number(row.confirmed_accurate_count || 0),
        noLongerAccurate: Number(row.confirmed_inaccurate_count || 0),
      },
      // Public: no private reporter fields
      author: undefined,
    },
    createdAt: row.price_created_at || row.created_at,
  };
}

function buildRange(min, max, count, mostRecentAt, freshness) {
  if (min == null) return null;
  const lo = Number(min);
  const hi = Number(max);
  return {
    currency: 'NGN',
    min: lo,
    max: hi,
    isRange: lo !== hi,
    reportCount: count,
    mostRecentAt,
    freshness: freshness || 'fresh',
  };
}

function freshnessClause(freshness) {
  if (freshness === 'expired' || freshness === 'historical') {
    return `(r.status = 'expired' OR (r.expires_at IS NOT NULL AND r.expires_at <= NOW()))`;
  }
  if (freshness === 'stale') return `r.status = 'stale'`;
  if (freshness === 'fresh') {
    return `r.status IN ('submitted','active','confirmed') AND (r.expires_at IS NULL OR r.expires_at > NOW())`;
  }
  return `r.status <> 'removed'`;
}

const priceSelect = `
  cpr.id AS price_id,
  cpr.report_id,
  cpr.price_amount,
  cpr.price_currency,
  cpr.place_label,
  cpr.source_reference,
  cpr.pricing_context::text AS pricing_context,
  cpr.published_at,
  cpr.effective_at,
  cpr.created_at AS price_created_at,
  c.id AS commodity_id,
  c.code AS commodity_code,
  c.name AS commodity_name,
  c.slug AS commodity_slug,
  c.category_id,
  cc.code AS category_code,
  cc.name AS category_name,
  cc.slug AS category_slug,
  cv.id AS variant_id,
  cv.code AS variant_code,
  cv.label AS variant_label,
  cv.quantity,
  cv.unit_code,
  cv.unit_id,
  cv.display_name AS variant_display_name,
  pu.code AS price_unit_code,
  pu.name AS price_unit_name,
  pu.symbol AS price_unit_symbol,
  pu.unit_type AS price_unit_type,
  pp.id AS place_id,
  COALESCE(pp.name, cpr.place_label) AS place_name,
  pp.place_type,
  r.user_id,
  r.location_id,
  r.title,
  r.description,
  r.source_type,
  r.status,
  r.moderation_state,
  r.latitude,
  r.longitude,
  r.occurred_at,
  r.expires_at,
  r.last_confirmed_at,
  r.confirmed_accurate_count,
  r.confirmed_inaccurate_count,
  r.created_at,
  r.updated_at,
  loc.name AS location_name,
  loc.type AS location_type,
  loc.slug AS location_slug,
  loc.state_id,
  loc.lga_id,
  loc.area_id,
  st.name AS state_name,
  st.code AS state_code,
  lg.name AS lga_name,
  ar.name AS area_name,
  u.display_name AS author_display_name,
  p.stale_after_minutes,
  CASE
    WHEN loc.type = 'area' THEN
      CONCAT_WS(' · ',
        CASE WHEN lg.name IS NOT NULL THEN lg.name || ' LGA' END,
        CASE
          WHEN st.code = 'FC' THEN st.name
          WHEN st.name IS NOT NULL THEN st.name || ' State'
        END
      )
    WHEN loc.type = 'lga' THEN
      CASE
        WHEN st.code = 'FC' THEN st.name
        WHEN st.name IS NOT NULL THEN st.name || ' State'
      END
    ELSE st.name
  END AS location_subtitle
`;

const priceJoins = `
  FROM commodity_price_reports cpr
  JOIN commodities c ON c.id = cpr.commodity_id
  LEFT JOIN commodity_categories cc ON cc.id = c.category_id
  JOIN commodity_variants cv ON cv.id = cpr.variant_id
  LEFT JOIN price_units pu ON pu.id = cv.unit_id
  JOIN reports r ON r.id = cpr.report_id
  JOIN report_categories rc ON rc.id = r.category_id AND rc.code = 'prices'
  JOIN locations loc ON loc.id = r.location_id
  LEFT JOIN price_places pp ON pp.id = cpr.place_id
  LEFT JOIN states st ON st.id = loc.state_id
  LEFT JOIN lgas lg ON lg.id = loc.lga_id
  LEFT JOIN areas ar ON ar.id = loc.area_id
  JOIN users u ON u.id = r.user_id
  LEFT JOIN category_freshness_policies p ON p.category_id = r.category_id
`;

export const pricesRepository = {
  mapCommodity,
  mapVariant,
  mapPriceReport,
  buildRange,

  async listCommodities({ activeOnly = true } = {}) {
    const result = await getPool().query(
      `SELECT c.id, c.code, c.name, c.slug, c.sort_order, c.is_active,
              c.category_id, cc.code AS category_code, cc.name AS category_name, cc.slug AS category_slug
       FROM commodities c
       LEFT JOIN commodity_categories cc ON cc.id = c.category_id
       ${activeOnly ? 'WHERE c.is_active = TRUE' : ''}
       ORDER BY c.sort_order ASC, c.name ASC`
    );
    const commodities = result.rows.map(mapCommodity);
    const variants = await getPool().query(
      `SELECT cv.id, cv.commodity_id, cv.code, cv.label, cv.quantity, cv.unit_code, cv.unit_id,
              cv.display_name, cv.sort_order, cv.is_active,
              pu.code AS price_unit_code, pu.name AS price_unit_name,
              pu.symbol AS price_unit_symbol, pu.unit_type AS price_unit_type
       FROM commodity_variants cv
       LEFT JOIN price_units pu ON pu.id = cv.unit_id
       ${activeOnly ? 'WHERE cv.is_active = TRUE' : ''}
       ORDER BY cv.sort_order ASC, cv.display_name ASC`
    );
    const byCommodity = new Map();
    for (const row of variants.rows) {
      if (!byCommodity.has(row.commodity_id)) byCommodity.set(row.commodity_id, []);
      byCommodity.get(row.commodity_id).push(mapVariant(row));
    }
    return commodities.map((c) => ({
      ...c,
      variants: byCommodity.get(c.id) || [],
    }));
  },

  async findCommodityByCodeOrSlug(value) {
    const result = await getPool().query(
      `SELECT c.id, c.code, c.name, c.slug, c.sort_order, c.is_active,
              c.category_id, cc.code AS category_code, cc.name AS category_name, cc.slug AS category_slug
       FROM commodities c
       LEFT JOIN commodity_categories cc ON cc.id = c.category_id
       WHERE lower(c.code) = lower($1) OR lower(c.slug) = lower($1)
       LIMIT 1`,
      [value]
    );
    return mapCommodity(result.rows[0]);
  },

  async findCommodityById(id) {
    const result = await getPool().query(
      `SELECT c.id, c.code, c.name, c.slug, c.sort_order, c.is_active,
              c.category_id, cc.code AS category_code, cc.name AS category_name, cc.slug AS category_slug
       FROM commodities c
       LEFT JOIN commodity_categories cc ON cc.id = c.category_id
       WHERE c.id = $1`,
      [id]
    );
    return mapCommodity(result.rows[0]);
  },

  async findVariant({ commodityId, variantId, variantCode }) {
    const variantSelect = `
      SELECT cv.id, cv.commodity_id, cv.code, cv.label, cv.quantity, cv.unit_code, cv.unit_id,
             cv.display_name, cv.sort_order, cv.is_active,
             pu.code AS price_unit_code, pu.name AS price_unit_name,
             pu.symbol AS price_unit_symbol, pu.unit_type AS price_unit_type
      FROM commodity_variants cv
      LEFT JOIN price_units pu ON pu.id = cv.unit_id`;
    if (variantId) {
      const result = await getPool().query(`${variantSelect} WHERE cv.id = $1`, [variantId]);
      return mapVariant(result.rows[0]);
    }
    const result = await getPool().query(
      `${variantSelect}
       WHERE cv.commodity_id = $1 AND (lower(cv.code) = lower($2) OR lower(cv.display_name) = lower($2))
         AND cv.is_active = TRUE
       LIMIT 1`,
      [commodityId, variantCode]
    );
    return mapVariant(result.rows[0]);
  },

  async findOrCreatePlace({ locationId, name, placeType, createdBy }) {
    const existing = await getPool().query(
      `SELECT id FROM price_places
       WHERE location_id = $1 AND lower(trim(name)) = lower(trim($2)) AND is_active = TRUE
       LIMIT 1`,
      [locationId, name]
    );
    if (existing.rows[0]) return existing.rows[0].id;
    const created = await getPool().query(
      `INSERT INTO price_places (location_id, name, place_type, created_by)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [locationId, name.trim(), placeType || 'market', createdBy || null]
    );
    return created.rows[0].id;
  },

  async createPriceReport(fields) {
    const result = await getPool().query(
      `INSERT INTO commodity_price_reports (
         report_id, commodity_id, variant_id, place_id, place_label,
         price_amount, price_currency, source_reference, pricing_context,
         published_at, effective_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::commodity_pricing_context,$10,$11)
       RETURNING id`,
      [
        fields.reportId,
        fields.commodityId,
        fields.variantId,
        fields.placeId || null,
        fields.placeLabel?.trim() || null,
        fields.priceAmount,
        fields.priceCurrency || 'NGN',
        fields.sourceReference?.trim() || null,
        fields.pricingContext || 'retail',
        fields.publishedAt || null,
        fields.effectiveAt || null,
      ]
    );
    return this.findPriceById(result.rows[0].id);
  },

  async findPriceById(id) {
    const result = await getPool().query(
      `SELECT ${priceSelect} ${priceJoins} WHERE cpr.id = $1`,
      [id]
    );
    return mapPriceReport(result.rows[0]);
  },

  async findRawPriceById(id) {
    const result = await getPool().query(
      `SELECT id, report_id FROM commodity_price_reports WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  async findRecentDuplicate({ userId, variantId, locationId, withinMinutes = 120 }) {
    const result = await getPool().query(
      `SELECT cpr.id
       FROM commodity_price_reports cpr
       JOIN reports r ON r.id = cpr.report_id
       WHERE r.user_id = $1
         AND cpr.variant_id = $2
         AND r.location_id = $3
         AND r.status <> 'removed'
         AND r.created_at >= NOW() - ($4::text || ' minutes')::interval
       ORDER BY r.created_at DESC
       LIMIT 1`,
      [userId, variantId, locationId, withinMinutes]
    );
    return result.rows[0] || null;
  },

  async listReports({
    commodityId = null,
    commodity = null,
    variantId = null,
    variant = null,
    locationId = null,
    freshness = 'fresh',
    q = null,
    page = 1,
    limit = 20,
  } = {}) {
    const where = [`r.visibility = 'public'`, freshnessClause(freshness)];
    const params = [];

    if (commodityId) {
      params.push(commodityId);
      where.push(`cpr.commodity_id = $${params.length}`);
    } else if (commodity) {
      params.push(commodity);
      where.push(`(lower(c.code) = lower($${params.length}) OR lower(c.slug) = lower($${params.length}))`);
    }
    if (variantId) {
      params.push(variantId);
      where.push(`cpr.variant_id = $${params.length}`);
    } else if (variant) {
      params.push(variant);
      where.push(`(lower(cv.code) = lower($${params.length}) OR lower(cv.display_name) = lower($${params.length}))`);
    }
    if (locationId) {
      params.push(locationId);
      where.push(`r.location_id = $${params.length}`);
    }
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      where.push(
        `(lower(c.name) LIKE $${params.length} OR lower(cv.display_name) LIKE $${params.length} OR lower(COALESCE(cpr.place_label,'')) LIKE $${params.length})`
      );
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const countResult = await getPool().query(
      `SELECT COUNT(*)::int AS total ${priceJoins} ${whereSql}`,
      params
    );
    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const result = await getPool().query(
      `SELECT ${priceSelect} ${priceJoins} ${whereSql}
       ORDER BY COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return {
      items: result.rows.map(mapPriceReport),
      page,
      limit,
      total: countResult.rows[0].total,
    };
  },

  async listVariantSummaries({
    commodityId = null,
    commodity = null,
    variantId = null,
    variant = null,
    locationId = null,
    freshness = 'fresh',
    q = null,
    page = 1,
    limit = 20,
  } = {}) {
    const where = [`r.visibility = 'public'`, freshnessClause(freshness), `c.is_active = TRUE`, `cv.is_active = TRUE`];
    const params = [];
    if (commodityId) {
      params.push(commodityId);
      where.push(`cpr.commodity_id = $${params.length}`);
    } else if (commodity) {
      params.push(commodity);
      where.push(`(lower(c.code) = lower($${params.length}) OR lower(c.slug) = lower($${params.length}))`);
    }
    if (variantId) {
      params.push(variantId);
      where.push(`cpr.variant_id = $${params.length}`);
    } else if (variant) {
      params.push(variant);
      where.push(`(lower(cv.code) = lower($${params.length}) OR lower(cv.display_name) = lower($${params.length}))`);
    }
    if (locationId) {
      params.push(locationId);
      where.push(`r.location_id = $${params.length}`);
    }
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      where.push(`(lower(c.name) LIKE $${params.length} OR lower(cv.display_name) LIKE $${params.length})`);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const grouped = await getPool().query(
      `SELECT
         c.id AS commodity_id,
         c.code AS commodity_code,
         c.name AS commodity_name,
         c.slug AS commodity_slug,
         cv.id AS variant_id,
         cv.code AS variant_code,
         cv.label AS variant_label,
         cv.quantity,
         cv.unit_code,
         cv.display_name AS variant_display_name,
         MIN(cpr.price_amount)::float AS min_price,
         MAX(cpr.price_amount)::float AS max_price,
         COUNT(*)::int AS report_count,
         MAX(COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at)) AS most_recent_at,
         (ARRAY_AGG(r.location_id ORDER BY COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) DESC))[1] AS location_id,
         (ARRAY_AGG(loc.name ORDER BY COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) DESC))[1] AS location_name,
         (ARRAY_AGG(COALESCE(pp.name, cpr.place_label) ORDER BY COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) DESC)
           FILTER (WHERE COALESCE(pp.name, cpr.place_label) IS NOT NULL))[1] AS place_name,
         (ARRAY_AGG(r.source_type ORDER BY COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) DESC))[1] AS latest_source_type,
         (ARRAY_AGG(cpr.pricing_context::text ORDER BY COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) DESC))[1] AS latest_pricing_context
       ${priceJoins}
       ${whereSql}
       GROUP BY c.id, c.code, c.name, c.slug, cv.id, cv.code, cv.label, cv.quantity, cv.unit_code, cv.display_name
       ORDER BY most_recent_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, (page - 1) * limit]
    );

    const countResult = await getPool().query(
      `SELECT COUNT(*)::int AS total FROM (
         SELECT cpr.variant_id
         ${priceJoins}
         ${whereSql}
         GROUP BY cpr.variant_id
       ) t`,
      params
    );

    const items = grouped.rows.map((row) => ({
      commodity: mapCommodity(row),
      variant: mapVariant(row),
      priceRange: buildRange(
        row.min_price,
        row.max_price,
        row.report_count,
        row.most_recent_at,
        freshness
      ),
      location: row.location_id
        ? { id: row.location_id, name: row.location_name }
        : null,
      placeName: row.place_name || null,
      reportCount: row.report_count,
      mostRecentAt: row.most_recent_at,
      sourceType: row.latest_source_type || 'community',
      pricingContext: row.latest_pricing_context || 'retail',
      sourceLabel: priceSourceLabel(row.latest_source_type, {
        pricingContext: row.latest_pricing_context,
      }),
    }));

    return {
      items,
      page,
      limit,
      total: countResult.rows[0].total,
    };
  },

  async nearby({
    lat,
    lng,
    radiusKm = 15,
    commodity = null,
    freshness = 'fresh',
    limit = 20,
  }) {
    const params = [lat, lng, radiusKm];
    let commodityClause = '';
    if (commodity) {
      params.push(commodity);
      commodityClause = `AND (lower(c.code) = lower($${params.length}) OR lower(c.slug) = lower($${params.length}))`;
    }
    params.push(limit);
    const limitIdx = params.length;
    const radiusIdx = 3;

    const result = await getPool().query(
      `SELECT ${priceSelect},
         (
           6371 * acos(
             LEAST(1.0, GREATEST(-1.0,
               cos(radians($1)) * cos(radians(r.latitude))
               * cos(radians(r.longitude) - radians($2))
               + sin(radians($1)) * sin(radians(r.latitude))
             ))
           )
         ) AS distance_km
       ${priceJoins}
       WHERE r.visibility = 'public'
         AND r.latitude IS NOT NULL AND r.longitude IS NOT NULL
         AND ${freshnessClause(freshness)}
         ${commodityClause}
         AND (
           6371 * acos(
             LEAST(1.0, GREATEST(-1.0,
               cos(radians($1)) * cos(radians(r.latitude))
               * cos(radians(r.longitude) - radians($2))
               + sin(radians($1)) * sin(radians(r.latitude))
             ))
           )
         ) <= $${radiusIdx}
       ORDER BY distance_km ASC
       LIMIT $${limitIdx}`,
      params
    );
    return result.rows.map(mapPriceReport);
  },

  async history({ commodityId, variantId, locationId = null, period = '30d' }) {
    const meta = historyPeriodMeta(period);
    const params = [commodityId, variantId, meta.days];
    const locationClause = locationId
      ? `AND r.location_id = $${params.push(locationId)}`
      : '';

    const result = await getPool().query(
      `SELECT
         date_trunc('day', COALESCE(r.occurred_at, r.created_at))::date AS day,
         AVG(cpr.price_amount)::float AS avg_amount,
         MIN(cpr.price_amount)::float AS min_amount,
         MAX(cpr.price_amount)::float AS max_amount,
         COUNT(*)::int AS observations
       FROM commodity_price_reports cpr
       JOIN reports r ON r.id = cpr.report_id
       WHERE cpr.commodity_id = $1
         AND cpr.variant_id = $2
         AND r.status <> 'removed'
         AND r.visibility = 'public'
         AND COALESCE(r.occurred_at, r.created_at) >= NOW() - ($3::text || ' days')::interval
         ${locationClause}
       GROUP BY 1
       ORDER BY 1 ASC`,
      params
    );

    const points = result.rows.map((row) => {
      const day = row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day).slice(0, 10);
      return {
        date: day,
        rate: Number(row.avg_amount),
        min: Number(row.min_amount),
        max: Number(row.max_amount),
        observations: row.observations,
      };
    });

    const chartAvailable = points.length >= 2;
    const amounts = points.flatMap((p) => [p.min, p.max]);
    return {
      period: meta.id,
      days: meta.days,
      chartAvailable,
      message: chartAvailable
        ? null
        : 'Not enough historical data yet.',
      points,
      range: amounts.length
        ? buildRange(Math.min(...amounts), Math.max(...amounts), points.reduce((s, p) => s + p.observations, 0), points.at(-1)?.date, 'historical')
        : null,
    };
  },

  async summary({ locationId = null, commodity = null, hours = 24 } = {}) {
    const params = [];
    const filters = [
      `r.visibility = 'public'`,
      `r.status IN ('submitted','active','confirmed')`,
      `(r.expires_at IS NULL OR r.expires_at > NOW())`,
    ];
    if (locationId) {
      params.push(locationId);
      filters.push(`r.location_id = $${params.length}`);
    }
    if (commodity) {
      params.push(commodity);
      filters.push(
        `(lower(c.code) = lower($${params.length}) OR lower(c.slug) = lower($${params.length}))`
      );
    }
    const windowHours = Math.min(Math.max(Number(hours) || 24, 1), 168);
    params.push(windowHours);
    const hoursParam = params.length;

    const result = await getPool().query(
      `SELECT COUNT(*)::int AS total,
              COUNT(DISTINCT cpr.commodity_id)::int AS commodities,
              COUNT(DISTINCT cpr.variant_id)::int AS variants,
              MIN(cpr.price_amount) FILTER (
                WHERE cpr.price_amount IS NOT NULL
                  AND cpr.pricing_context IN ('retail','market','supermarket','local_seller')
                  AND COALESCE(r.occurred_at, r.created_at) >= NOW() - make_interval(hours => $${hoursParam})
              ) AS min_price,
              MAX(cpr.price_amount) FILTER (
                WHERE cpr.price_amount IS NOT NULL
                  AND cpr.pricing_context IN ('retail','market','supermarket','local_seller')
                  AND COALESCE(r.occurred_at, r.created_at) >= NOW() - make_interval(hours => $${hoursParam})
              ) AS max_price,
              COUNT(*) FILTER (
                WHERE cpr.price_amount IS NOT NULL
                  AND cpr.pricing_context IN ('retail','market','supermarket','local_seller')
                  AND COALESCE(r.occurred_at, r.created_at) >= NOW() - make_interval(hours => $${hoursParam})
              )::int AS range_observations,
              PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cpr.price_amount) FILTER (
                WHERE cpr.price_amount IS NOT NULL
                  AND cpr.pricing_context IN ('retail','market','supermarket','local_seller')
                  AND COALESCE(r.occurred_at, r.created_at) >= NOW() - make_interval(hours => $${hoursParam})
              ) AS median_price
       FROM commodity_price_reports cpr
       JOIN reports r ON r.id = cpr.report_id
       JOIN commodities c ON c.id = cpr.commodity_id
       WHERE ${filters.join(' AND ')}`,
      params
    );
    const row = result.rows[0] || {};
    const minP = row.min_price != null ? Number(row.min_price) : null;
    const maxP = row.max_price != null ? Number(row.max_price) : null;
    const medianP = row.median_price != null ? Number(row.median_price) : null;
    return {
      total: row.total || 0,
      commodities: row.commodities || 0,
      variants: row.variants || 0,
      observedRange:
        minP != null && maxP != null
          ? {
              min: minP,
              max: maxP,
              median: medianP,
              currency: 'NGN',
              observationCount: row.range_observations || 0,
              windowHours,
              commodity: commodity || null,
              note: `Based on ${row.range_observations || 0} retail/market observations in the last ${windowHours} hours. Not a claim of every seller in the area.`,
            }
          : null,
      asOf: new Date().toISOString(),
    };
  },
};
