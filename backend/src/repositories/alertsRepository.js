import { getPool } from '../db/pool.js';
import { alertCategoryLabel, alertSeverityLabel } from '../config/alerts.js';

function computeTrustLabels(row) {
  const labels = [];
  if (row.source_type === 'official') {
    labels.push('Official');
  } else if (row.source_type === 'aggregated') {
    labels.push('Aggregated');
  } else if (row.status === 'confirmed' || Number(row.confirmed_accurate_count) > 0) {
    labels.push('Community Confirmed');
  } else {
    labels.push('Community Report — Unverified');
  }

  if (row.status === 'under_review' || row.moderation_state === 'under_review') {
    labels.push('Under Review');
  }
  if (row.status === 'flagged' || row.moderation_state === 'flagged') {
    labels.push('Under Review');
  }
  if (row.status === 'stale') labels.push('Stale');
  if (row.status === 'expired') labels.push('Expired');
  return [...new Set(labels)];
}

function computeFreshnessLabel(row, now = new Date()) {
  if (row.status === 'expired' || (row.expires_at && new Date(row.expires_at) <= now)) {
    return 'expired';
  }
  if (row.status === 'stale') return 'stale';
  if (row.status === 'under_review' || row.status === 'flagged') return 'under_review';
  const anchor = row.last_confirmed_at || row.occurred_at || row.created_at;
  if (!anchor) return 'fresh';
  const ageMs = now - new Date(anchor);
  const staleMs = (row.stale_after_minutes || 90) * 60 * 1000;
  if (ageMs >= staleMs) return 'stale';
  return 'fresh';
}

