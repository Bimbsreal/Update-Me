/**
 * Admin reference-location management — edit/deactivate only; no casual deletes.
 * Authoritative Nigeria hierarchy on the existing `locations` table.
 */
import { getPool } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { adminAuditRepository } from '../repositories/adminAuditRepository.js';
import { isWithinNigeriaBounds } from '../utils/geoBounds.js';

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

function mapAdminLocation(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    type: row.type,
    status: row.status,
    normalizedName: row.normalized_name,
    parentId: row.parent_id,
    parentName: row.parent_name || null,
    stateId: row.state_id,
    stateName: row.state_name,
    lgaId: row.lga_id,
    lgaName: row.lga_name,
    areaId: row.area_id,
    areaName: row.area_name,
    childCount: row.child_count != null ? Number(row.child_count) : undefined,
    coordinates:
      row.latitude != null && row.longitude != null
        ? { lat: Number(row.latitude), lng: Number(row.longitude) }
        : null,
    placeKind: row.place_kind || null,
    verificationStatus: row.verification_status || 'unverified',
    confidence: row.confidence || 'medium',
    houseNumber: row.house_number || null,
    streetName: row.street_name || null,
    postalCode: row.postal_code || null,
    addressOriginal: row.address_original || null,
    addressNormalized: row.address_normalized || null,
    address: row.address || null,
    mergedIntoLocationId: row.merged_into_location_id || null,
    provenance: {
      sourceName: row.source_name || null,
      sourceType: row.source_type || null,
      sourceUrl: row.source_url || null,
      sourceExternalId: row.source_external_id || null,
      importBatchId: row.import_batch_id || null,
      verifiedAt: row.verified_at || null,
    },
    notes: row.notes || null,
    deactivatedAt: row.deactivated_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    usage: row.usage || null,
  };
}

const USAGE_SQL = `
  SELECT
    (SELECT COUNT(*)::int FROM reports r WHERE r.location_id = $1) AS reports,
    (SELECT COUNT(*)::int FROM fuel_stations fs WHERE fs.location_id = $1) AS fuel_stations,
    (SELECT COUNT(*)::int FROM transport_routes tr
       WHERE tr.origin_location_id = $1 OR tr.destination_location_id = $1) AS transport_routes,
    (SELECT COUNT(*)::int FROM transport_stops ts WHERE ts.location_id = $1) AS transport_stops,
    (SELECT COUNT(*)::int FROM price_places pp WHERE pp.location_id = $1) AS price_places,
    (SELECT COUNT(*)::int FROM questions q WHERE q.location_id = $1) AS questions,
    (SELECT COUNT(*)::int FROM saved_areas sa WHERE sa.location_id = $1) AS saved_areas,
    (SELECT COUNT(*)::int FROM saved_routes sr
       WHERE sr.origin_location_id = $1 OR sr.destination_location_id = $1) AS saved_routes,
    (SELECT COUNT(*)::int FROM official_updates ou WHERE ou.location_id = $1) AS official_updates,
    (SELECT COUNT(*)::int FROM traffic_events te WHERE te.location_id = $1) AS traffic_events,
    (SELECT COUNT(*)::int FROM direction_local_knowledge d
       WHERE d.origin_location_id = $1 OR d.destination_location_id = $1) AS direction_knowledge,
    (SELECT COUNT(*)::int FROM locations c WHERE c.parent_id = $1) AS child_locations
`;

export async function countLocationUsage(locationId) {
  const result = await getPool().query(USAGE_SQL, [locationId]);
  const row = result.rows[0] || {};
  const usage = {
    reports: row.reports || 0,
    fuelStations: row.fuel_stations || 0,
    transportRoutes: row.transport_routes || 0,
    transportStops: row.transport_stops || 0,
    pricePlaces: row.price_places || 0,
    questions: row.questions || 0,
    savedAreas: row.saved_areas || 0,
    savedRoutes: row.saved_routes || 0,
    officialUpdates: row.official_updates || 0,
    trafficEvents: row.traffic_events || 0,
    directionKnowledge: row.direction_knowledge || 0,
    childLocations: row.child_locations || 0,
  };
  usage.total =
    usage.reports +
    usage.fuelStations +
    usage.transportRoutes +
    usage.transportStops +
    usage.pricePlaces +
    usage.questions +
    usage.savedAreas +
    usage.savedRoutes +
    usage.officialUpdates +
    usage.trafficEvents +
    usage.directionKnowledge +
    usage.childLocations;
  return usage;
}

function validateCoords(lat, lng) {
  if (lat == null && lng == null) return { lat: null, lng: null };
  if ((lat == null) !== (lng == null)) {
    throw new AppError('Latitude and longitude must both be set or both cleared', 400, 'VALIDATION_ERROR');
  }
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < -90 || a > 90 || b < -180 || b > 180) {
    throw new AppError('Invalid coordinates', 400, 'VALIDATION_ERROR');
  }
  if (!isWithinNigeriaBounds(a, b)) {
    throw new AppError(
      'Coordinates must fall within Nigeria geographic bounds.',
      400,
      'OUT_OF_BOUNDS'
    );
  }
  return { lat: a, lng: b };
}

