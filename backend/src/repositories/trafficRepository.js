import { getPool } from '../db/pool.js';
import {
  buildAboutLines,
  buildQualityMetadata,
  computeTrustLabels,
} from '../services/dataQualityService.js';

function mapTraffic(row) {
  if (!row) return null;
  const policy = {
    fresh_within_minutes: row.fresh_within_minutes,
    recent_within_minutes: row.recent_within_minutes,
    stale_after_minutes: row.stale_after_minutes,
  };
  const quality =
    row.quality ||
    buildQualityMetadata(
      {
        ...row,
        corroboration_count: row.corroboration_count,
      },
      policy
    );
  return {
    id: row.traffic_id,
    reportId: row.report_id,
    severity: row.severity,
    cause: row.cause,
    road: {
      id: row.road_id || null,
      name: row.road_name || null,
    },
    direction: {
      label: row.direction_label || buildDirectionLabel(row),
      from: row.from_label || null,
      toward: row.toward_label || null,
      fromLocationId: row.from_location_id || null,
      towardLocationId: row.toward_location_id || null,
    },
    affectedSection: row.affected_section || null,
    estimatedDelayMinutes:
      row.estimated_delay_minutes != null ? Number(row.estimated_delay_minutes) : null,
    report: {
      id: row.report_id,
      title: row.title,
      description: row.description,
      sourceType: row.source_type,
      status: row.status,
      visibility: row.visibility,
      moderationState: row.moderation_state,
      freshness: row.freshness_label || quality.freshness?.state,
      trustLabels: row.trust_labels || [],
      quality,
      about: row.about_lines || buildAboutLines(quality),
      corroborationCount: Number(row.corroboration_count || quality.corroboration?.count || 1),
      occurredAt: row.occurred_at,
      expiresAt: row.expires_at,
      lastConfirmedAt: row.last_confirmed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      confirmation: {
        stillAccurate: Number(row.confirmed_accurate_count || 0),
        noLongerAccurate: Number(row.confirmed_inaccurate_count || 0),
      },
      author: {
        id: row.user_id,
        displayName: row.author_display_name || null,
      },
    },
    conflict: row.conflict || null,
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
    map: {
      ready: row.latitude != null && row.longitude != null,
      lat: row.latitude != null ? Number(row.latitude) : null,
      lng: row.longitude != null ? Number(row.longitude) : null,
    },
    distanceKm:
      row.distance_km != null ? Number(Number(row.distance_km).toFixed(2)) : undefined,
    createdAt: row.traffic_created_at || row.created_at,
    updatedAt: row.traffic_updated_at || row.updated_at,
  };
}

function buildDirectionLabel(row) {
  if (row.from_label && row.toward_label) return `${row.from_label} → ${row.toward_label}`;
  if (row.toward_label) return `Toward ${row.toward_label}`;
  if (row.from_label) return `From ${row.from_label}`;
  return null;
}

function decorate(row) {
  if (!row) return null;
  const policy = {
    fresh_within_minutes: row.fresh_within_minutes,
    recent_within_minutes: row.recent_within_minutes,
    stale_after_minutes: row.stale_after_minutes,
  };
  const quality = buildQualityMetadata(row, policy);
  row.freshness_label = quality.freshness.state;
  row.trust_labels = computeTrustLabels(row);
  row.quality = quality;
  row.about_lines = buildAboutLines(quality);
  return mapTraffic(row);
}

const selectColumns = `
  t.id AS traffic_id,
  t.report_id,
  t.severity,
  t.cause,
  t.road_id,
  t.road_name,
  t.direction_label,
  t.from_location_id,
  t.toward_location_id,
  t.from_label,
  t.toward_label,
  t.affected_section,
  t.estimated_delay_minutes,
  t.created_at AS traffic_created_at,
  t.updated_at AS traffic_updated_at,
  r.id AS report_pk,
  r.user_id,
  r.location_id,
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
  r.created_at,
  r.updated_at,
  loc.name AS location_name,
  loc.type AS location_type,
  loc.slug AS location_slug,
  loc.state_id,
  loc.lga_id,
  loc.area_id,
  s.name AS state_name,
  s.code AS state_code,
  l.name AS lga_name,
  a.name AS area_name,
  u.display_name AS author_display_name,
  p.stale_after_minutes,
  p.fresh_within_minutes,
  p.recent_within_minutes,
  r.corroboration_count,
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
  FROM traffic_reports t
  JOIN reports r ON r.id = t.report_id
  JOIN report_categories c ON c.id = r.category_id AND c.code = 'traffic'
  JOIN locations loc ON loc.id = r.location_id
  LEFT JOIN states s ON s.id = loc.state_id
  LEFT JOIN lgas l ON l.id = loc.lga_id
  LEFT JOIN areas a ON a.id = loc.area_id
  JOIN users u ON u.id = r.user_id
  LEFT JOIN category_freshness_policies p ON p.category_id = r.category_id
`;

function freshnessClause(freshness) {
  if (freshness === 'expired') {
    return `(r.status = 'expired' OR (r.expires_at IS NOT NULL AND r.expires_at <= NOW()))`;
  }
  if (freshness === 'stale') {
    return `r.status = 'stale'`;
  }
  if (freshness === 'fresh') {
    return `r.status IN ('submitted','active','confirmed') AND (r.expires_at IS NULL OR r.expires_at > NOW())`;
  }
  return `r.status <> 'removed'`;
}