function mapAlert(row) {
  if (!row) return null;
  return {
    id: row.alert_id,
    reportId: row.report_id,
    alertCategory: row.alert_category,
    alertCategoryLabel: alertCategoryLabel(row.alert_category),
    severity: row.severity,
    severityLabel: alertSeverityLabel(row.severity),
    road: {
      id: row.road_id || null,
      name: row.road_name || null,
    },
    affectedArea: row.affected_area || null,
    landmarkLabel: row.landmark_label || null,
    cause: row.cause || null,
    relatedTrafficReportId: row.related_traffic_report_id || null,
    eventGroupId: row.event_group_id || null,
    requiresReview: Boolean(row.requires_review),
    report: {
      id: row.report_id,
      title: row.title,
      description: row.description,
      sourceType: row.source_type,
      status: row.status,
      visibility: row.visibility,
      moderationState: row.moderation_state,
      freshness: row.freshness_label,
      trustLabels: row.trust_labels || [],
      occurredAt: row.occurred_at,
      expiresAt: row.expires_at,
      lastConfirmedAt: row.last_confirmed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      confirmation: {
        stillAccurate: Number(row.confirmed_accurate_count || 0),
        noLongerAccurate: Number(row.confirmed_inaccurate_count || 0),
      },
      // Privacy: do not expose reporter identity on public safety alerts
      author: row.user_id ? { id: row.user_id } : null,
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
    // Public map uses location centroid / report public coords only — not private GPS trail
    map: {
      ready: row.latitude != null && row.longitude != null,
      lat: row.latitude != null ? Number(row.latitude) : null,
      lng: row.longitude != null ? Number(row.longitude) : null,
    },
    distanceKm:
      row.distance_km != null ? Number(Number(row.distance_km).toFixed(2)) : undefined,
    createdAt: row.alert_created_at || row.created_at,
    updatedAt: row.alert_updated_at || row.updated_at,
  };
}

function decorate(row) {
  if (!row) return null;
  row.freshness_label = computeFreshnessLabel(row);
  row.trust_labels = computeTrustLabels(row);
  return mapAlert(row);
}

const selectColumns = `
  a.id AS alert_id,
  a.report_id,
  a.alert_category,
  a.severity,
  a.road_id,
  a.road_name,
  a.affected_area,
  a.cause,
  a.landmark_label,
  a.related_traffic_report_id,
  a.event_group_id,
  a.requires_review,
  a.created_at AS alert_created_at,
  a.updated_at AS alert_updated_at,
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
  a_area.name AS area_name,
  p.stale_after_minutes,
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
  FROM local_alert_reports a
  JOIN reports r ON r.id = a.report_id
  JOIN report_categories c ON c.id = r.category_id AND c.code = 'local_alerts'
  JOIN locations loc ON loc.id = r.location_id
  LEFT JOIN states s ON s.id = loc.state_id
  LEFT JOIN lgas l ON l.id = loc.lga_id
  LEFT JOIN areas a_area ON a_area.id = loc.area_id
  LEFT JOIN category_freshness_policies p ON p.category_id = r.category_id
`;

function freshnessClause(freshness) {
  if (freshness === 'expired') {
    return `(r.status = 'expired' OR (r.expires_at IS NOT NULL AND r.expires_at <= NOW()))`;
  }
  if (freshness === 'stale') return `r.status = 'stale'`;
  if (freshness === 'fresh') {
    return `r.status IN ('submitted','active','confirmed') AND (r.expires_at IS NULL OR r.expires_at > NOW())`;
  }
  return `r.status <> 'removed'`;
}

export const alertsRepository = {
  mapAlert,
  decorate,

  async create(fields) {
    const result = await getPool().query(
      `INSERT INTO local_alert_reports (
         report_id, alert_category, severity, road_id, road_name,
         affected_area, cause, landmark_label, related_traffic_report_id,
         event_group_id, requires_review
       ) VALUES (
         $1, $2::alert_category, $3::alert_severity, $4, $5,
         $6, $7, $8, $9,
         $10, $11
       )
       RETURNING id`,
      [
        fields.reportId,
        fields.alertCategory,
        fields.severity,
        fields.roadId || null,
        fields.roadName || null,
        fields.affectedArea || null,
        fields.cause || null,
        fields.landmarkLabel || null,
        fields.relatedTrafficReportId || null,
        fields.eventGroupId || null,
        fields.requiresReview !== false,
      ]
    );
    return this.findById(result.rows[0].id);
  },

  async findById(id) {
    const result = await getPool().query(
      `SELECT ${selectColumns} ${fromJoins} WHERE a.id = $1`,
      [id]
    );
    return decorate(result.rows[0]);
  },

  async findByReportId(reportId) {
    const result = await getPool().query(
      `SELECT ${selectColumns} ${fromJoins} WHERE a.report_id = $1`,
      [reportId]
    );
    return decorate(result.rows[0]);
  },

  async findRawById(id) {
    const result = await getPool().query(`SELECT * FROM local_alert_reports WHERE id = $1`, [id]);
    return result.rows[0] || null;
  },

  async list({ locationId, category, severity, freshness, sourceType, q, page, limit }) {
    const where = [`r.visibility = 'public'`, freshnessClause(freshness)];
    const params = [];

    if (locationId) {
      params.push(locationId);
      where.push(`r.location_id = $${params.length}`);
    }
    if (category) {
      params.push(category);
      where.push(`a.alert_category = $${params.length}::alert_category`);
    }
    if (severity) {
      params.push(severity);
      where.push(`a.severity = $${params.length}::alert_severity`);
    }
    if (sourceType) {
      params.push(sourceType);
      where.push(`r.source_type = $${params.length}::report_source_type`);
    }
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      where.push(`(
        lower(r.title) LIKE $${params.length}
        OR lower(COALESCE(r.description, '')) LIKE $${params.length}
        OR lower(COALESCE(a.road_name, '')) LIKE $${params.length}
        OR lower(COALESCE(a.affected_area, '')) LIKE $${params.length}
      )`);
    }

    const offset = (page - 1) * limit;
    params.push(limit, offset);

    const result = await getPool().query(
      `SELECT ${selectColumns}
       ${fromJoins}
       WHERE ${where.join(' AND ')}
       ORDER BY
         CASE a.severity
           WHEN 'critical' THEN 0
           WHEN 'urgent' THEN 1
           WHEN 'caution' THEN 2
           ELSE 3
         END,
         COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) DESC
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

  async nearby({ lat, lng, radiusKm, category, severity, freshness, limit }) {
    const params = [lat, lng, radiusKm, limit];
    const where = [
      `r.visibility = 'public'`,
      freshnessClause(freshness),
      `COALESCE(r.latitude, loc.latitude) IS NOT NULL`,
      `COALESCE(r.longitude, loc.longitude) IS NOT NULL`,
    ];
    if (category) {
      params.push(category);
      where.push(`a.alert_category = $${params.length}::alert_category`);
    }
    if (severity) {
      params.push(severity);
      where.push(`a.severity = $${params.length}::alert_severity`);
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
         CASE nearby.severity
           WHEN 'critical' THEN 0
           WHEN 'urgent' THEN 1
           WHEN 'caution' THEN 2
           ELSE 3
         END,
         COALESCE(nearby.last_confirmed_at, nearby.occurred_at, nearby.created_at) DESC
       LIMIT $4`,
      params
    );

    return result.rows.map(decorate);
  },

  /**
   * Find other community alerts that may refer to the same incident
   * (same location + category within a short window). Does not delete or merge.
   */
  async findPotentialDuplicates({ locationId, alertCategory, excludeAlertId = null, hours = 6 }) {
    const params = [locationId, alertCategory, hours];
    let excludeClause = '';
    if (excludeAlertId) {
      params.push(excludeAlertId);
      excludeClause = `AND a.id <> $${params.length}`;
    }
    const result = await getPool().query(
      `SELECT ${selectColumns}
       ${fromJoins}
       WHERE r.visibility = 'public'
         AND r.status <> 'removed'
         AND r.location_id = $1
         AND a.alert_category = $2::alert_category
         AND r.created_at >= NOW() - ($3::text || ' hours')::interval
         ${excludeClause}
       ORDER BY r.created_at DESC
       LIMIT 10`,
      params
    );
    return result.rows.map(decorate);
  },

  async findRelatedTraffic({ locationId, roadName = null, limit = 5 }) {
    const params = [locationId];
    const where = [
      `r.visibility = 'public'`,
      `r.status IN ('submitted','active','confirmed','stale')`,
      `r.location_id = $1`,
    ];
    if (roadName) {
      params.push(`%${roadName}%`);
      where.push(`t.road_name ILIKE $${params.length}`);
    }
    params.push(limit);
    const result = await getPool().query(
      `SELECT t.id, t.severity, t.road_name, r.title, r.status, r.created_at
       FROM traffic_reports t
       JOIN reports r ON r.id = t.report_id
       WHERE ${where.join(' AND ')}
       ORDER BY COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) DESC
       LIMIT $${params.length}`,
      params
    );
    return result.rows.map((row) => ({
      id: row.id,
      severity: row.severity,
      roadName: row.road_name,
      title: row.title,
      status: row.status,
      createdAt: row.created_at,
    }));
  },
};
