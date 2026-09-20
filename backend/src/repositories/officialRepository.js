import { getPool } from '../db/pool.js';
import { categoryLabel } from '../config/official.js';

function mapSource(row) {
  if (!row) return null;
  const mapped = {
    id: row.id,
    organizationName: row.organization_name,
    shortName: row.short_name,
    agencyType: row.agency_type,
    jurisdictionLevel: row.jurisdiction_level,
    stateId: row.state_id,
    stateName: row.state_name || null,
    officialWebsite: row.official_website,
    feedUrl: row.feed_url,
    ingestionMethod: row.ingestion_method,
    providerKey: row.provider_key,
    status: row.status,
    verificationStatus: row.verification_status,
    syncIntervalMinutes: row.sync_interval_minutes,
    config: row.config || {},
    notes: row.notes,
    lastSuccessAt: row.last_success_at,
    lastAttemptAt: row.last_attempt_at,
    lastFailureAt: row.last_failure_at || null,
    consecutiveFailures: row.consecutive_failures,
    lastErrorMessage: row.last_error_message,
    healthStatus: row.health_status || 'unknown',
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  return mapped;
}

function mapUpdate(row) {
  if (!row) return null;
  return {
    id: row.id,
    sourceId: row.source_id,
    externalId: row.external_id,
    dedupeKey: row.dedupe_key,
    title: row.title,
    summary: row.summary,
    body: row.body,
    originalUrl: row.original_url,
    category: row.category,
    categoryLabel: categoryLabel(row.category),
    jurisdictionLevel: row.jurisdiction_level,
    stateId: row.state_id,
    stateName: row.state_name || null,
    locationId: row.location_id,
    locationName: row.location_name || null,
    locationType: row.location_type || null,
    status: row.status,
    imageUrl: row.image_url,
    publishedAt: row.published_at,
    retrievedAt: row.retrieved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: {
      id: row.source_id,
      organizationName: row.organization_name,
      shortName: row.short_name,
      agencyType: row.agency_type,
      officialWebsite: row.official_website,
      verificationStatus: row.source_verification_status,
    },
    badge: 'OFFICIAL',
    attribution: row.short_name
      ? `Official — ${row.short_name}`
      : `Official — ${row.organization_name}`,
  };
}

const SOURCE_SELECT = `
  s.*,
  st.name AS state_name
`;

const UPDATE_SELECT = `
  u.*,
  s.organization_name,
  s.short_name,
  s.agency_type,
  s.official_website,
  s.verification_status AS source_verification_status,
  st.name AS state_name,
  loc.name AS location_name,
  loc.type AS location_type
`;

export const officialRepository = {
  async listSources({ status = null, includeInactive = true } = {}) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT ${SOURCE_SELECT}
       FROM official_sources s
       LEFT JOIN states st ON st.id = s.state_id
       WHERE ($1::official_source_status IS NULL OR s.status = $1)
         AND ($2::boolean IS TRUE OR s.status IN ('active', 'approved'))
       ORDER BY s.organization_name ASC`,
      [status, includeInactive]
    );
    return result.rows.map(mapSource);
  },

  async getSource(id) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT ${SOURCE_SELECT}
       FROM official_sources s
       LEFT JOIN states st ON st.id = s.state_id
       WHERE s.id = $1`,
      [id]
    );
    return mapSource(result.rows[0]);
  },

  async createSource(input) {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO official_sources (
         id, organization_name, short_name, agency_type, jurisdiction_level,
         state_id, official_website, feed_url, ingestion_method, provider_key,
         status, verification_status, sync_interval_minutes, config, notes,
         verified_at, verified_by
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17
       )
       RETURNING *`,
      [
        input.id,
        input.organizationName,
        input.shortName || null,
        input.agencyType,
        input.jurisdictionLevel,
        input.stateId || null,
        input.officialWebsite || null,
        input.feedUrl || null,
        input.ingestionMethod,
        input.providerKey,
        input.status,
        input.verificationStatus,
        input.syncIntervalMinutes,
        JSON.stringify(input.config || {}),
        input.notes || null,
        input.verificationStatus === 'verified' ? new Date().toISOString() : null,
        input.verifiedBy || null,
      ]
    );
    return this.getSource(result.rows[0].id);
  },

  async updateSource(id, patch) {
    const pool = getPool();
    const current = await this.getSource(id);
    if (!current) return null;

    const next = {
      organizationName: patch.organizationName ?? current.organizationName,
      shortName: patch.shortName !== undefined ? patch.shortName : current.shortName,
      agencyType: patch.agencyType ?? current.agencyType,
      jurisdictionLevel: patch.jurisdictionLevel ?? current.jurisdictionLevel,
      stateId: patch.stateId !== undefined ? patch.stateId : current.stateId,
      officialWebsite: patch.officialWebsite !== undefined ? patch.officialWebsite : current.officialWebsite,
      feedUrl: patch.feedUrl !== undefined ? patch.feedUrl : current.feedUrl,
      ingestionMethod: patch.ingestionMethod ?? current.ingestionMethod,
      providerKey: patch.providerKey ?? current.providerKey,
      status: patch.status ?? current.status,
      verificationStatus: patch.verificationStatus ?? current.verificationStatus,
      syncIntervalMinutes: patch.syncIntervalMinutes ?? current.syncIntervalMinutes,
      config: patch.config !== undefined ? patch.config : current.config,
      notes: patch.notes !== undefined ? patch.notes : current.notes,
    };

    await pool.query(
      `UPDATE official_sources SET
         organization_name = $2,
         short_name = $3,
         agency_type = $4,
         jurisdiction_level = $5,
         state_id = $6,
         official_website = $7,
         feed_url = $8,
         ingestion_method = $9,
         provider_key = $10,
         status = $11,
         verification_status = $12,
         sync_interval_minutes = $13,
         config = $14::jsonb,
         notes = $15,
         verified_at = CASE
           WHEN $12::official_verification_status = 'verified'
                AND verification_status IS DISTINCT FROM 'verified'::official_verification_status
           THEN NOW()
           ELSE verified_at
         END,
         verified_by = COALESCE($16, verified_by),
         updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        next.organizationName,
        next.shortName,
        next.agencyType,
        next.jurisdictionLevel,
        next.stateId,
        next.officialWebsite,
        next.feedUrl,
        next.ingestionMethod,
        next.providerKey,
        next.status,
        next.verificationStatus,
        next.syncIntervalMinutes,
        JSON.stringify(next.config || {}),
        next.notes,
        patch.verifiedBy || null,
      ]
    );
    return this.getSource(id);
  },

  async listDueSources(now = new Date()) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT ${SOURCE_SELECT}
       FROM official_sources s
       LEFT JOIN states st ON st.id = s.state_id
       WHERE s.status = 'active'
         AND s.verification_status = 'verified'
         AND (
           s.last_attempt_at IS NULL
           OR s.last_attempt_at + (s.sync_interval_minutes || ' minutes')::interval <= $1::timestamptz
         )
       ORDER BY s.last_attempt_at ASC NULLS FIRST`,
      [now.toISOString()]
    );
    return result.rows.map(mapSource);
  },

  async upsertUpdate(update) {
    const pool = getPool();
    const result = await pool.query(
      `WITH prior AS (
         SELECT content_hash
         FROM official_updates
         WHERE source_id = $1 AND dedupe_key = $3
       ),
       upserted AS (
         INSERT INTO official_updates (
           source_id, external_id, dedupe_key, title, summary, body, original_url,
           category, jurisdiction_level, state_id, location_id, status, image_url,
           published_at, retrieved_at, source_metadata, content_hash
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),$15::jsonb,$16
         )
         ON CONFLICT (source_id, dedupe_key)
         DO UPDATE SET
           external_id = COALESCE(EXCLUDED.external_id, official_updates.external_id),
           title = EXCLUDED.title,
           summary = EXCLUDED.summary,
           body = COALESCE(EXCLUDED.body, official_updates.body),
           original_url = COALESCE(EXCLUDED.original_url, official_updates.original_url),
           category = EXCLUDED.category,
           jurisdiction_level = EXCLUDED.jurisdiction_level,
           state_id = COALESCE(EXCLUDED.state_id, official_updates.state_id),
           location_id = COALESCE(EXCLUDED.location_id, official_updates.location_id),
           status = EXCLUDED.status,
           image_url = COALESCE(EXCLUDED.image_url, official_updates.image_url),
           published_at = COALESCE(EXCLUDED.published_at, official_updates.published_at),
           retrieved_at = NOW(),
           source_metadata = EXCLUDED.source_metadata,
           content_hash = EXCLUDED.content_hash,
           updated_at = NOW()
         RETURNING id, (xmax = 0) AS inserted
       )
       SELECT
         u.id,
         u.inserted,
         CASE
           WHEN u.inserted THEN TRUE
           WHEN (SELECT content_hash FROM prior) IS DISTINCT FROM $16 THEN TRUE
           ELSE FALSE
         END AS changed
       FROM upserted u`,
      [
        update.sourceId,
        update.externalId,
        update.dedupeKey,
        update.title,
        update.summary,
        update.body,
        update.originalUrl,
        update.category,
        update.jurisdictionLevel,
        update.stateId,
        update.locationId,
        update.status,
        update.imageUrl,
        update.publishedAt,
        JSON.stringify(update.sourceMetadata || {}),
        update.contentHash || null,
      ]
    );
    const row = result.rows[0];
    return {
      id: row.id,
      inserted: row.inserted === true,
      changed: row.changed === true,
    };
  },

  async getUpdateById(id) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT ${UPDATE_SELECT}
       FROM official_updates u
       JOIN official_sources s ON s.id = u.source_id
       LEFT JOIN states st ON st.id = u.state_id
       LEFT JOIN locations loc ON loc.id = u.location_id
       WHERE u.id = $1`,
      [id]
    );
    return mapUpdate(result.rows[0]);
  },

  async listUpdates({
    category = null,
    sourceId = null,
    jurisdiction = null,
    locationId = null,
    stateId = null,
    from = null,
    to = null,
    freshnessHours = null,
    page = 1,
    limit = 20,
  } = {}) {
    const pool = getPool();
    const offset = (page - 1) * limit;
    const result = await pool.query(
      `SELECT ${UPDATE_SELECT},
              COUNT(*) OVER()::int AS total_count
       FROM official_updates u
       JOIN official_sources s ON s.id = u.source_id
       LEFT JOIN states st ON st.id = u.state_id
       LEFT JOIN locations loc ON loc.id = u.location_id
       WHERE u.status = 'published'
         AND s.status = 'active'
         AND ($1::official_update_category IS NULL OR u.category = $1)
         AND ($2::text IS NULL OR u.source_id = $2)
         AND ($3::official_jurisdiction_level IS NULL OR u.jurisdiction_level = $3)
         AND ($4::uuid IS NULL OR u.location_id = $4)
         AND ($5::uuid IS NULL OR u.state_id = $5 OR s.state_id = $5)
         AND ($6::timestamptz IS NULL OR COALESCE(u.published_at, u.retrieved_at) >= $6)
         AND ($7::timestamptz IS NULL OR COALESCE(u.published_at, u.retrieved_at) <= $7)
         AND (
           $8::int IS NULL
           OR COALESCE(u.published_at, u.retrieved_at) >= NOW() - ($8 || ' hours')::interval
         )
       ORDER BY COALESCE(u.published_at, u.retrieved_at) DESC, u.retrieved_at DESC
       LIMIT $9 OFFSET $10`,
      [
        category,
        sourceId,
        jurisdiction,
        locationId,
        stateId,
        from,
        to,
        freshnessHours,
        limit,
        offset,
      ]
    );

    const total = result.rows[0]?.total_count || 0;
    return {
      items: result.rows.map(mapUpdate),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  },

  async nearbyUpdates({ lat, lng, radiusKm = 50, limit = 20, category = null }) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT ${UPDATE_SELECT},
              (
                6371 * acos(
                  least(1.0, greatest(-1.0,
                    cos(radians($1)) * cos(radians(loc.latitude)) *
                    cos(radians(loc.longitude) - radians($2)) +
                    sin(radians($1)) * sin(radians(loc.latitude))
                  ))
                )
              ) AS distance_km
       FROM official_updates u
       JOIN official_sources s ON s.id = u.source_id
       JOIN locations loc ON loc.id = u.location_id
       LEFT JOIN states st ON st.id = u.state_id
       WHERE u.status = 'published'
         AND s.status = 'active'
         AND u.location_id IS NOT NULL
         AND loc.latitude IS NOT NULL
         AND loc.longitude IS NOT NULL
         AND ($4::official_update_category IS NULL OR u.category = $4)
       ORDER BY distance_km ASC, COALESCE(u.published_at, u.retrieved_at) DESC
       LIMIT $3`,
      [lat, lng, limit, category]
    );

    return result.rows
      .filter((row) => Number(row.distance_km) <= radiusKm)
      .map((row) => ({
        ...mapUpdate(row),
        distanceKm: Number(Number(row.distance_km).toFixed(2)),
      }));
  },

  async listForLocationContext({ locationId = null, stateId = null, limit = 10 } = {}) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT ${UPDATE_SELECT}
       FROM official_updates u
       JOIN official_sources s ON s.id = u.source_id
       LEFT JOIN states st ON st.id = u.state_id
       LEFT JOIN locations loc ON loc.id = u.location_id
       WHERE u.status = 'published'
         AND s.status = 'active'
         AND (
           u.jurisdiction_level = 'national'
           OR ($1::uuid IS NOT NULL AND u.state_id = $1)
           OR ($1::uuid IS NOT NULL AND s.state_id = $1)
           OR ($2::uuid IS NOT NULL AND u.location_id = $2)
         )
       ORDER BY
         CASE
           WHEN $2::uuid IS NOT NULL AND u.location_id = $2 THEN 0
           WHEN $1::uuid IS NOT NULL AND (u.state_id = $1 OR s.state_id = $1) THEN 1
           WHEN u.jurisdiction_level = 'national' THEN 2
           ELSE 3
         END,
         COALESCE(u.published_at, u.retrieved_at) DESC
       LIMIT $3`,
      [stateId, locationId, limit]
    );
    return result.rows.map(mapUpdate);
  },

  async createSyncRun(run) {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO official_sync_runs (
         source_id, status, started_at, completed_at,
         retrieved_count, added_count, updated_count, skipped_count, rejected_count,
         error_message, details, trigger_reason
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
       RETURNING *`,
      [
        run.sourceId,
        run.status,
        run.startedAt,
        run.completedAt,
        run.retrievedCount || 0,
        run.addedCount || 0,
        run.updatedCount || 0,
        run.skippedCount || 0,
        run.rejectedCount || 0,
        run.errorMessage || null,
        JSON.stringify(run.details || {}),
        run.triggerReason || null,
      ]
    );
    return result.rows[0];
  },

  async markSourceAttempt(sourceId, { success, errorMessage = null }) {
    const pool = getPool();
    if (success) {
      const result = await pool.query(
        `UPDATE official_sources SET
           last_attempt_at = NOW(),
           last_success_at = NOW(),
           consecutive_failures = 0,
           last_error_message = NULL,
           health_status = 'healthy',
           updated_at = NOW()
         WHERE id = $1
         RETURNING consecutive_failures, health_status`,
        [sourceId]
      );
      return {
        consecutiveFailures: result.rows[0]?.consecutive_failures ?? 0,
        healthStatus: result.rows[0]?.health_status || 'healthy',
      };
    }

    const result = await pool.query(
      `UPDATE official_sources SET
         last_attempt_at = NOW(),
         last_failure_at = NOW(),
         consecutive_failures = consecutive_failures + 1,
         last_error_message = $2,
         health_status = CASE
           WHEN consecutive_failures + 1 >= 3 THEN 'failing'::official_source_health
           ELSE 'warning'::official_source_health
         END,
         updated_at = NOW()
       WHERE id = $1
       RETURNING consecutive_failures, health_status`,
      [sourceId, errorMessage]
    );
    return {
      consecutiveFailures: result.rows[0]?.consecutive_failures ?? 0,
      healthStatus: result.rows[0]?.health_status || 'failing',
    };
  },

  async suspendSource(sourceId, reason) {
    const pool = getPool();
    await pool.query(
      `UPDATE official_sources SET
         status = 'suspended',
         health_status = 'disabled',
         notes = CASE
           WHEN notes IS NULL OR notes = '' THEN $2
           ELSE notes || E'\n' || $2
         END,
         updated_at = NOW()
       WHERE id = $1 AND status = 'active'`,
      [sourceId, reason]
    );
  },

  async listSyncRuns({
    sourceId = null,
    status = null,
    from = null,
    to = null,
    page = 1,
    limit = 30,
  } = {}) {
    const pool = getPool();
    const offset = (Math.max(1, page) - 1) * Math.min(limit, 100);
    const result = await pool.query(
      `SELECT r.*, s.organization_name, s.short_name,
              COUNT(*) OVER()::int AS total_count
       FROM official_sync_runs r
       JOIN official_sources s ON s.id = r.source_id
       WHERE ($1::text IS NULL OR r.source_id = $1)
         AND ($2::official_sync_status IS NULL OR r.status = $2)
         AND ($3::timestamptz IS NULL OR r.started_at >= $3::timestamptz)
         AND ($4::timestamptz IS NULL OR r.started_at <= $4::timestamptz)
       ORDER BY r.started_at DESC
       LIMIT $5 OFFSET $6`,
      [sourceId, status, from, to, Math.min(limit, 100), offset]
    );
    return {
      total: result.rows[0]?.total_count || 0,
      page,
      limit: Math.min(limit, 100),
      items: result.rows.map((row) => ({
        id: row.id,
        sourceId: row.source_id,
        sourceName: row.short_name || row.organization_name,
        status: row.status,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        retrievedCount: row.retrieved_count,
        addedCount: row.added_count,
        updatedCount: row.updated_count,
        skippedCount: row.skipped_count,
        rejectedCount: row.rejected_count || 0,
        errorMessage: row.error_message,
        triggerReason: row.trigger_reason,
        details: row.details || {},
      })),
    };
  },

  async getAdminStatus() {
    const pool = getPool();
    const [sources, recentRuns, counts] = await Promise.all([
      this.listSources({ includeInactive: true }),
      pool.query(
        `SELECT id, source_id, status, started_at, completed_at,
                retrieved_count, added_count, updated_count, skipped_count, error_message
         FROM official_sync_runs
         ORDER BY started_at DESC
         LIMIT 30`
      ),
      pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM official_sources) AS sources,
           (SELECT COUNT(*)::int FROM official_sources WHERE status = 'active') AS active_sources,
           (SELECT COUNT(*)::int FROM official_updates WHERE status = 'published') AS published_updates`
      ),
    ]);

    return {
      counts: counts.rows[0],
      sources,
      recentRuns: recentRuns.rows.map((row) => ({
        id: row.id,
        sourceId: row.source_id,
        status: row.status,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        retrievedCount: row.retrieved_count,
        addedCount: row.added_count,
        updatedCount: row.updated_count,
        skippedCount: row.skipped_count,
        errorMessage: row.error_message,
      })),
    };
  },
};
