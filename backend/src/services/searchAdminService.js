/**
 * Admin Search & Discovery — analytics, aliases, index health.
 * Does not expose private user recent-search content.
 */
import { getPool } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { adminAuditRepository } from '../repositories/adminAuditRepository.js';
import { normalizeQuery } from './searchService.js';

async function writeAudit(admin, payload, req) {
  if (!admin?.userId && !admin?.id) return null;
  try {
    return await adminAuditRepository.create({
      actorUserId: admin.userId || admin.id,
      action: payload.action,
      entityType: payload.entityType,
      entityId: payload.entityId || null,
      previousState: payload.previousState || null,
      newState: payload.newState || null,
      reason: payload.reason || null,
      ipAddress: req?.ip || null,
      userAgent: req?.get?.('user-agent') || req?.headers?.['user-agent'] || null,
    });
  } catch {
    return null;
  }
}

export const searchAdminService = {
  async dashboard({ days = 7 } = {}) {
    const pool = getPool();
    const windowDays = Math.min(Math.max(Number(days) || 7, 1), 90);

    const [volume, zero, categories, latency, aliases, health, recentVolume] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE zero_result)::int AS zero_results,
           COUNT(*) FILTER (WHERE day = (CURRENT_DATE AT TIME ZONE 'Africa/Lagos')::date)::int AS today,
           COALESCE(AVG(latency_ms), 0)::int AS avg_latency_ms,
           COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms), 0)::int AS p95_latency_ms
         FROM search_query_metrics
         WHERE day >= ((CURRENT_DATE AT TIME ZONE 'Africa/Lagos')::date - ($1::int - 1))` ,
        [windowDays]
      ),
      pool.query(
        `SELECT normalized_query, COUNT(*)::int AS hits, MAX(created_at) AS last_seen
         FROM search_query_metrics
         WHERE zero_result = TRUE
           AND day >= ((CURRENT_DATE AT TIME ZONE 'Africa/Lagos')::date - ($1::int - 1))
         GROUP BY normalized_query
         ORDER BY hits DESC, last_seen DESC
         LIMIT 25`,
        [windowDays]
      ),
      pool.query(
        `SELECT COALESCE(category, 'all') AS category, COUNT(*)::int AS hits
         FROM search_query_metrics
         WHERE day >= ((CURRENT_DATE AT TIME ZONE 'Africa/Lagos')::date - ($1::int - 1))
         GROUP BY COALESCE(category, 'all')
         ORDER BY hits DESC
         LIMIT 12`,
        [windowDays]
      ),
      pool.query(
        `SELECT day::text, COUNT(*)::int AS searches,
                COUNT(*) FILTER (WHERE zero_result)::int AS zero_results,
                COALESCE(AVG(latency_ms), 0)::int AS avg_latency_ms
         FROM search_query_metrics
         WHERE day >= ((CURRENT_DATE AT TIME ZONE 'Africa/Lagos')::date - ($1::int - 1))
         GROUP BY day
         ORDER BY day DESC`,
        [windowDays]
      ),
      pool.query(`SELECT COUNT(*)::int AS count FROM search_aliases`),
      pool.query(`SELECT entity, indexed_count FROM search_index_health ORDER BY entity`),
      pool.query(
        `SELECT COUNT(*)::int AS active_recent
         FROM user_recent_searches
         WHERE created_at > NOW() - INTERVAL '30 days'`
      ),
    ]);

    const v = volume.rows[0] || {};
    return {
      architecture: {
        engine: 'postgresql',
        extensions: ['pg_trgm', 'postgis (locations)'],
        separateIndex: false,
        note: 'Live SQL against operational tables. No Elasticsearch/OpenSearch.',
      },
      windowDays,
      metrics: {
        searchesToday: Number(v.today) || 0,
        searchesWindow: Number(v.total) || 0,
        zeroResults: Number(v.zero_results) || 0,
        avgLatencyMs: Number(v.avg_latency_ms) || 0,
        p95LatencyMs: Number(v.p95_latency_ms) || 0,
        aliasCount: Number(aliases.rows[0]?.count) || 0,
        activeRecentSearches: Number(recentVolume.rows[0]?.active_recent) || 0,
      },
      categories: categories.rows,
      daily: latency.rows,
      zeroResultQueries: zero.rows.map((r) => ({
        query: r.normalized_query,
        hits: r.hits,
        lastSeen: r.last_seen,
      })),
      indexHealth: health.rows.map((r) => ({
        entity: r.entity,
        indexedCount: Number(r.indexed_count),
        status: 'live',
      })),
      rankingNote:
        'Relevance uses exact/prefix/trigram match, category hints, freshness, and optional distance. Civic/official content is never ranked by engagement or politics.',
    };
  },

  async listAliases({ q = null, limit = 100 } = {}) {
    const pool = getPool();
    const lim = Math.min(Math.max(Number(limit) || 100, 1), 200);
    const result = await pool.query(
      `SELECT id, alias, canonical, category, notes, created_at, updated_at
       FROM search_aliases
       WHERE ($1::text IS NULL
         OR lower(alias) LIKE '%' || lower($1) || '%'
         OR lower(canonical) LIKE '%' || lower($1) || '%')
       ORDER BY category NULLS LAST, alias
       LIMIT $2`,
      [q ? String(q).trim().slice(0, 80) : null, lim]
    );
    return {
      items: result.rows.map((r) => ({
        id: r.id,
        alias: r.alias,
        canonical: r.canonical,
        category: r.category,
        notes: r.notes,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    };
  },

  async upsertAlias(admin, body, req) {
    const alias = normalizeQuery(body.alias);
    const canonical = String(body.canonical || '').trim().slice(0, 120);
    if (!alias || alias.length < 2) {
      throw new AppError('Alias must be at least 2 characters.', 400, 'VALIDATION_ERROR');
    }
    if (!canonical || canonical.length < 2) {
      throw new AppError('Canonical form is required.', 400, 'VALIDATION_ERROR');
    }
    const reason = String(body.reason || '').trim();
    if (reason.length < 3) {
      throw new AppError('A reason is required.', 400, 'VALIDATION_ERROR');
    }
    const category = body.category ? String(body.category).trim().slice(0, 40) : null;
    const notes = body.notes ? String(body.notes).trim().slice(0, 500) : null;
    const pool = getPool();
    const existing = await pool.query(`SELECT * FROM search_aliases WHERE lower(alias) = $1`, [
      alias,
    ]);
    const result = await pool.query(
      `INSERT INTO search_aliases (alias, canonical, category, notes, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (alias) DO UPDATE SET
         canonical = EXCLUDED.canonical,
         category = EXCLUDED.category,
         notes = EXCLUDED.notes,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING *`,
      [alias, canonical, category, notes, admin?.userId || admin?.id || null]
    );
    const row = result.rows[0];
    await writeAudit(
      admin,
      {
        action: existing.rows[0] ? 'search.alias.update' : 'search.alias.create',
        entityType: 'search_alias',
        entityId: row.id,
        previousState: existing.rows[0]
          ? {
              alias: existing.rows[0].alias,
              canonical: existing.rows[0].canonical,
              category: existing.rows[0].category,
            }
          : null,
        newState: { alias: row.alias, canonical: row.canonical, category: row.category },
        reason,
      },
      req
    );
    return {
      id: row.id,
      alias: row.alias,
      canonical: row.canonical,
      category: row.category,
      notes: row.notes,
    };
  },

  async deleteAlias(admin, id, reason, req) {
    const pool = getPool();
    const existing = await pool.query(`SELECT * FROM search_aliases WHERE id = $1`, [id]);
    if (!existing.rows[0]) throw new AppError('Alias not found.', 404, 'NOT_FOUND');
    const why = String(reason || '').trim();
    if (why.length < 3) throw new AppError('A reason is required.', 400, 'VALIDATION_ERROR');
    await pool.query(`DELETE FROM search_aliases WHERE id = $1`, [id]);
    await writeAudit(
      admin,
      {
        action: 'search.alias.delete',
        entityType: 'search_alias',
        entityId: id,
        previousState: {
          alias: existing.rows[0].alias,
          canonical: existing.rows[0].canonical,
        },
        reason: why,
      },
      req
    );
    return { deleted: true };
  },

  async purgeStaleRecent({ days = 30 } = {}) {
    const pool = getPool();
    const result = await pool.query(
      `DELETE FROM user_recent_searches
       WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')`,
      [Math.min(Math.max(Number(days) || 30, 7), 90)]
    );
    const metrics = await pool.query(
      `DELETE FROM search_query_metrics
       WHERE day < (CURRENT_DATE AT TIME ZONE 'Africa/Lagos')::date - 90`
    );
    return {
      recentCleared: result.rowCount || 0,
      metricsCleared: metrics.rowCount || 0,
    };
  },
};
