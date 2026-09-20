import { getPool } from '../db/pool.js';
import {
  buildAboutLines,
  buildQualityMetadata,
  computeTrustLabels,
} from '../services/dataQualityService.js';

function mapReport(row) {
  if (!row) return null;
  const quality = row.quality || buildQualityMetadata(row, {
    fresh_within_minutes: row.fresh_within_minutes,
    recent_within_minutes: row.recent_within_minutes,
    stale_after_minutes: row.stale_after_minutes,
    default_ttl_minutes: row.default_ttl_minutes,
  });
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: {
      id: row.category_id,
      code: row.category_code,
      name: row.category_name,
    },
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
    sourceType: row.source_type,
    status: row.status,
    visibility: row.visibility,
    moderationState: row.moderation_state,
    coordinates:
      row.latitude != null && row.longitude != null
        ? { lat: Number(row.latitude), lng: Number(row.longitude) }
        : null,
    occurredAt: row.occurred_at,
    expiresAt: row.expires_at,
    lastConfirmedAt: row.last_confirmed_at,
    confirmation: {
      stillAccurate: Number(row.confirmed_accurate_count || 0),
      noLongerAccurate: Number(row.confirmed_inaccurate_count || 0),
    },
    flagCount: Number(row.flag_count || 0),
    eventGroupId: row.event_group_id,
    metadata: row.metadata || {},
    author: {
      id: row.user_id,
      displayName: row.author_display_name || null,
    },
    freshness: row.freshness_label || quality.freshness?.state || null,
    trustLabels: row.trust_labels || [],
    quality,
    about: row.about_lines || buildAboutLines(quality),
    corroborationCount: Number(row.corroboration_count || quality.corroboration?.count || 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    distanceKm:
      row.distance_km != null ? Number(Number(row.distance_km).toFixed(2)) : undefined,
  };
}

const selectColumns = `
  r.id,
  r.user_id,
  r.category_id,
  r.location_id,
  r.event_group_id,
  r.title,
  r.description,
  r.source_type,
  r.status,
  r.visibility,
  r.moderation_state,
  r.latitude,
  r.longitude,
  r.occurred_at,
  r.expires_at,
  r.last_confirmed_at,
  r.confirmed_accurate_count,
  r.confirmed_inaccurate_count,
  r.flag_count,
  r.metadata,
  r.created_at,
  r.updated_at,
  c.code AS category_code,
  c.name AS category_name,
  loc.name AS location_name,
  loc.type AS location_type,
  loc.slug AS location_slug,
  loc.state_id,
  loc.lga_id,
  loc.area_id,
  loc.latitude AS location_latitude,
  loc.longitude AS location_longitude,
  s.name AS state_name,
  s.code AS state_code,
  l.name AS lga_name,
  a.name AS area_name,
  u.display_name AS author_display_name,
  p.stale_after_minutes,
  p.default_ttl_minutes,
  p.fresh_within_minutes,
  p.recent_within_minutes,
  p.corroboration_window_minutes,
  r.corroboration_count,
  r.quality_updated_at,
  CASE
    WHEN loc.type = 'area' THEN
      CONCAT_WS(' · ',
        CASE WHEN l.name IS NOT NULL THEN l.name || ' LGA' END,
        CASE
          WHEN s.code = 'FC' THEN s.name
          WHEN s.name IS NOT NULL THEN s.name || ' State'
        END
      )
    WHEN loc.type = 'lga' THEN
      CASE
        WHEN s.code = 'FC' THEN s.name
        WHEN s.name IS NOT NULL THEN s.name || ' State'
      END
    ELSE s.name
  END AS location_subtitle
`;

const fromJoins = `
  FROM reports r
  JOIN report_categories c ON c.id = r.category_id
  JOIN locations loc ON loc.id = r.location_id
  LEFT JOIN states s ON s.id = loc.state_id
  LEFT JOIN lgas l ON l.id = loc.lga_id
  LEFT JOIN areas a ON a.id = loc.area_id
  JOIN users u ON u.id = r.user_id
  LEFT JOIN category_freshness_policies p ON p.category_id = r.category_id
`;

function decorate(row) {
  if (!row) return null;
  const policy = {
    fresh_within_minutes: row.fresh_within_minutes,
    recent_within_minutes: row.recent_within_minutes,
    stale_after_minutes: row.stale_after_minutes,
    default_ttl_minutes: row.default_ttl_minutes,
  };
  const quality = buildQualityMetadata(row, policy);
  row.freshness_label = quality.freshness.state;
  row.trust_labels = computeTrustLabels(row);
  row.quality = quality;
  row.about_lines = buildAboutLines(quality);
  return mapReport(row);
}