export const trafficRepository = {
  mapTraffic,
  decorate,

  async create(fields) {
    const result = await getPool().query(
      `INSERT INTO traffic_reports (
         report_id, severity, cause, road_id, road_name,
         direction_label, from_location_id, toward_location_id,
         from_label, toward_label, affected_section, estimated_delay_minutes
       ) VALUES (
         $1, $2::traffic_severity, $3::traffic_cause, $4, $5,
         $6, $7, $8,
         $9, $10, $11, $12
       )
       RETURNING id`,
      [
        fields.reportId,
        fields.severity,
        fields.cause || null,
        fields.roadId || null,
        fields.roadName || null,
        fields.directionLabel || null,
        fields.fromLocationId || null,
        fields.towardLocationId || null,
        fields.fromLabel || null,
        fields.towardLabel || null,
        fields.affectedSection || null,
        fields.estimatedDelayMinutes ?? null,
      ]
    );
    return this.findById(result.rows[0].id);
  },

  async findById(id) {
    const result = await getPool().query(
      `SELECT ${selectColumns} ${fromJoins} WHERE t.id = $1`,
      [id]
    );
    return decorate(result.rows[0]);
  },

  async findByReportId(reportId) {
    const result = await getPool().query(
      `SELECT ${selectColumns} ${fromJoins} WHERE t.report_id = $1`,
      [reportId]
    );
    return decorate(result.rows[0]);
  },

  async findRawById(id) {
    const result = await getPool().query(`SELECT * FROM traffic_reports WHERE id = $1`, [id]);
    return result.rows[0] || null;
  },

  async list({ locationId, road, severity, direction, freshness, sourceType, page, limit }) {
    const where = [`r.visibility = 'public'`, freshnessClause(freshness)];
    const params = [];

    if (locationId) {
      params.push(locationId);
      where.push(`r.location_id = $${params.length}`);
    }
    if (road) {
      params.push(`%${road}%`);
      where.push(`t.road_name ILIKE $${params.length}`);
    }
    if (severity) {
      params.push(severity);
      where.push(`t.severity = $${params.length}::traffic_severity`);
    }
    if (direction) {
      params.push(`%${direction}%`);
      where.push(`(
        t.direction_label ILIKE $${params.length}
        OR t.from_label ILIKE $${params.length}
        OR t.toward_label ILIKE $${params.length}
      )`);
    }
    if (sourceType) {
      params.push(sourceType);
      where.push(`r.source_type = $${params.length}::report_source_type`);
    }

    const offset = (page - 1) * limit;
    params.push(limit, offset);

    const result = await getPool().query(
      `SELECT ${selectColumns}
       ${fromJoins}
       WHERE ${where.join(' AND ')}
       ORDER BY COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countResult = await getPool().query(
      `SELECT COUNT(*)::int AS total
       ${fromJoins}
       WHERE ${where.join(' AND ')}`,
      params.slice(0, -2)
    );

    return {
      items: result.rows.map(decorate),
      page,
      limit,
      total: countResult.rows[0].total,
    };
  },

  async nearby({ lat, lng, radiusKm, severity, freshness, limit }) {
    const params = [lat, lng, radiusKm, limit];
    const where = [
      `r.visibility = 'public'`,
      freshnessClause(freshness),
      `COALESCE(r.latitude, loc.latitude) IS NOT NULL`,
      `COALESCE(r.longitude, loc.longitude) IS NOT NULL`,
    ];
    if (severity) {
      params.push(severity);
      where.push(`t.severity = $${params.length}::traffic_severity`);
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
         WHERE ${where.join(' AND ')}
       ) nearby
       WHERE nearby.distance_km <= $3
       ORDER BY nearby.distance_km ASC,
         COALESCE(nearby.last_confirmed_at, nearby.occurred_at, nearby.created_at) DESC
       LIMIT $4`,
      params
    );

    return result.rows.map(decorate);
  },

  async summary({ locationId } = {}) {
    const params = [];
    const where = [
      `r.visibility = 'public'`,
      `r.status IN ('submitted','active','confirmed')`,
      `(r.expires_at IS NULL OR r.expires_at > NOW())`,
    ];
    if (locationId) {
      params.push(locationId);
      where.push(`r.location_id = $${params.length}`);
    }

    const result = await getPool().query(
      `SELECT t.severity, COUNT(*)::int AS count
       ${fromJoins}
       WHERE ${where.join(' AND ')}
       GROUP BY t.severity
       ORDER BY t.severity`,
      params
    );

    const counts = {
      clear: 0,
      light: 0,
      moderate: 0,
      heavy: 0,
      standstill: 0,
      blocked: 0,
      unknown: 0,
    };
    for (const row of result.rows) {
      counts[row.severity] = row.count;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    const eventParams = [];
    const eventWhere = [
      `e.status IN ('reported','investigating','confirmed','active','improving')`,
      `e.merged_into_event_id IS NULL`,
      `e.freshness_state <> 'expired'`,
    ];
    if (locationId) {
      eventParams.push(locationId);
      eventWhere.push(`e.location_id = $${eventParams.length}`);
    }
    const eventStats = await getPool().query(
      `SELECT COUNT(*)::int AS active_events,
              COUNT(*) FILTER (WHERE e.severity IN ('heavy','standstill','blocked'))::int AS high_severity,
              COUNT(*) FILTER (
                WHERE COALESCE(e.observed_at, e.updated_at) >= NOW() - INTERVAL '60 minutes'
              )::int AS observed_last_hour
       FROM traffic_events e
       WHERE ${eventWhere.join(' AND ')}`,
      eventParams
    );
    const er = eventStats.rows[0] || {};

    return {
      total,
      bySeverity: counts,
      activeEvents: er.active_events || 0,
      highSeverityEvents: er.high_severity || 0,
      activityWindow: {
        hours: 1,
        observationCount: er.observed_last_hour || 0,
        note: `Based on ${er.observed_last_hour || 0} live traffic events observed or updated in the last hour. Not a claim of every road in the area.`,
      },
      asOf: new Date().toISOString(),
    };
  },
};