export const locationAdminService = {
  async dashboard() {
    const pool = getPool();
    const [
      byType,
      inactive,
      draft,
      missingCoords,
      duplicates,
      pendingVerify,
      unresolved,
      conflicts,
      busStops,
    ] = await Promise.all([
      pool.query(
        `SELECT type::text AS type, COUNT(*)::int AS c
         FROM locations
         WHERE merged_into_location_id IS NULL
         GROUP BY type
         ORDER BY type`
      ),
      pool.query(`SELECT COUNT(*)::int AS c FROM locations WHERE status = 'inactive'`),
      pool.query(`SELECT COUNT(*)::int AS c FROM locations WHERE status = 'draft'`),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM locations
         WHERE status = 'active'
           AND type IN ('area', 'lga', 'city', 'landmark', 'road', 'place')
           AND (latitude IS NULL OR longitude IS NULL)`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM (
           SELECT 1
           FROM locations
           WHERE parent_id IS NOT NULL
             AND status IN ('active', 'draft')
             AND type IN ('lga', 'city', 'area', 'road', 'landmark', 'place')
             AND normalized_name IS NOT NULL
             AND merged_into_location_id IS NULL
           GROUP BY parent_id, type, normalized_name
           HAVING COUNT(*) > 1
         ) d`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM locations
         WHERE verification_status IN ('unverified', 'pending')
           AND status = 'active'
           AND merged_into_location_id IS NULL
           AND type IN ('area', 'road', 'landmark', 'place')`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM location_resolve_queue WHERE status = 'open'`
      ).catch(() => ({ rows: [{ c: 0 }] })),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM location_conflicts WHERE status = 'open'`
      ).catch(() => ({ rows: [{ c: 0 }] })),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM transport_stops WHERE is_active = TRUE`
      ).catch(() => ({ rows: [{ c: 0 }] })),
    ]);
    const typeCounts = Object.fromEntries(byType.rows.map((r) => [r.type, r.c]));
    return {
      states: typeCounts.state || 0,
      lgas: typeCounts.lga || 0,
      cities: typeCounts.city || 0,
      areas: typeCounts.area || 0,
      roads: typeCounts.road || 0,
      places: (typeCounts.place || 0) + (typeCounts.landmark || 0),
      landmarks: typeCounts.landmark || 0,
      busStops: busStops.rows[0]?.c || 0,
      inactive: inactive.rows[0]?.c || 0,
      pendingReview: draft.rows[0]?.c || 0,
      pendingVerification: pendingVerify.rows[0]?.c || 0,
      missingCoordinates: missingCoords.rows[0]?.c || 0,
      duplicateGroups: duplicates.rows[0]?.c || 0,
      unresolvedQueries: unresolved.rows[0]?.c || 0,
      openConflicts: conflicts.rows[0]?.c || 0,
      byType: typeCounts,
    };
  },

  async list({ q, type, status, stateId, parentId, page = 1, limit = 40 } = {}) {
    const params = [];
    const where = [];
    if (q) {
      const like = `%${String(q).trim()}%`;
      params.push(like);
      const qIdx = params.length;
      where.push(
        `(loc.name ILIKE $${qIdx} OR loc.slug ILIKE $${qIdx} OR loc.normalized_name ILIKE $${qIdx}
          OR EXISTS (
            SELECT 1 FROM location_aliases la
            WHERE la.location_id = loc.id
              AND (la.alias ILIKE $${qIdx} OR la.normalized_alias ILIKE $${qIdx})
          ))`
      );
    }
    if (type) {
      params.push(type);
      where.push(`loc.type = $${params.length}::location_type`);
    }
    if (status) {
      params.push(status);
      where.push(`loc.status = $${params.length}::location_status`);
    }
    if (stateId) {
      params.push(stateId);
      where.push(`loc.state_id = $${params.length}`);
    }
    if (parentId) {
      params.push(parentId);
      where.push(`loc.parent_id = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const lim = Math.min(Number(limit) || 40, 100);
    const off = Math.max((Number(page) || 1) - 1, 0) * lim;
    params.push(lim, off);

    const result = await getPool().query(
      `SELECT loc.*, s.name AS state_name, l.name AS lga_name, a.name AS area_name,
              p.name AS parent_name,
              (SELECT COUNT(*)::int FROM locations c WHERE c.parent_id = loc.id) AS child_count
       FROM locations loc
       LEFT JOIN states s ON s.id = loc.state_id
       LEFT JOIN lgas l ON l.id = loc.lga_id
       LEFT JOIN areas a ON a.id = loc.area_id
       LEFT JOIN locations p ON p.id = loc.parent_id
       ${whereSql}
       ORDER BY loc.type ASC, loc.name ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const count = await getPool().query(
      `SELECT COUNT(*)::int AS total FROM locations loc ${whereSql}`,
      params.slice(0, -2)
    );

    return {
      items: result.rows.map(mapAdminLocation),
      total: count.rows[0]?.total || 0,
      page: Number(page) || 1,
      limit: lim,
    };
  },

  /**
   * Hierarchy browser roots (states) or children of a parent location.
   */
  async tree({ parentId = null, stateId = null, limit = 80 } = {}) {
    const lim = Math.min(Number(limit) || 80, 200);
    if (!parentId) {
      const params = [];
      let where = `loc.type = 'state' AND loc.status IN ('active', 'draft')`;
      if (stateId) {
        params.push(stateId);
        where += ` AND loc.state_id = $${params.length}`;
      }
      params.push(lim);
      const states = await getPool().query(
        `SELECT loc.*, s.name AS state_name, s.code AS state_code,
                (SELECT COUNT(*)::int FROM locations c WHERE c.parent_id = loc.id) AS child_count
         FROM locations loc
         LEFT JOIN states s ON s.id = loc.state_id
         WHERE ${where}
         ORDER BY loc.name ASC
         LIMIT $${params.length}`,
        params
      );
      return {
        parentId: null,
        items: states.rows.map((r) => ({
          ...mapAdminLocation(r),
          stateCode: r.state_code || null,
          hasChildren: Number(r.child_count || 0) > 0,
        })),
      };
    }

    const children = await getPool().query(
      `SELECT loc.*, s.name AS state_name, l.name AS lga_name, a.name AS area_name,
              p.name AS parent_name,
              (SELECT COUNT(*)::int FROM locations c WHERE c.parent_id = loc.id) AS child_count
       FROM locations loc
       LEFT JOIN states s ON s.id = loc.state_id
       LEFT JOIN lgas l ON l.id = loc.lga_id
       LEFT JOIN areas a ON a.id = loc.area_id
       LEFT JOIN locations p ON p.id = loc.parent_id
       WHERE loc.parent_id = $1
       ORDER BY
         CASE loc.type
           WHEN 'lga' THEN 1 WHEN 'city' THEN 2 WHEN 'area' THEN 3
           WHEN 'road' THEN 4 WHEN 'landmark' THEN 5 WHEN 'place' THEN 6
           ELSE 9
         END,
         loc.name ASC
       LIMIT $2`,
      [parentId, lim]
    );
    return {
      parentId,
      items: children.rows.map((r) => ({
        ...mapAdminLocation(r),
        hasChildren: Number(r.child_count || 0) > 0,
      })),
    };
  },

  async get(id) {
    const result = await getPool().query(
      `SELECT loc.*, s.name AS state_name, l.name AS lga_name, a.name AS area_name,
              p.name AS parent_name
       FROM locations loc
       LEFT JOIN states s ON s.id = loc.state_id
       LEFT JOIN lgas l ON l.id = loc.lga_id
       LEFT JOIN areas a ON a.id = loc.area_id
       LEFT JOIN locations p ON p.id = loc.parent_id
       WHERE loc.id = $1`,
      [id]
    );
    if (!result.rows[0]) throw new AppError('Location not found', 404, 'NOT_FOUND');
    const usage = await countLocationUsage(id);
    const [children, aliases, breadcrumb] = await Promise.all([
      getPool().query(
        `SELECT id, name, type, status,
                (SELECT COUNT(*)::int FROM locations c WHERE c.parent_id = locations.id) AS child_count
         FROM locations
         WHERE parent_id = $1
         ORDER BY type, name
         LIMIT 80`,
        [id]
      ),
      getPool().query(
        `SELECT id, alias, normalized_alias, created_at
         FROM location_aliases WHERE location_id = $1
         ORDER BY alias ASC LIMIT 40`,
        [id]
      ),
      this.breadcrumb(id),
    ]);
    return {
      location: mapAdminLocation({ ...result.rows[0], usage }),
      children: children.rows.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        status: c.status,
        childCount: Number(c.child_count || 0),
      })),
      aliases: aliases.rows.map((a) => ({
        id: a.id,
        alias: a.alias,
        createdAt: a.created_at,
      })),
      breadcrumb,
      canDelete: usage.total === 0,
      recommendedAction: usage.total > 0 ? 'deactivate' : 'deactivate_or_edit',
      impactPreview: {
        message:
          usage.total > 0
            ? `This location is referenced by ${usage.total} related records.`
            : 'No dependent content records found.',
        usage,
      },
    };
  },

  async breadcrumb(id) {
    const chain = [];
    let currentId = id;
    for (let i = 0; i < 8 && currentId; i += 1) {
      const row = await getPool().query(
        `SELECT id, name, type, parent_id FROM locations WHERE id = $1`,
        [currentId]
      );
      if (!row.rows[0]) break;
      chain.unshift({
        id: row.rows[0].id,
        name: row.rows[0].name,
        type: row.rows[0].type,
      });
      currentId = row.rows[0].parent_id;
    }
    return chain;
  },

  async impactPreview(id) {
    const usage = await countLocationUsage(id);
    return { usage, total: usage.total };
  },

  async update(id, body, admin, req) {
    const current = await this.get(id);
    const loc = current.location;
    const nextName = body.name != null ? String(body.name).trim() : loc.name;
    const nextStatus = body.status || loc.status;
    const nextNotes = body.notes != null ? String(body.notes).trim() : loc.notes;

    if (nextName.length < 2 || nextName.length > 200) {
      throw new AppError('Location name must be 2–200 characters', 400, 'VALIDATION_ERROR');
    }
    if (!['active', 'inactive', 'draft'].includes(nextStatus)) {
      throw new AppError('Invalid location status', 400, 'VALIDATION_ERROR');
    }

    if (body.delete === true) {
      throw new AppError(
        'Locations cannot be deleted. Deactivate them to preserve historical references.',
        400,
        'DELETE_FORBIDDEN'
      );
    }

    let lat = loc.coordinates?.lat ?? null;
    let lng = loc.coordinates?.lng ?? null;
    if (body.latitude !== undefined || body.longitude !== undefined) {
      const validated = validateCoords(
        body.latitude === '' ? null : body.latitude,
        body.longitude === '' ? null : body.longitude
      );
      lat = validated.lat;
      lng = validated.lng;
    }

    let nextParentId = loc.parentId;
    if (body.parentId !== undefined) {
      if (body.parentId === null || body.parentId === '') {
        nextParentId = null;
      } else {
        if (body.parentId === id) {
          throw new AppError('A location cannot be its own parent.', 400, 'VALIDATION_ERROR');
        }
        const parent = await getPool().query(
          `SELECT id, type, state_id, lga_id, area_id, status FROM locations WHERE id = $1`,
          [body.parentId]
        );
        if (!parent.rows[0]) throw new AppError('Parent location not found.', 404, 'NOT_FOUND');
        nextParentId = body.parentId;
      }
    }

    const result = await getPool().query(
      `UPDATE locations SET
         name = $2,
         status = $3::location_status,
         notes = $4,
         latitude = $5,
         longitude = $6,
         parent_id = $7,
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, nextName, nextStatus, nextNotes || null, lat, lng, nextParentId]
    );

    await writeAudit(
      admin,
      {
        action: 'location.update',
        entityType: 'location',
        entityId: id,
        previousState: {
          name: loc.name,
          status: loc.status,
          coordinates: loc.coordinates,
          parentId: loc.parentId,
          notes: loc.notes,
        },
        newState: {
          name: nextName,
          status: nextStatus,
          coordinates: lat != null ? { lat, lng } : null,
          parentId: nextParentId,
          notes: nextNotes || null,
        },
        reason: body.reason || 'Admin location update',
      },
      req
    );

    return this.get(id);
  },

  async deactivate(id, { reason } = {}, admin, req) {
    const impact = await this.impactPreview(id);
    const updated = await this.update(
      id,
      { status: 'inactive', reason: reason || 'Deactivated by admin' },
      admin,
      req
    );
    return { ...updated, impactPreview: impact };
  },

  async activate(id, { reason } = {}, admin, req) {
    return this.update(id, { status: 'active', reason: reason || 'Reactivated by admin' }, admin, req);
  },

  async listDuplicates({ limit = 40 } = {}) {
    const lim = Math.min(Number(limit) || 40, 100);
    const result = await getPool().query(
      `SELECT parent_id, type::text AS type, normalized_name, COUNT(*)::int AS count,
              array_agg(id::text ORDER BY name) AS ids,
              array_agg(name ORDER BY name) AS names
       FROM locations
       WHERE parent_id IS NOT NULL
         AND status IN ('active', 'draft')
         AND type IN ('lga', 'city', 'area', 'road', 'landmark', 'place')
         AND normalized_name IS NOT NULL
       GROUP BY parent_id, type, normalized_name
       HAVING COUNT(*) > 1
       ORDER BY count DESC, normalized_name ASC
       LIMIT $1`,
      [lim]
    );
    const nearCoords = await getPool().query(
      `SELECT a.id AS id_a, a.name AS name_a, a.type::text AS type_a,
              b.id AS id_b, b.name AS name_b, b.type::text AS type_b,
              a.latitude, a.longitude
       FROM locations a
       JOIN locations b ON a.id < b.id
         AND a.type = b.type
         AND a.status = 'active' AND b.status = 'active'
         AND a.latitude IS NOT NULL AND b.latitude IS NOT NULL
         AND abs(a.latitude - b.latitude) < 0.0005
         AND abs(a.longitude - b.longitude) < 0.0005
         AND a.parent_id IS NOT DISTINCT FROM b.parent_id
       WHERE a.type IN ('area', 'road', 'landmark', 'place')
       ORDER BY a.name
       LIMIT $1`,
      [lim]
    );
    return {
      sameNameSameParent: result.rows.map((r) => ({
        parentId: r.parent_id,
        type: r.type,
        normalizedName: r.normalized_name,
        count: r.count,
        ids: r.ids,
        names: r.names,
      })),
      nearDuplicateCoordinates: nearCoords.rows.map((r) => ({
        a: { id: r.id_a, name: r.name_a, type: r.type_a },
        b: { id: r.id_b, name: r.name_b, type: r.type_b },
        coordinates: { lat: Number(r.latitude), lng: Number(r.longitude) },
      })),
      note: 'Candidates for human review only — nothing is auto-merged or deleted.',
    };
  },

  async addAlias(locationId, { alias, reason }, admin, req) {
    const clean = String(alias || '').trim();
    if (clean.length < 2 || clean.length > 120) {
      throw new AppError('Alias must be 2–120 characters.', 400, 'VALIDATION_ERROR');
    }
    const loc = await getPool().query(`SELECT id, name FROM locations WHERE id = $1`, [locationId]);
    if (!loc.rows[0]) throw new AppError('Location not found', 404, 'NOT_FOUND');
    if (clean.toLowerCase() === String(loc.rows[0].name).toLowerCase()) {
      throw new AppError('Alias must differ from the authoritative name.', 400, 'VALIDATION_ERROR');
    }
    const inserted = await getPool().query(
      `INSERT INTO location_aliases (location_id, alias, created_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (location_id, normalized_alias) DO NOTHING
       RETURNING id, alias, created_at`,
      [locationId, clean, admin?.userId || null]
    );
    if (!inserted.rows[0]) {
      throw new AppError('This alias already exists for the location.', 409, 'DUPLICATE_ALIAS');
    }
    await writeAudit(
      admin,
      {
        action: 'location.alias_add',
        entityType: 'location',
        entityId: locationId,
        previousState: null,
        newState: { alias: clean, aliasId: inserted.rows[0].id },
        reason: reason || 'Alias added',
      },
      req
    );
    return inserted.rows[0];
  },

  async removeAlias(locationId, aliasId, { reason }, admin, req) {
    const prev = await getPool().query(
      `SELECT id, alias FROM location_aliases WHERE id = $1 AND location_id = $2`,
      [aliasId, locationId]
    );
    if (!prev.rows[0]) throw new AppError('Alias not found.', 404, 'NOT_FOUND');
    await getPool().query(`DELETE FROM location_aliases WHERE id = $1`, [aliasId]);
    await writeAudit(
      admin,
      {
        action: 'location.alias_remove',
        entityType: 'location',
        entityId: locationId,
        previousState: { alias: prev.rows[0].alias, aliasId },
        newState: null,
        reason: reason || 'Alias removed',
      },
      req
    );
    return { removed: true };
  },

  /**
   * Create a controlled area under an existing LGA — admin-verified only.
   */
  async createArea({ name, lgaId, latitude, longitude, notes, reason }, admin, req) {
    const cleanName = String(name || '').trim();
    if (cleanName.length < 2 || cleanName.length > 120) {
      throw new AppError('Area name must be 2–120 characters', 400, 'VALIDATION_ERROR');
    }

    const lga = await getPool().query(
      `SELECT l.id, l.name, l.state_id, s.name AS state_name, s.code AS state_code,
              loc.id AS lga_location_id
       FROM lgas l
       JOIN states s ON s.id = l.state_id
       LEFT JOIN locations loc ON loc.lga_id = l.id AND loc.type = 'lga'
       WHERE l.id = $1`,
      [lgaId]
    );
    if (!lga.rows[0]) throw new AppError('LGA not found', 404, 'NOT_FOUND');

    let lat = null;
    let lng = null;
    if (latitude != null && longitude != null && latitude !== '' && longitude !== '') {
      const v = validateCoords(latitude, longitude);
      lat = v.lat;
      lng = v.lng;
    }

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const areaRes = await client.query(
        `INSERT INTO areas (state_id, lga_id, name, centroid_lat, centroid_lng)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (lga_id, name) DO UPDATE
         SET centroid_lat = COALESCE(EXCLUDED.centroid_lat, areas.centroid_lat),
             centroid_lng = COALESCE(EXCLUDED.centroid_lng, areas.centroid_lng),
             updated_at = NOW()
         RETURNING id, name, (xmax = 0) AS inserted`,
        [lga.rows[0].state_id, lgaId, cleanName, lat, lng]
      );
      const areaId = areaRes.rows[0].id;

      const country = await client.query(`SELECT id FROM countries WHERE iso2 = 'NG' LIMIT 1`);
      const locRes = await client.query(
        `INSERT INTO locations (
           name, slug, type, status, parent_id, country_id, state_id, lga_id, area_id,
           latitude, longitude, source_name, source_type, notes, verified_at, metadata
         ) VALUES (
           $1, lower(regexp_replace(trim($1), '\\s+', '-', 'g')),
           'area', 'active', $2, $3, $4, $5, $6, $7, $8,
           'Admin-verified area', 'admin_reference', $9, NOW(),
           $10::jsonb
         )
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [
          cleanName,
          lga.rows[0].lga_location_id,
          country.rows[0]?.id || null,
          lga.rows[0].state_id,
          lgaId,
          areaId,
          lat,
          lng,
          notes || null,
          JSON.stringify({
            country: 'Nigeria',
            state: lga.rows[0].state_name,
            stateCode: lga.rows[0].state_code,
            lga: lga.rows[0].name,
            area: cleanName,
            adminCreated: true,
          }),
        ]
      );

      let location = locRes.rows[0];
      if (!location) {
        const existing = await client.query(
          `SELECT * FROM locations WHERE type = 'area' AND area_id = $1`,
          [areaId]
        );
        location = existing.rows[0];
      }

      await client.query('COMMIT');

      await writeAudit(
        admin,
        {
          action: 'location.create_area',
          entityType: 'location',
          entityId: location?.id,
          newState: { name: cleanName, lgaId, areaId },
          reason: reason || 'Admin created verified area',
        },
        req
      );

      return mapAdminLocation(location);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * Create road/landmark/place under an existing parent location (area/city/lga).
   */
  async createChild(
    { name, type, parentId, latitude, longitude, notes, reason },
    admin,
    req
  ) {
    const allowed = ['road', 'landmark', 'place', 'city'];
    if (!allowed.includes(type)) {
      throw new AppError('Type must be road, landmark, place, or city.', 400, 'VALIDATION_ERROR');
    }
    const cleanName = String(name || '').trim();
    if (cleanName.length < 2 || cleanName.length > 120) {
      throw new AppError('Name must be 2–120 characters', 400, 'VALIDATION_ERROR');
    }
    const parent = await getPool().query(
      `SELECT id, type, state_id, lga_id, area_id, country_id, status FROM locations WHERE id = $1`,
      [parentId]
    );
    if (!parent.rows[0]) throw new AppError('Parent location not found', 404, 'NOT_FOUND');
    if (parent.rows[0].status === 'inactive') {
      throw new AppError('Cannot attach children to an inactive parent.', 400, 'VALIDATION_ERROR');
    }

    let lat = null;
    let lng = null;
    if (latitude != null && longitude != null && latitude !== '' && longitude !== '') {
      const v = validateCoords(latitude, longitude);
      lat = v.lat;
      lng = v.lng;
    }

    const result = await getPool().query(
      `INSERT INTO locations (
         name, slug, type, status, parent_id, country_id, state_id, lga_id, area_id,
         latitude, longitude, source_name, source_type, notes, verified_at
       ) VALUES (
         $1, lower(regexp_replace(trim($1), '\\s+', '-', 'g')),
         $2::location_type, 'active', $3, $4, $5, $6, $7, $8, $9,
         'Admin-verified', 'admin_reference', $10, NOW()
       )
       RETURNING *`,
      [
        cleanName,
        type,
        parentId,
        parent.rows[0].country_id,
        parent.rows[0].state_id,
        parent.rows[0].lga_id,
        parent.rows[0].area_id,
        lat,
        lng,
        notes || null,
      ]
    );

    await writeAudit(
      admin,
      {
        action: 'location.create_child',
        entityType: 'location',
        entityId: result.rows[0].id,
        newState: { name: cleanName, type, parentId },
        reason: reason || 'Admin created child location',
      },
      req
    );

    return mapAdminLocation(result.rows[0]);
  },

  async qualityIssues({ limit = 50 } = {}) {
    const pool = getPool();
    const lim = Math.min(Number(limit) || 50, 100);

    const [missingCoords, inactiveReferenced, orphanParents, duplicateNames] = await Promise.all([
      pool.query(
        `SELECT id, name, type, status FROM locations
         WHERE status = 'active'
           AND type IN ('area', 'lga', 'city', 'landmark', 'road', 'place')
           AND (latitude IS NULL OR longitude IS NULL)
         ORDER BY type, name
         LIMIT $1`,
        [lim]
      ),
      pool.query(
        `SELECT loc.id, loc.name, loc.type, loc.status,
                (SELECT COUNT(*)::int FROM reports r WHERE r.location_id = loc.id) AS report_count
         FROM locations loc
         WHERE loc.status = 'inactive'
           AND EXISTS (SELECT 1 FROM reports r WHERE r.location_id = loc.id AND r.status <> 'removed')
         ORDER BY report_count DESC
         LIMIT $1`,
        [lim]
      ),
      pool.query(
        `SELECT loc.id, loc.name, loc.type, loc.parent_id
         FROM locations loc
         WHERE loc.parent_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM locations p WHERE p.id = loc.parent_id)
         LIMIT $1`,
        [lim]
      ),
      pool.query(
        `SELECT parent_id, type, normalized_name, COUNT(*)::int AS count,
                array_agg(id::text) AS ids
         FROM locations
         WHERE parent_id IS NOT NULL
           AND status IN ('active', 'draft')
           AND type IN ('lga', 'city', 'area')
           AND normalized_name IS NOT NULL
         GROUP BY parent_id, type, normalized_name
         HAVING COUNT(*) > 1
         LIMIT $1`,
        [lim]
      ),
    ]);

    return {
      missingCoordinates: missingCoords.rows,
      inactiveStillReferenced: inactiveReferenced.rows,
      orphanParents: orphanParents.rows,
      duplicateNormalizedNames: duplicateNames.rows,
      counts: {
        missingCoordinates: missingCoords.rows.length,
        inactiveStillReferenced: inactiveReferenced.rows.length,
        orphanParents: orphanParents.rows.length,
        duplicateNormalizedNames: duplicateNames.rows.length,
      },
    };
  },

  async listUnresolved({ status = 'open', q, page = 1, limit = 40 } = {}) {
    const params = [];
    const where = [];
    if (status && status !== 'any') {
      params.push(status);
      where.push(`q.status = $${params.length}::location_resolve_status`);
    }
    if (q) {
      params.push(`%${String(q).trim()}%`);
      where.push(`(q.raw_query ILIKE $${params.length} OR q.normalized_query ILIKE $${params.length})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const lim = Math.min(Number(limit) || 40, 100);
    const off = Math.max((Number(page) || 1) - 1, 0) * lim;
    params.push(lim, off);
    const result = await getPool().query(
      `SELECT q.*, loc.name AS resolved_name, loc.type AS resolved_type
       FROM location_resolve_queue q
       LEFT JOIN locations loc ON loc.id = q.resolved_location_id
       ${whereSql}
       ORDER BY q.hit_count DESC, q.updated_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const count = await getPool().query(
      `SELECT COUNT(*)::int AS total FROM location_resolve_queue q ${whereSql}`,
      params.slice(0, -2)
    );
    return {
      items: result.rows.map((r) => ({
        id: r.id,
        rawQuery: r.raw_query,
        normalizedQuery: r.normalized_query,
        queryContext: r.query_context,
        coordinates:
          r.latitude != null
            ? { lat: Number(r.latitude), lng: Number(r.longitude) }
            : null,
        status: r.status,
        hitCount: r.hit_count,
        resolvedLocationId: r.resolved_location_id,
        resolvedName: r.resolved_name,
        resolvedType: r.resolved_type,
        resolutionNotes: r.resolution_notes,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        resolvedAt: r.resolved_at,
      })),
      total: count.rows[0]?.total || 0,
      page: Number(page) || 1,
      limit: lim,
    };
  },

  async resolveQueueItem(id, { status, locationId, alias, notes, reason } = {}, admin, req) {
    if (!reason || String(reason).trim().length < 3) {
      throw new AppError('A reason is required.', 400, 'VALIDATION_ERROR');
    }
    const allowed = new Set(['mapped', 'aliased', 'rejected', 'ignored']);
    if (!allowed.has(status)) {
      throw new AppError('Invalid resolution status.', 400, 'VALIDATION_ERROR');
    }
    const current = await getPool().query(
      `SELECT * FROM location_resolve_queue WHERE id = $1`,
      [id]
    );
    if (!current.rows[0]) throw new AppError('Queue item not found.', 404, 'NOT_FOUND');

    if (status === 'mapped' || status === 'aliased') {
      if (!locationId) {
        throw new AppError('locationId is required to map or alias.', 400, 'VALIDATION_ERROR');
      }
      const loc = await getPool().query(`SELECT id FROM locations WHERE id = $1`, [locationId]);
      if (!loc.rows[0]) throw new AppError('Location not found.', 404, 'NOT_FOUND');
      if (status === 'aliased' || alias) {
        await this.addAlias(
          locationId,
          {
            alias: alias || current.rows[0].raw_query,
            reason: reason || 'Alias from unresolved query',
          },
          admin,
          req
        );
      }
    }

    await getPool().query(
      `UPDATE location_resolve_queue SET
         status = $2::location_resolve_status,
         resolved_location_id = $3,
         resolution_notes = $4,
         resolved_by = $5,
         resolved_at = NOW(),
         updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        status,
        locationId || null,
        notes ? String(notes).trim().slice(0, 1000) : null,
        admin?.userId || admin?.id || null,
      ]
    );

    await writeAudit(
      admin,
      {
        action: 'location.resolve_queue',
        entityType: 'location_resolve_queue',
        entityId: id,
        previousState: { status: current.rows[0].status },
        newState: { status, locationId: locationId || null },
        reason: String(reason).trim(),
      },
      req
    );

    return this.listUnresolved({ status: '', limit: 1 }).then(async () => {
      const row = await getPool().query(`SELECT * FROM location_resolve_queue WHERE id = $1`, [id]);
      return row.rows[0];
    });
  },

  async setVerification(id, { verificationStatus, confidence, reason } = {}, admin, req) {
    if (!reason || String(reason).trim().length < 3) {
      throw new AppError('A reason is required.', 400, 'VALIDATION_ERROR');
    }
    const allowed = new Set(['unverified', 'pending', 'verified', 'deprecated']);
    if (!allowed.has(verificationStatus)) {
      throw new AppError('Invalid verification status.', 400, 'VALIDATION_ERROR');
    }
    const current = await this.get(id);
    await getPool().query(
      `UPDATE locations SET
         verification_status = $2::location_verification_status,
         confidence = COALESCE($3::location_confidence, confidence),
         verified_at = CASE WHEN $2 = 'verified' THEN COALESCE(verified_at, NOW()) ELSE verified_at END,
         status = CASE WHEN $2 = 'deprecated' THEN 'inactive'::location_status ELSE status END,
         updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        verificationStatus,
        ['low', 'medium', 'high'].includes(confidence) ? confidence : null,
      ]
    );
    await writeAudit(
      admin,
      {
        action: 'location.verify',
        entityType: 'location',
        entityId: id,
        previousState: {
          verificationStatus: current.location?.verificationStatus,
        },
        newState: { verificationStatus, confidence: confidence || null },
        reason: String(reason).trim(),
      },
      req
    );
    return this.get(id);
  },

  /**
   * Soft-merge source into survivor. Never deletes. Uncertain matches must not use this blindly.
   */
  async merge(survivorId, { sourceLocationIds = [], reason } = {}, admin, req) {
    if (!reason || String(reason).trim().length < 3) {
      throw new AppError('A reason is required to merge locations.', 400, 'VALIDATION_ERROR');
    }
    const sources = [...new Set((sourceLocationIds || []).filter((id) => id && id !== survivorId))];
    if (!sources.length) {
      throw new AppError('Provide at least one source location.', 400, 'VALIDATION_ERROR');
    }
    const survivor = await getPool().query(
      `SELECT id FROM locations WHERE id = $1 AND merged_into_location_id IS NULL`,
      [survivorId]
    );
    if (!survivor.rows[0]) throw new AppError('Survivor location not found.', 404, 'NOT_FOUND');

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      for (const sourceId of sources) {
        const src = await client.query(
          `SELECT id, name FROM locations WHERE id = $1 AND merged_into_location_id IS NULL`,
          [sourceId]
        );
        if (!src.rows[0]) {
          throw new AppError(`Source ${sourceId} not found or already merged.`, 404, 'NOT_FOUND');
        }
        // Move aliases
        await client.query(
          `INSERT INTO location_aliases (location_id, alias, created_by)
           SELECT $1, la.alias, $3
           FROM location_aliases la
           WHERE la.location_id = $2
           ON CONFLICT (location_id, normalized_alias) DO NOTHING`,
          [survivorId, sourceId, admin?.userId || admin?.id || null]
        );
        await client.query(
          `INSERT INTO location_aliases (location_id, alias, created_by)
           VALUES ($1, $2, $3)
           ON CONFLICT (location_id, normalized_alias) DO NOTHING`,
          [survivorId, src.rows[0].name, admin?.userId || admin?.id || null]
        );
        await client.query(
          `UPDATE locations SET
             merged_into_location_id = $1,
             status = 'inactive'::location_status,
             verification_status = 'deprecated'::location_verification_status,
             updated_at = NOW()
           WHERE id = $2`,
          [survivorId, sourceId]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    await writeAudit(
      admin,
      {
        action: 'location.merge',
        entityType: 'location',
        entityId: survivorId,
        previousState: { sourceLocationIds: sources },
        newState: { survivorId, mergedCount: sources.length },
        reason: String(reason).trim(),
      },
      req
    );
    return this.get(survivorId);
  },

  async listConflicts({ status = 'open', limit = 40 } = {}) {
    const lim = Math.min(Number(limit) || 40, 100);
    const result = await getPool().query(
      `SELECT c.*, loc.name AS location_name, loc.type AS location_type
       FROM location_conflicts c
       JOIN locations loc ON loc.id = c.location_id
       WHERE ($1::text IS NULL OR c.status = $1)
       ORDER BY c.created_at DESC
       LIMIT $2`,
      [status || null, lim]
    );
    return {
      items: result.rows.map((r) => ({
        id: r.id,
        locationId: r.location_id,
        locationName: r.location_name,
        locationType: r.location_type,
        fieldName: r.field_name,
        valueA: r.value_a,
        valueB: r.value_b,
        sourceA: r.source_a,
        sourceB: r.source_b,
        status: r.status,
        notes: r.notes,
        createdAt: r.created_at,
      })),
      note: 'Conflicts are preserved for review — never silently resolved.',
    };
  },

  async geocodingHealth(filters = {}) {
    const { geocodingService } = await import('./geocoding/geocodingService.js');
    return geocodingService.health(filters);
  },

  async searchMetrics({ limit = 40 } = {}) {
    const lim = Math.min(Number(limit) || 40, 100);
    const result = await getPool().query(
      `SELECT normalized_query, result_count, was_ambiguous, was_unresolved,
              hit_count, last_seen_at
       FROM location_search_metrics
       ORDER BY hit_count DESC, last_seen_at DESC
       LIMIT $1`,
      [lim]
    );
    return {
      items: result.rows.map((r) => ({
        query: r.normalized_query,
        resultCount: r.result_count,
        ambiguous: r.was_ambiguous,
        unresolved: r.was_unresolved,
        hitCount: r.hit_count,
        lastSeenAt: r.last_seen_at,
      })),
      note: 'Anonymized query metrics only — no personal location history.',
    };
  },
};

export default locationAdminService;