export const reportRepository = {
  mapReport,
  decorate,

  async listCategories() {
    const result = await getPool().query(
      `SELECT c.id, c.code, c.name, c.description, c.sort_order,
              p.default_ttl_minutes, p.stale_after_minutes,
              p.fresh_within_minutes, p.recent_within_minutes,
              p.corroboration_window_minutes
       FROM report_categories c
       LEFT JOIN category_freshness_policies p ON p.category_id = c.id
       WHERE c.is_active = TRUE
       ORDER BY c.sort_order ASC, c.name ASC`
    );
    return result.rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      freshness: {
        defaultTtlMinutes: row.default_ttl_minutes,
        staleAfterMinutes: row.stale_after_minutes,
        freshWithinMinutes: row.fresh_within_minutes,
        recentWithinMinutes: row.recent_within_minutes,
        corroborationWindowMinutes: row.corroboration_window_minutes,
      },
    }));
  },

  async findCategoryByCode(code) {
    const result = await getPool().query(
      `SELECT c.*, p.default_ttl_minutes, p.stale_after_minutes,
              p.fresh_within_minutes, p.recent_within_minutes,
              p.corroboration_window_minutes
       FROM report_categories c
       LEFT JOIN category_freshness_policies p ON p.category_id = c.id
       WHERE c.code = $1 AND c.is_active = TRUE`,
      [code]
    );
    return result.rows[0] || null;
  },

  async findById(id) {
    const result = await getPool().query(
      `SELECT ${selectColumns} ${fromJoins} WHERE r.id = $1`,
      [id]
    );
    return decorate(result.rows[0]);
  },

  async findRawById(id) {
    const result = await getPool().query(`SELECT * FROM reports WHERE id = $1`, [id]);
    return result.rows[0] || null;
  },

  async create(report) {
    const result = await getPool().query(
      `INSERT INTO reports (
         user_id, category_id, location_id, title, description,
         source_type, status, visibility, latitude, longitude,
         occurred_at, expires_at, metadata
       ) VALUES (
         $1,$2,$3,$4,$5,
         $6::report_source_type,$7::report_status,$8::report_visibility,$9,$10,
         $11,$12,$13::jsonb
       )
       RETURNING id`,
      [
        report.userId,
        report.categoryId,
        report.locationId,
        report.title,
        report.description,
        report.sourceType,
        report.status,
        report.visibility,
        report.latitude ?? null,
        report.longitude ?? null,
        report.occurredAt,
        report.expiresAt,
        JSON.stringify(report.metadata || {}),
      ]
    );
    return this.findById(result.rows[0].id);
  },

  async update(id, fields) {
    const sets = [];
    const params = [id];
    const map = {
      title: 'title',
      description: 'description',
      locationId: 'location_id',
      latitude: 'latitude',
      longitude: 'longitude',
      visibility: 'visibility',
      occurredAt: 'occurred_at',
      status: 'status',
      moderationState: 'moderation_state',
      expiresAt: 'expires_at',
      lastConfirmedAt: 'last_confirmed_at',
      confirmedAccurateCount: 'confirmed_accurate_count',
      confirmedInaccurateCount: 'confirmed_inaccurate_count',
      flagCount: 'flag_count',
      metadata: 'metadata',
      eventGroupId: 'event_group_id',
    };

    for (const [key, column] of Object.entries(map)) {
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        params.push(key === 'metadata' ? JSON.stringify(fields[key] || {}) : fields[key]);
        const cast =
          key === 'status'
            ? '::report_status'
            : key === 'moderationState'
              ? '::report_moderation_state'
              : key === 'visibility'
                ? '::report_visibility'
                : key === 'metadata'
                  ? '::jsonb'
                  : '';
        sets.push(`${column} = $${params.length}${cast}`);
      }
    }

    if (!sets.length) return this.findById(id);

    sets.push('updated_at = NOW()');
    await getPool().query(`UPDATE reports SET ${sets.join(', ')} WHERE id = $1`, params);
    return this.findById(id);
  },

  async list({ category, locationId, status, sourceType, freshness, q, page, limit }) {
    const where = [`r.visibility = 'public'`, `r.status <> 'removed'`];
    const params = [];

    if (category) {
      params.push(category);
      where.push(`c.code = $${params.length}`);
    }
    if (locationId) {
      params.push(locationId);
      where.push(`r.location_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`r.status = $${params.length}::report_status`);
    }
    if (sourceType) {
      params.push(sourceType);
      where.push(`r.source_type = $${params.length}::report_source_type`);
    }
    if (q) {
      params.push(`%${q}%`);
      where.push(`(r.title ILIKE $${params.length} OR r.description ILIKE $${params.length})`);
    }
    if (freshness === 'expired') {
      where.push(`(r.status = 'expired' OR (r.expires_at IS NOT NULL AND r.expires_at <= NOW()))`);
    } else if (freshness === 'stale') {
      where.push(`r.status = 'stale'`);
    } else if (freshness === 'aging') {
      where.push(`r.status IN ('submitted','active','confirmed')`);
      where.push(`(r.expires_at IS NULL OR r.expires_at > NOW())`);
      where.push(
        `COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) <= NOW() - make_interval(mins => COALESCE(p.recent_within_minutes, 180))`
      );
      where.push(
        `COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) > NOW() - make_interval(mins => p.stale_after_minutes)`
      );
    } else if (freshness === 'recent') {
      where.push(`r.status IN ('submitted','active','confirmed')`);
      where.push(`(r.expires_at IS NULL OR r.expires_at > NOW())`);
      where.push(
        `COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) <= NOW() - make_interval(mins => COALESCE(p.fresh_within_minutes, 60))`
      );
      where.push(
        `COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) > NOW() - make_interval(mins => COALESCE(p.recent_within_minutes, 180))`
      );
    } else if (freshness === 'fresh') {
      where.push(`r.status IN ('submitted','active','confirmed')`);
      where.push(`(r.expires_at IS NULL OR r.expires_at > NOW())`);
      where.push(
        `COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) > NOW() - make_interval(mins => COALESCE(p.fresh_within_minutes, 60))`
      );
    }

    const offset = (page - 1) * limit;
    params.push(limit, offset);

    const result = await getPool().query(
      `SELECT ${selectColumns}
       ${fromJoins}
       WHERE ${where.join(' AND ')}
       ORDER BY r.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countParams = params.slice(0, -2);
    const countResult = await getPool().query(
      `SELECT COUNT(*)::int AS total
       FROM reports r
       JOIN report_categories c ON c.id = r.category_id
       WHERE ${where.join(' AND ')}`,
      countParams
    );

    return {
      items: result.rows.map(decorate),
      page,
      limit,
      total: countResult.rows[0].total,
    };
  },

  async nearby({ lat, lng, radiusKm, category, limit }) {
    const params = [lat, lng, radiusKm, limit];
    let categoryClause = '';
    if (category) {
      params.push(category);
      categoryClause = `AND c.code = $${params.length}`;
    }

    const result = await getPool().query(
      `SELECT * FROM (
         SELECT ${selectColumns},
           (
             6371 * acos(
               least(1.0, greatest(-1.0,
                 cos(radians($1)) * cos(radians(COALESCE(r.latitude, loc.latitude))) *
                 cos(radians(COALESCE(r.longitude, loc.longitude)) - radians($2)) +
                 sin(radians($1)) * sin(radians(COALESCE(r.latitude, loc.latitude)))
               ))
             )
           ) AS distance_km
         ${fromJoins}
         WHERE r.visibility = 'public'
           AND r.status IN ('submitted','active','confirmed','stale')
           AND COALESCE(r.latitude, loc.latitude) IS NOT NULL
           AND COALESCE(r.longitude, loc.longitude) IS NOT NULL
           ${categoryClause}
       ) nearby
       WHERE nearby.distance_km <= $3
       ORDER BY nearby.distance_km ASC, nearby.created_at DESC
       LIMIT $4`,
      params
    );

    return result.rows.map(decorate);
  },

  async addHistory({ reportId, actorUserId, eventType, previousState, newState, reason }) {
    await getPool().query(
      `INSERT INTO report_history (
         report_id, actor_user_id, event_type, previous_state, new_state, reason
       ) VALUES ($1,$2,$3::report_history_type,$4::jsonb,$5::jsonb,$6)`,
      [
        reportId,
        actorUserId || null,
        eventType,
        previousState ? JSON.stringify(previousState) : null,
        newState ? JSON.stringify(newState) : null,
        reason || null,
      ]
    );
  },

  async listHistory(reportId) {
    const result = await getPool().query(
      `SELECT h.*, u.display_name AS actor_display_name
       FROM report_history h
       LEFT JOIN users u ON u.id = h.actor_user_id
       WHERE h.report_id = $1
       ORDER BY h.created_at ASC`,
      [reportId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      reason: row.reason,
      previousState: row.previous_state,
      newState: row.new_state,
      actor: row.actor_user_id
        ? { id: row.actor_user_id, displayName: row.actor_display_name }
        : null,
      createdAt: row.created_at,
    }));
  },

  async findConfirmation(reportId, userId) {
    const result = await getPool().query(
      `SELECT * FROM report_confirmations WHERE report_id = $1 AND user_id = $2`,
      [reportId, userId]
    );
    return result.rows[0] || null;
  },

  async upsertConfirmation({ reportId, userId, type, note }) {
    const existing = await this.findConfirmation(reportId, userId);
    if (existing && existing.confirmation_type === type) {
      return { ...existing, duplicate: true };
    }

    const result = await getPool().query(
      `INSERT INTO report_confirmations (report_id, user_id, confirmation_type, note)
       VALUES ($1,$2,$3::confirmation_type,$4)
       ON CONFLICT (report_id, user_id) DO UPDATE
       SET confirmation_type = EXCLUDED.confirmation_type,
           note = EXCLUDED.note,
           updated_at = NOW()
       RETURNING *`,
      [reportId, userId, type, note || null]
    );
    return { ...result.rows[0], duplicate: false, previousType: existing?.confirmation_type || null };
  },

  async recountConfirmations(reportId) {
    const result = await getPool().query(
      `SELECT
         COUNT(*) FILTER (WHERE confirmation_type = 'still_accurate')::int AS accurate,
         COUNT(*) FILTER (WHERE confirmation_type IN ('no_longer_accurate','needs_correction'))::int AS inaccurate
       FROM report_confirmations
       WHERE report_id = $1`,
      [reportId]
    );
    return result.rows[0];
  },

  async findFlag(reportId, userId) {
    const result = await getPool().query(
      `SELECT * FROM report_flags WHERE report_id = $1 AND user_id = $2`,
      [reportId, userId]
    );
    return result.rows[0] || null;
  },

  async createFlag({ reportId, userId, reason, details }) {
    const result = await getPool().query(
      `INSERT INTO report_flags (report_id, user_id, reason, details)
       VALUES ($1,$2,$3::flag_reason,$4)
       RETURNING *`,
      [reportId, userId, reason, details || null]
    );
    return result.rows[0];
  },

  async applyFreshnessTransitions({ limit = 500 } = {}) {
    const expired = await getPool().query(
      `UPDATE reports
       SET status = 'expired'::report_status,
           quality_updated_at = NOW(),
           updated_at = NOW()
       WHERE id IN (
         SELECT r.id
         FROM reports r
         WHERE r.status IN ('submitted','active','confirmed','stale')
           AND r.expires_at IS NOT NULL
           AND r.expires_at <= NOW()
         LIMIT $1
       )
       RETURNING id, status, category_id, location_id, source_type, title`,
      [limit]
    );

    const expiredIds = expired.rows.map((r) => r.id);
    let expiredCategoryMap = new Map();
    if (expiredIds.length) {
      const cats = await getPool().query(
        `SELECT r.id, c.code AS category_code, r.status AS prev_hint
         FROM reports r
         JOIN report_categories c ON c.id = r.category_id
         WHERE r.id = ANY($1::uuid[])`,
        [expiredIds]
      );
      expiredCategoryMap = new Map(cats.rows.map((r) => [r.id, r.category_code]));
    }

    for (const row of expired.rows) {
      await this.addHistory({
        reportId: row.id,
        eventType: 'expired',
        previousState: { status: 'previous' },
        newState: { status: 'expired' },
        reason: 'Automatic expiry based on category freshness policy',
      });
    }

    const stale = await getPool().query(
      `WITH candidates AS (
         SELECT r.id, r.status AS prev_status, c.code AS category_code
         FROM reports r
         JOIN category_freshness_policies p ON p.category_id = r.category_id
         JOIN report_categories c ON c.id = r.category_id
         WHERE r.status IN ('submitted','active','confirmed')
           AND (r.expires_at IS NULL OR r.expires_at > NOW())
           AND (
             COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at)
             + make_interval(mins => p.stale_after_minutes)
           ) <= NOW()
         LIMIT $1
       )
       UPDATE reports r
       SET status = 'stale'::report_status,
           quality_updated_at = NOW(),
           updated_at = NOW()
       FROM candidates
       WHERE r.id = candidates.id
       RETURNING r.id, r.status, r.category_id, r.location_id, r.source_type, r.title,
                 candidates.prev_status, candidates.category_code`,
      [limit]
    );

    for (const row of stale.rows) {
      await this.addHistory({
        reportId: row.id,
        eventType: 'status_changed',
        previousState: { status: row.prev_status },
        newState: { status: 'stale' },
        reason: 'Automatic stale transition based on category freshness policy',
      });
    }

    const transitions = [
      ...expired.rows.map((row) => ({
        id: row.id,
        status: 'expired',
        prevStatus: 'active',
        categoryCode: expiredCategoryMap.get(row.id) || null,
        locationId: row.location_id,
        sourceType: row.source_type,
        title: row.title,
        transition: 'expired',
      })),
      ...stale.rows.map((row) => ({
        id: row.id,
        status: 'stale',
        prevStatus: row.prev_status,
        categoryCode: row.category_code,
        locationId: row.location_id,
        sourceType: row.source_type,
        title: row.title,
        transition: 'stale',
      })),
    ];

    return {
      expired: expired.rowCount,
      stale: stale.rowCount,
      transitions,
    };
  },
};
