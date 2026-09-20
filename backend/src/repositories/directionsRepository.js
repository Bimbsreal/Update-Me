import { getPool } from '../db/pool.js';
import { travelModeLabel } from '../config/directions.js';

function computeTrustLabels(row) {
  const labels = [];
  if (row.source_type === 'official') labels.push('Official Advisory');
  else if (row.source_type === 'aggregated') labels.push('Aggregated');
  else labels.push('Community Local Knowledge');
  if (row.status === 'confirmed' || Number(row.confirmed_accurate_count) > 0) {
    labels.push('Community Confirmed');
  }
  if (
    row.updated_at &&
    row.created_at &&
    new Date(row.updated_at).getTime() > new Date(row.created_at).getTime() + 1000
  ) {
    labels.push('Updated');
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
  const anchor = row.last_confirmed_at || row.occurred_at || row.created_at;
  if (!anchor) return 'fresh';
  const ageMs = now - new Date(anchor);
  const staleMs = (row.stale_after_minutes || 2880) * 60 * 1000;
  if (ageMs >= staleMs) return 'stale';
  return 'fresh';
}

function mapLocationSide(row, prefix) {
  const id = row[`${prefix}_location_id`];
  if (!id) return null;
  return {
    id,
    name: row[`${prefix}_location_name`],
    type: row[`${prefix}_location_type`],
    state: row[`${prefix}_state_name`]
      ? { name: row[`${prefix}_state_name`], code: row[`${prefix}_state_code`] }
      : null,
    lga: row[`${prefix}_lga_name`] ? { name: row[`${prefix}_lga_name`] } : null,
    coordinates:
      row[`${prefix}_lat`] != null && row[`${prefix}_lng`] != null
        ? { lat: Number(row[`${prefix}_lat`]), lng: Number(row[`${prefix}_lng`]) }
        : null,
  };
}

function mapKnowledge(row) {
  if (!row) return null;
  return {
    id: row.knowledge_id,
    reportId: row.report_id,
    travelMode: row.travel_mode,
    travelModeLabel: row.travel_mode ? travelModeLabel(row.travel_mode) : null,
    transportRouteId: row.transport_route_id || null,
    majorRoads: row.major_roads || null,
    landmarks: row.landmarks || null,
    boardingHint: row.boarding_hint || null,
    instructionSummary: row.instruction_summary,
    origin: mapLocationSide(row, 'origin'),
    destination: mapLocationSide(row, 'destination'),
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
      author: row.user_id ? { id: row.user_id } : null,
    },
    createdAt: row.knowledge_created_at || row.created_at,
    updatedAt: row.knowledge_updated_at || row.updated_at,
  };
}

function decorate(row) {
  if (!row) return null;
  row.freshness_label = computeFreshnessLabel(row);
  row.trust_labels = computeTrustLabels(row);
  return mapKnowledge(row);
}

const selectColumns = `
  k.id AS knowledge_id,
  k.report_id,
  k.origin_location_id,
  k.destination_location_id,
  k.travel_mode,
  k.transport_route_id,
  k.major_roads,
  k.landmarks,
  k.boarding_hint,
  k.instruction_summary,
  k.created_at AS knowledge_created_at,
  k.updated_at AS knowledge_updated_at,
  r.user_id,
  r.title,
  r.description,
  r.source_type,
  r.status,
  r.visibility,
  r.moderation_state,
  r.occurred_at,
  r.expires_at,
  r.last_confirmed_at,
  r.confirmed_accurate_count,
  r.confirmed_inaccurate_count,
  r.created_at,
  r.updated_at,
  oloc.name AS origin_location_name,
  oloc.type AS origin_location_type,
  oloc.latitude AS origin_lat,
  oloc.longitude AS origin_lng,
  os.name AS origin_state_name,
  os.code AS origin_state_code,
  olga.name AS origin_lga_name,
  dloc.name AS destination_location_name,
  dloc.type AS destination_location_type,
  dloc.latitude AS destination_lat,
  dloc.longitude AS destination_lng,
  ds.name AS destination_state_name,
  ds.code AS destination_state_code,
  dlga.name AS destination_lga_name,
  p.stale_after_minutes
`;

const fromJoins = `
  FROM direction_local_knowledge k
  JOIN reports r ON r.id = k.report_id
  JOIN report_categories c ON c.id = r.category_id AND c.code = 'directions'
  JOIN locations oloc ON oloc.id = k.origin_location_id
  JOIN locations dloc ON dloc.id = k.destination_location_id
  LEFT JOIN states os ON os.id = oloc.state_id
  LEFT JOIN lgas olga ON olga.id = oloc.lga_id
  LEFT JOIN states ds ON ds.id = dloc.state_id
  LEFT JOIN lgas dlga ON dlga.id = dloc.lga_id
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

export const directionsRepository = {
  mapKnowledge,
  decorate,

  async createKnowledge(fields) {
    const result = await getPool().query(
      `INSERT INTO direction_local_knowledge (
         report_id, origin_location_id, destination_location_id, travel_mode,
         transport_route_id, major_roads, landmarks, boarding_hint, instruction_summary
       ) VALUES ($1,$2,$3,$4::direction_travel_mode,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        fields.reportId,
        fields.originLocationId,
        fields.destinationLocationId,
        fields.travelMode || null,
        fields.transportRouteId || null,
        fields.majorRoads || null,
        fields.landmarks || null,
        fields.boardingHint || null,
        fields.instructionSummary,
      ]
    );
    return this.findKnowledgeById(result.rows[0].id);
  },

  async findKnowledgeById(id) {
    const result = await getPool().query(
      `SELECT ${selectColumns} ${fromJoins} WHERE k.id = $1`,
      [id]
    );
    return decorate(result.rows[0]);
  },

  async findRawKnowledgeById(id) {
    const result = await getPool().query(
      `SELECT * FROM direction_local_knowledge WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  async listKnowledge({
    originLocationId = null,
    destinationLocationId = null,
    locationId = null,
    mode = null,
    freshness = 'fresh',
    q = null,
    page = 1,
    limit = 20,
  } = {}) {
    const where = [`r.visibility = 'public'`, freshnessClause(freshness)];
    const params = [];

    if (originLocationId) {
      params.push(originLocationId);
      where.push(`k.origin_location_id = $${params.length}`);
    }
    if (destinationLocationId) {
      params.push(destinationLocationId);
      where.push(`k.destination_location_id = $${params.length}`);
    }
    if (locationId) {
      params.push(locationId);
      where.push(
        `(k.origin_location_id = $${params.length} OR k.destination_location_id = $${params.length})`
      );
    }
    if (mode) {
      params.push(mode);
      where.push(`(k.travel_mode IS NULL OR k.travel_mode = $${params.length}::direction_travel_mode)`);
    }
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      where.push(`(
        lower(k.instruction_summary) LIKE $${params.length}
        OR lower(COALESCE(k.major_roads,'')) LIKE $${params.length}
        OR lower(COALESCE(k.landmarks,'')) LIKE $${params.length}
        OR lower(r.title) LIKE $${params.length}
      )`);
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
};
