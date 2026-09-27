/**
 * Admin operations for Government & Official Updates.
 * Extends officialRepository — review queue, agency profile, source health, manual entry.
 */
import { createHash } from 'crypto';
import { getPool } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { adminAuditRepository } from '../repositories/adminAuditRepository.js';
import { officialRepository } from '../repositories/officialRepository.js';
import { buildDedupeKey } from '../middleware/officialAdmin.js';
import { assertSafeIngestionUrl } from '../ingestion/urlPolicy.js';
import { sanitizeOfficialText, hashOfficialContent } from '../ingestion/sanitize.js';
import { isValidCategory, isValidPriority } from '../config/official.js';
import { computeSourceHealth } from '../ingestion/sourceHealth.js';
import { assessOfficialScope, scopeAssessmentLabel } from '../utils/officialScope.js';

function normalizeTitle(title) {
  return String(title || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 300);
}

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

function requireReason(body, min = 3) {
  if (!body?.reason || String(body.reason).trim().length < min) {
    throw new AppError('A reason is required.', 400, 'VALIDATION_ERROR');
  }
  return String(body.reason).trim();
}

export const officialAdminService = {
  normalizeTitle,

  async sourceHealth() {
    const sources = await officialRepository.listSources({ includeInactive: true });
    const pool = getPool();
    const runs = await pool.query(
      `SELECT DISTINCT ON (source_id)
         source_id, status, started_at, completed_at, retrieved_count, added_count,
         updated_count, skipped_count, rejected_count, error_message, trigger_reason
       FROM official_sync_runs
       ORDER BY source_id, started_at DESC`
    );
    const bySource = new Map(runs.rows.map((r) => [r.source_id, r]));

    const items = sources.map((s) => {
      const last = bySource.get(s.id) || null;
      const health =
        s.healthStatus && s.healthStatus !== 'unknown'
          ? s.healthStatus
          : computeSourceHealth(s);
      return {
        id: s.id,
        organizationName: s.organizationName,
        shortName: s.shortName,
        agencyType: s.agencyType,
        ingestionMethod: s.ingestionMethod,
        status: s.status,
        verificationStatus: s.verificationStatus,
        healthStatus: health,
        neverSynchronized: !s.lastAttemptAt,
        lastAttemptAt: s.lastAttemptAt,
        lastSuccessAt: s.lastSuccessAt,
        lastFailureAt: s.lastFailureAt,
        lastErrorMessage: s.lastErrorMessage,
        consecutiveFailures: s.consecutiveFailures,
        syncIntervalMinutes: s.syncIntervalMinutes,
        lastRun: last
          ? {
              status: last.status,
              startedAt: last.started_at,
              completedAt: last.completed_at,
              retrieved: last.retrieved_count,
              created: last.added_count,
              updated: last.updated_count,
              duplicatesIgnored: last.skipped_count,
              rejected: last.rejected_count,
              errorMessage: last.error_message,
              trigger: last.trigger_reason,
            }
          : null,
        // Never expose config / credentials
      };
    });

    const counts = {
      healthy: items.filter((i) => i.healthStatus === 'healthy').length,
      warning: items.filter((i) => i.healthStatus === 'warning').length,
      failing: items.filter((i) => i.healthStatus === 'failing').length,
      disabled: items.filter((i) => i.healthStatus === 'disabled' || i.status === 'disabled').length,
      neverSynchronized: items.filter((i) => i.neverSynchronized).length,
      total: items.length,
      activeSources: items.filter((i) => i.status === 'active').length,
    };

    const updateCounts = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'published')::int AS published_updates,
         COUNT(*) FILTER (WHERE status = 'pending_review')::int AS pending_updates,
         COUNT(*) FILTER (
           WHERE status = 'published'
             AND COALESCE(published_at, retrieved_at) >= CURRENT_DATE
         )::int AS updates_today,
         COUNT(*) FILTER (
           WHERE status = 'published' AND priority = 'critical'
         )::int AS critical_updates,
         COUNT(*) FILTER (
           WHERE status = 'published'
             AND expires_at IS NOT NULL
             AND expires_at > NOW()
             AND expires_at <= NOW() + INTERVAL '48 hours'
         )::int AS expiring_updates,
         COUNT(*) FILTER (
           WHERE status = 'published'
             AND expires_at IS NOT NULL
             AND expires_at <= NOW()
         )::int AS expired_updates,
         COUNT(*) FILTER (
           WHERE status = 'published' AND scope_assessment = 'needs_review'
         )::int AS flagged_updates
       FROM official_updates`
    );
    const u = updateCounts.rows[0] || {};

    return {
      items,
      counts: {
        ...counts,
        publishedUpdates: u.published_updates || 0,
        pendingUpdates: u.pending_updates || 0,
        updatesToday: u.updates_today || 0,
        criticalUpdates: u.critical_updates || 0,
        expiringUpdates: u.expiring_updates || 0,
        expiredUpdates: u.expired_updates || 0,
        flaggedUpdates: u.flagged_updates || 0,
        failedSources: counts.failing,
      },
    };
  },

  async getAgencyProfile(id) {
    const source = await officialRepository.getSource(id);
    if (!source) throw new AppError('Official source not found.', 404, 'NOT_FOUND');

    const pool = getPool();
    const [counts, recentRuns, recentUpdates] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)::int AS published_total,
           COUNT(*) FILTER (WHERE status = 'published')::int AS active_published,
           COUNT(*) FILTER (WHERE status = 'pending_review')::int AS pending_review,
           COUNT(*) FILTER (
             WHERE status = 'published'
               AND COALESCE(published_at, retrieved_at) < NOW() - INTERVAL '7 days'
           )::int AS stale_published,
           COUNT(*) FILTER (WHERE status = 'archived')::int AS archived,
           COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
         FROM official_updates WHERE source_id = $1`,
        [id]
      ),
      pool.query(
        `SELECT id, status, started_at, completed_at, retrieved_count, added_count,
                updated_count, skipped_count, rejected_count, error_message, trigger_reason
         FROM official_sync_runs
         WHERE source_id = $1
         ORDER BY started_at DESC LIMIT 15`,
        [id]
      ),
      pool.query(
        `SELECT id, title, category, status, published_at, retrieved_at, entry_origin
         FROM official_updates
         WHERE source_id = $1
         ORDER BY COALESCE(published_at, retrieved_at) DESC
         LIMIT 20`,
        [id]
      ),
    ]);

    const c = counts.rows[0] || {};
    const health =
      source.healthStatus && source.healthStatus !== 'unknown'
        ? source.healthStatus
        : computeSourceHealth(source);

    return {
      source: {
        id: source.id,
        organizationName: source.organizationName,
        shortName: source.shortName,
        agencyType: source.agencyType,
        jurisdictionLevel: source.jurisdictionLevel,
        stateId: source.stateId,
        stateName: source.stateName,
        officialWebsite: source.officialWebsite,
        feedUrl: source.feedUrl,
        ingestionMethod: source.ingestionMethod,
        providerKey: source.providerKey,
        status: source.status,
        verificationStatus: source.verificationStatus,
        syncIntervalMinutes: source.syncIntervalMinutes,
        healthStatus: health,
        lastSuccessAt: source.lastSuccessAt,
        lastAttemptAt: source.lastAttemptAt,
        lastFailureAt: source.lastFailureAt,
        lastErrorMessage: source.lastErrorMessage,
        consecutiveFailures: source.consecutiveFailures,
        notes: source.notes,
        createdAt: source.createdAt,
        updatedAt: source.updatedAt,
        // config omitted — may contain secrets
      },
      metrics: {
        publishedTotal: c.published_total || 0,
        activeUpdates: c.active_published || 0,
        pendingReview: c.pending_review || 0,
        staleUpdates: c.stale_published || 0,
        archived: c.archived || 0,
        rejected: c.rejected || 0,
      },
      recentRuns: recentRuns.rows.map((r) => ({
        id: r.id,
        status: r.status,
        startedAt: r.started_at,
        completedAt: r.completed_at,
        retrieved: r.retrieved_count,
        created: r.added_count,
        updated: r.updated_count,
        duplicatesIgnored: r.skipped_count,
        rejected: r.rejected_count,
        errorMessage: r.error_message,
        trigger: r.trigger_reason,
      })),
      recentUpdates: recentUpdates.rows.map((u) => ({
        id: u.id,
        title: u.title,
        category: u.category,
        status: u.status,
        publishedAt: u.published_at,
        retrievedAt: u.retrieved_at,
        entryOrigin: u.entry_origin,
      })),
      trustNote:
        'Official source classification means the organization is an approved public institution. It does not make every related community report official.',
    };
  },

  async reviewQueue({ page = 1, limit = 30, q, sourceId, kind } = {}) {
    const pool = getPool();
    const lim = Math.min(Number(limit) || 30, 100);
    const off = Math.max((Number(page) || 1) - 1, 0) * lim;
    const params = [];
    const where = [`u.status = 'pending_review'`];

    if (q) {
      params.push(`%${String(q).trim()}%`);
      where.push(`(u.title ILIKE $${params.length} OR u.summary ILIKE $${params.length})`);
    }
    if (sourceId) {
      params.push(sourceId);
      where.push(`u.source_id = $${params.length}`);
    }
    if (kind === 'manual') {
      where.push(`u.entry_origin = 'admin_manual'`);
    } else if (kind === 'ingested') {
      where.push(`u.entry_origin = 'ingested'`);
    }

    const whereSql = where.join(' AND ');
    params.push(lim, off);

    const result = await pool.query(
      `SELECT u.id, u.title, u.summary, u.category, u.status, u.entry_origin,
              u.published_at, u.retrieved_at, u.received_at, u.original_url,
              u.location_id, u.state_id, u.source_id,
              s.organization_name, s.short_name, s.agency_type,
              loc.name AS location_name, st.name AS state_name,
              COUNT(*) OVER()::int AS total_count
       FROM official_updates u
       JOIN official_sources s ON s.id = u.source_id
       LEFT JOIN locations loc ON loc.id = u.location_id
       LEFT JOIN states st ON st.id = u.state_id
       WHERE ${whereSql}
       ORDER BY u.retrieved_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const failed = await pool.query(
      `SELECT id, source_id, status, started_at, error_message, trigger_reason
       FROM official_sync_runs
       WHERE status = 'failed' AND started_at >= NOW() - INTERVAL '7 days'
       ORDER BY started_at DESC LIMIT 20`
    );

    const nearDupes = await this.nearDuplicateCandidates({ limit: 15 });

    return {
      items: result.rows.map((r) => ({
        id: r.id,
        title: r.title,
        summary: r.summary,
        category: r.category,
        status: r.status,
        entryOrigin: r.entry_origin,
        publishedAt: r.published_at,
        retrievedAt: r.retrieved_at,
        receivedAt: r.received_at,
        originalUrl: r.original_url,
        source: {
          id: r.source_id,
          organizationName: r.organization_name,
          shortName: r.short_name,
          agencyType: r.agency_type,
        },
        location: {
          id: r.location_id,
          name: r.location_name,
          stateName: r.state_name,
        },
        badge: 'OFFICIAL',
        trustNote: 'Pending review — not yet published to the public feed.',
      })),
      total: result.rows[0]?.total_count || 0,
      page: Number(page) || 1,
      limit: lim,
      failedIngestions: failed.rows.map((r) => ({
        id: r.id,
        sourceId: r.source_id,
        status: r.status,
        startedAt: r.started_at,
        errorMessage: r.error_message,
        trigger: r.trigger_reason,
      })),
      nearDuplicates: nearDupes,
      note: 'Review does not rewrite agency wording. Approve publishes; reject archives privately.',
    };
  },

  async nearDuplicateCandidates({ limit = 20 } = {}) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT a.id AS id_a, b.id AS id_b, a.source_id, a.title AS title_a, b.title AS title_b,
              a.published_at AS published_a, b.published_at AS published_b,
              a.status AS status_a, b.status AS status_b
       FROM official_updates a
       JOIN official_updates b
         ON a.source_id = b.source_id
        AND a.id < b.id
        AND a.title_normalized IS NOT NULL
        AND a.title_normalized = b.title_normalized
        AND COALESCE(a.published_at, a.retrieved_at) >= COALESCE(b.published_at, b.retrieved_at) - INTERVAL '48 hours'
        AND COALESCE(a.published_at, a.retrieved_at) <= COALESCE(b.published_at, b.retrieved_at) + INTERVAL '48 hours'
       WHERE a.status NOT IN ('rejected', 'withdrawn')
         AND b.status NOT IN ('rejected', 'withdrawn')
         AND a.dedupe_key IS DISTINCT FROM b.dedupe_key
       ORDER BY COALESCE(a.published_at, a.retrieved_at) DESC
       LIMIT $1`,
      [Math.min(Number(limit) || 20, 50)]
    );
    return result.rows.map((r) => ({
      sourceId: r.source_id,
      updates: [
        { id: r.id_a, title: r.title_a, publishedAt: r.published_a, status: r.status_a },
        { id: r.id_b, title: r.title_b, publishedAt: r.published_b, status: r.status_b },
      ],
      signal: 'same_source_normalized_title_within_48h',
      note: 'Review signal only — not auto-deleted.',
    }));
  },

  async getUpdateDetail(id) {
    const item = await officialRepository.getUpdateById(id);
    if (!item) throw new AppError('Official update not found.', 404, 'NOT_FOUND');
    const areas = await officialRepository.listUpdateAreas(id);
    const pool = getPool();
    const audits = await pool
      .query(
        `SELECT action, reason, previous_state, new_state, created_at
         FROM admin_audit_log
         WHERE entity_type = 'official_update' AND entity_id = $1
         ORDER BY created_at DESC LIMIT 30`,
        [id]
      )
      .catch(() => ({ rows: [] }));

    return {
      item: { ...item, areas, receivedAt: item.receivedAt || item.retrievedAt },
      adminActivity: audits.rows.map((a) => ({
        action: a.action,
        reason: a.reason,
        previousState: a.previous_state,
        newState: a.new_state,
        createdAt: a.created_at,
      })),
      note: 'Source-originated wording is preserved. Metadata corrections are audited.',
    };
  },

  async approveUpdate(admin, id, body, req) {
    const reason = requireReason(body);
    const pool = getPool();
    const prev = await pool.query(
      `SELECT id, status, title, source_id FROM official_updates WHERE id = $1`,
      [id]
    );
    if (!prev.rows[0]) throw new AppError('Official update not found.', 404, 'NOT_FOUND');
    if (!['pending_review', 'archived', 'rejected'].includes(prev.rows[0].status)) {
      throw new AppError('Update is not awaiting publish.', 400, 'INVALID_STATE');
    }
    await pool.query(
      `UPDATE official_updates SET
         status = 'published',
         reviewed_at = NOW(),
         reviewed_by = $2,
         review_notes = $3,
         updated_at = NOW()
       WHERE id = $1`,
      [id, admin.userId || admin.id || null, reason]
    );
    await writeAudit(
      admin,
      {
        action: 'official_update.publish',
        entityType: 'official_update',
        entityId: id,
        previousState: { status: prev.rows[0].status },
        newState: { status: 'published' },
        reason,
      },
      req
    );
    const detail = await this.getUpdateDetail(id);
    try {
      const { notificationService, safeNotify } = await import('./notificationService.js');
      const update = detail.item || detail.update || detail;
      safeNotify(
        notificationService.notifyOfficialUpdate(
          {
            id: update.id,
            title: update.title,
            summary: update.summary,
            body: update.body,
            priority: update.priority || 'important',
            category: update.category,
            sourceId: update.sourceId,
            source: update.source,
            locationId: update.locationId,
            stateId: update.stateId,
          },
          { locationId: update.locationId, actorUserId: admin.userId || admin.id }
        )
      );
    } catch {
      // never fail publish on notify
    }
    return detail;
  },

  async rejectUpdate(admin, id, body, req) {
    const reason = requireReason(body);
    const pool = getPool();
    const prev = await pool.query(
      `SELECT id, status FROM official_updates WHERE id = $1`,
      [id]
    );
    if (!prev.rows[0]) throw new AppError('Official update not found.', 404, 'NOT_FOUND');
    await pool.query(
      `UPDATE official_updates SET
         status = 'rejected',
         reviewed_at = NOW(),
         reviewed_by = $2,
         review_notes = $3,
         updated_at = NOW()
       WHERE id = $1`,
      [id, admin.userId || admin.id || null, reason]
    );
    await writeAudit(
      admin,
      {
        action: 'official_update.reject',
        entityType: 'official_update',
        entityId: id,
        previousState: { status: prev.rows[0].status },
        newState: { status: 'rejected' },
        reason,
      },
      req
    );
    return this.getUpdateDetail(id);
  },

  async correctMetadata(admin, id, body, req) {
    const reason = requireReason(body);
    const pool = getPool();
    const prev = await pool.query(
      `SELECT id, category, jurisdiction_level, state_id, location_id, status, title
       FROM official_updates WHERE id = $1`,
      [id]
    );
    if (!prev.rows[0]) throw new AppError('Official update not found.', 404, 'NOT_FOUND');
    const row = prev.rows[0];

    if (body.category != null && !isValidCategory(body.category)) {
      throw new AppError('Invalid category.', 400, 'VALIDATION_ERROR');
    }

    // Do not allow rewriting title/body via this path — source wording preserved
    if (body.title != null || body.body != null || body.summary != null) {
      throw new AppError(
        'Source title/body cannot be rewritten here. Correct metadata only.',
        400,
        'VALIDATION_ERROR'
      );
    }

    const nextCategory = body.category ?? row.category;
    const nextJurisdiction = body.jurisdictionLevel ?? row.jurisdiction_level;
    const nextStateId = body.stateId !== undefined ? body.stateId : row.state_id;
    const nextLocationId = body.locationId !== undefined ? body.locationId : row.location_id;

    await pool.query(
      `UPDATE official_updates SET
         category = $2,
         jurisdiction_level = $3,
         state_id = $4,
         location_id = $5,
         updated_at = NOW()
       WHERE id = $1`,
      [id, nextCategory, nextJurisdiction, nextStateId, nextLocationId]
    );

    if (Array.isArray(body.areaLocationIds)) {
      await officialRepository.replaceUpdateAreas(id, {
        locationIds: body.areaLocationIds,
        stateIds: body.areaStateIds || [],
        primaryLocationId: nextLocationId,
        primaryStateId: nextStateId,
      });
    }

    await writeAudit(
      admin,
      {
        action: 'official_update.correct_metadata',
        entityType: 'official_update',
        entityId: id,
        previousState: {
          category: row.category,
          jurisdictionLevel: row.jurisdiction_level,
          stateId: row.state_id,
          locationId: row.location_id,
        },
        newState: {
          category: nextCategory,
          jurisdictionLevel: nextJurisdiction,
          stateId: nextStateId,
          locationId: nextLocationId,
        },
        reason,
      },
      req
    );
    return this.getUpdateDetail(id);
  },

  /**
   * Manual official-source information entry (not freeform news).
   * Marked admin_manual; defaults to pending_review unless publishNow + permission path.
   */
  async createManualUpdate(admin, body, req) {
    const reason = requireReason(body);
    const sourceId = String(body.sourceId || '').trim();
    if (!sourceId) throw new AppError('sourceId is required.', 400, 'VALIDATION_ERROR');

    const source = await officialRepository.getSource(sourceId);
    if (!source) throw new AppError('Official source not found.', 404, 'NOT_FOUND');
    if (!['active', 'approved'].includes(source.status) || source.verificationStatus !== 'verified') {
      throw new AppError(
        'Manual updates require a verified, approved/active agency source.',
        400,
        'INVALID_SOURCE'
      );
    }

    const title = sanitizeOfficialText(body.title, { maxLength: 300 });
    const summary = sanitizeOfficialText(body.summary, { maxLength: 2000 });
    const bodyText = sanitizeOfficialText(body.body, { maxLength: 20000 });
    if (!title || title.length < 3) {
      throw new AppError('Title must be at least 3 characters.', 400, 'VALIDATION_ERROR');
    }
    const category = body.category || 'other';
    if (!isValidCategory(category)) {
      throw new AppError('Invalid category.', 400, 'VALIDATION_ERROR');
    }

    let originalUrl = body.originalUrl || body.sourceUrl || null;
    if (originalUrl) {
      originalUrl = assertSafeIngestionUrl(originalUrl, 'originalUrl', {
        requireAllowlist: true,
        allowLocalhost: process.env.INGESTION_ALLOW_LOCALHOST === 'true',
      });
    }

    const publishedAt = body.publishedAt ? new Date(body.publishedAt) : new Date();
    if (Number.isNaN(publishedAt.getTime())) {
      throw new AppError('Invalid publishedAt.', 400, 'VALIDATION_ERROR');
    }
    if (publishedAt.getTime() > Date.now() + 60_000) {
      throw new AppError('publishedAt cannot be in the future.', 400, 'VALIDATION_ERROR');
    }

    const externalId = body.externalId
      ? String(body.externalId).trim().slice(0, 200)
      : `manual:${createHash('sha256')
          .update(`${sourceId}|${normalizeTitle(title)}|${publishedAt.toISOString()}`)
          .digest('hex')
          .slice(0, 32)}`;

    const dedupeKey = buildDedupeKey({
      externalId,
      originalUrl,
      title,
      publishedAt: publishedAt.toISOString(),
    });

    const contentHash = hashOfficialContent({ title, summary, body: bodyText });
    const titleNorm = normalizeTitle(title);
    const scopeAssessment = assessOfficialScope({
      title,
      summary,
      body: bodyText,
      category,
    });
    const priority = isValidPriority(body.priority) ? body.priority : 'normal';
    let effectiveAt = body.effectiveAt ? new Date(body.effectiveAt) : null;
    let expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (effectiveAt && Number.isNaN(effectiveAt.getTime())) effectiveAt = null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) expiresAt = null;

    const publishNow = body.publishNow === true && scopeAssessment === 'in_scope';
    const status = publishNow ? 'published' : 'pending_review';

    const pool = getPool();
    let inserted;
    try {
      const result = await pool.query(
        `INSERT INTO official_updates (
           source_id, external_id, dedupe_key, title, summary, body, original_url,
           category, jurisdiction_level, state_id, location_id, status, image_url,
           published_at, retrieved_at, received_at, source_metadata, content_hash,
           entry_origin, title_normalized, reviewed_at, reviewed_by, review_notes,
           priority, effective_at, expires_at, scope_assessment
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::official_update_status,$13,$14,NOW(),NOW(),$15::jsonb,$16,
           'admin_manual',$17,
           CASE WHEN $12::text = 'published' THEN NOW() ELSE NULL END,
           CASE WHEN $12::text = 'published' THEN $18::uuid ELSE NULL END,
           CASE WHEN $12::text = 'published' THEN $19 ELSE NULL END,
           $20::official_update_priority,$21,$22,$23::official_scope_assessment
         )
         RETURNING id`,
        [
          sourceId,
          externalId,
          dedupeKey,
          title,
          summary,
          bodyText,
          originalUrl,
          category,
          body.jurisdictionLevel || source.jurisdictionLevel || 'national',
          body.stateId || source.stateId || null,
          body.locationId || null,
          status,
          null,
          publishedAt.toISOString(),
          JSON.stringify({
            entryOrigin: 'admin_manual',
            attribution: 'Admin-entered official-source information',
            createdByAdmin: true,
            scopeAssessment,
          }),
          contentHash,
          titleNorm,
          admin.userId || admin.id || null,
          reason,
          priority,
          effectiveAt ? effectiveAt.toISOString() : null,
          expiresAt ? expiresAt.toISOString() : null,
          scopeAssessment,
        ]
      );
      inserted = result.rows[0].id;
    } catch (err) {
      if (err?.code === '23505') {
        throw new AppError(
          'A matching official update already exists (duplicate external id or content key).',
          409,
          'DUPLICATE'
        );
      }
      throw err;
    }

    await officialRepository.replaceUpdateAreas(inserted, {
      locationIds: body.areaLocationIds || (body.locationId ? [body.locationId] : []),
      stateIds: body.areaStateIds || (body.stateId ? [body.stateId] : []),
      primaryLocationId: body.locationId || null,
      primaryStateId: body.stateId || null,
    });

    await writeAudit(
      admin,
      {
        action: 'official_update.create_manual',
        entityType: 'official_update',
        entityId: inserted,
        newState: {
          sourceId,
          status,
          entryOrigin: 'admin_manual',
          attribution: 'Admin-entered official-source information',
        },
        reason,
      },
      req
    );

    return this.getUpdateDetail(inserted);
  },

  async listOrganizations({ q, active, limit = 100 } = {}) {
    const params = [];
    const where = [];
    if (q) {
      params.push(`%${String(q).trim()}%`);
      where.push(`(name ILIKE $${params.length} OR code ILIKE $${params.length} OR short_name ILIKE $${params.length})`);
    }
    if (active === true || active === 'true') where.push(`is_active = TRUE`);
    if (active === false || active === 'false') where.push(`is_active = FALSE`);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(Math.min(Number(limit) || 100, 200));
    const result = await getPool().query(
      `SELECT o.*,
              (SELECT COUNT(*)::int FROM official_sources s WHERE s.organization_id = o.id) AS source_count
       FROM official_organizations o
       ${whereSql}
       ORDER BY o.name ASC
       LIMIT $${params.length}`,
      params
    );
    return {
      items: result.rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        shortName: r.short_name,
        agencyType: r.agency_type,
        jurisdictionLevel: r.jurisdiction_level,
        stateId: r.state_id,
        officialWebsite: r.official_website,
        notes: r.notes,
        isActive: r.is_active,
        sourceCount: r.source_count,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    };
  },

  async expireDueUpdates() {
    const result = await getPool().query(
      `UPDATE official_updates
       SET processing_status = 'expired',
           updated_at = NOW()
       WHERE status = 'published'
         AND expires_at IS NOT NULL
         AND expires_at <= NOW()
         AND processing_status IS DISTINCT FROM 'expired'
       RETURNING id`
    );
    return { expired: result.rowCount || 0, ids: result.rows.map((r) => r.id) };
  },

  async correlateUpdates(admin, body, req) {
    const updateId = body.updateId;
    const relatedUpdateId = body.relatedUpdateId;
    const relationType = ['related', 'same_event', 'conflict', 'follow_up'].includes(body.relationType)
      ? body.relationType
      : 'related';
    if (!updateId || !relatedUpdateId) {
      throw new AppError('updateId and relatedUpdateId are required.', 400, 'VALIDATION_ERROR');
    }
    if (updateId === relatedUpdateId) {
      throw new AppError('Cannot correlate an update with itself.', 400, 'VALIDATION_ERROR');
    }
    const reason = body.reason ? String(body.reason).trim() : 'Cross-source correlation';
    const result = await getPool().query(
      `INSERT INTO official_update_correlations (
         update_id, related_update_id, relation_type, notes, created_by
       ) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [updateId, relatedUpdateId, relationType, body.notes || null, admin?.userId || admin?.id || null]
    );
    await writeAudit(
      admin,
      {
        action: 'official_update.correlate',
        entityType: 'official_update',
        entityId: updateId,
        newState: { relatedUpdateId, relationType },
        reason,
      },
      req
    );
    return { id: result.rows[0]?.id || null, updateId, relatedUpdateId, relationType };
  },

  async associateTrafficEvent(admin, id, body, req) {
    const reason = requireReason(body);
    const eventId = body.trafficEventId || body.relatedTrafficEventId || null;
    const prev = await this.getUpdateDetail(id);
    await getPool().query(
      `UPDATE official_updates
       SET related_traffic_event_id = $2, updated_at = NOW()
       WHERE id = $1`,
      [id, eventId]
    );
    await writeAudit(
      admin,
      {
        action: 'official_update.associate_traffic',
        entityType: 'official_update',
        entityId: id,
        previousState: { relatedTrafficEventId: prev.item?.relatedTrafficEventId || null },
        newState: { relatedTrafficEventId: eventId },
        reason,
      },
      req
    );
    return this.getUpdateDetail(id);
  },

  async setUpdatePriority(admin, id, body, req) {
    const reason = requireReason(body);
    const priority = body.priority || 'normal';
    if (!isValidPriority(priority)) {
      throw new AppError('Invalid priority.', 400, 'VALIDATION_ERROR');
    }
    const prev = await this.getUpdateDetail(id);
    await getPool().query(
      `UPDATE official_updates
       SET priority = $2::official_update_priority, updated_at = NOW()
       WHERE id = $1`,
      [id, priority]
    );
    await writeAudit(
      admin,
      {
        action: 'official_update.set_priority',
        entityType: 'official_update',
        entityId: id,
        previousState: { priority: prev.item?.priority },
        newState: { priority },
        reason,
      },
      req
    );
    return this.getUpdateDetail(id);
  },

  assessScopePreview(body = {}) {
    const assessment = assessOfficialScope(body);
    return {
      assessment,
      label: scopeAssessmentLabel(assessment),
      note: 'Heuristic only — administrators decide publication.',
    };
  },
};
