import { getPool } from '../db/pool.js';

function mapDateOnly(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) {
    // DATE columns from node-pg are midnight local; avoid UTC shift via toISOString()
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

function mapObservation(row) {
  if (!row) return null;
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceDisplayName: row.source_display_name || null,
    baseCurrency: row.base_currency,
    quoteCurrency: row.quote_currency,
    rate: Number(row.rate),
    rateType: row.rate_type,
    observedAt: row.observed_at,
    fetchedAt: row.fetched_at,
    effectiveDate: mapDateOnly(row.effective_date),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const fxRepository = {
  async listSources({ activeOnly = false } = {}) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, display_name, provider_key, rate_type, is_active, website_url, notes,
              created_at, updated_at
       FROM fx_sources
       WHERE ($1::boolean IS FALSE OR is_active = TRUE)
       ORDER BY rate_type, display_name`,
      [activeOnly]
    );
    return result.rows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      providerKey: row.provider_key,
      rateType: row.rate_type,
      isActive: row.is_active,
      websiteUrl: row.website_url,
      notes: row.notes,
    }));
  },

  async upsertObservation(obs) {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO fx_observations (
         source_id, base_currency, quote_currency, rate, rate_type,
         observed_at, fetched_at, effective_date, raw_fingerprint
       ) VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7,$8)
       ON CONFLICT (source_id, base_currency, quote_currency, rate_type, effective_date)
       DO UPDATE SET
         rate = EXCLUDED.rate,
         observed_at = EXCLUDED.observed_at,
         fetched_at = NOW(),
         raw_fingerprint = EXCLUDED.raw_fingerprint,
         updated_at = NOW()
       RETURNING id,
         (xmax = 0) AS inserted`,
      [
        obs.sourceId,
        obs.baseCurrency,
        obs.quoteCurrency,
        obs.rate,
        obs.rateType,
        obs.observedAt,
        obs.effectiveDate,
        obs.rawFingerprint || null,
      ]
    );
    return result.rowCount > 0;
  },

  async getLatest({ base, quote, rateType = null, sourceId = null } = {}) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT o.*, s.display_name AS source_display_name
       FROM fx_observations o
       JOIN fx_sources s ON s.id = o.source_id
       WHERE ($1::text IS NULL OR o.base_currency = $1)
         AND ($2::text IS NULL OR o.quote_currency = $2)
         AND ($3::fx_rate_type IS NULL OR o.rate_type = $3)
         AND ($4::text IS NULL OR o.source_id = $4)
       ORDER BY o.observed_at DESC, o.fetched_at DESC
       LIMIT 1`,
      [base || null, quote || null, rateType, sourceId]
    );
    return mapObservation(result.rows[0]);
  },

  async getLatestForPairs(pairs, { preferredRateType = null } = {}) {
    const pool = getPool();
    const items = [];
    for (const pair of pairs) {
      const result = await pool.query(
        `SELECT o.*, s.display_name AS source_display_name
         FROM fx_observations o
         JOIN fx_sources s ON s.id = o.source_id
         WHERE o.base_currency = $1
           AND o.quote_currency = $2
           AND ($3::fx_rate_type IS NULL OR o.rate_type = $3)
         ORDER BY
           CASE WHEN $3::fx_rate_type IS NOT NULL THEN 0
                WHEN o.rate_type = 'official_reference' THEN 0
                ELSE 1 END,
           o.observed_at DESC,
           o.fetched_at DESC
         LIMIT 1`,
        [pair.base, pair.quote, preferredRateType]
      );
      if (result.rows[0]) items.push(mapObservation(result.rows[0]));
    }
    return items;
  },

  async getPrevious(base, quote, { beforeObservedAt, rateType = null, sourceId = null } = {}) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT o.*, s.display_name AS source_display_name
       FROM fx_observations o
       JOIN fx_sources s ON s.id = o.source_id
       WHERE o.base_currency = $1
         AND o.quote_currency = $2
         AND o.observed_at < $3
         AND ($4::fx_rate_type IS NULL OR o.rate_type = $4)
         AND ($5::text IS NULL OR o.source_id = $5)
       ORDER BY o.observed_at DESC
       LIMIT 1`,
      [base, quote, beforeObservedAt, rateType, sourceId]
    );
    return mapObservation(result.rows[0]);
  },

  async getHistory({
    base,
    quote,
    days = 30,
    fromDate = null,
    toDate = null,
    rateType = null,
    sourceId = null,
  } = {}) {
    const pool = getPool();
    let from = fromDate;
    let to = toDate;
    if (!from && !to && days) {
      const start = new Date();
      start.setUTCDate(start.getUTCDate() - days);
      from = start.toISOString().slice(0, 10);
    }

    const result = await pool.query(
      `SELECT o.*, s.display_name AS source_display_name
       FROM fx_observations o
       JOIN fx_sources s ON s.id = o.source_id
       WHERE o.base_currency = $1
         AND o.quote_currency = $2
         AND ($3::date IS NULL OR o.effective_date >= $3::date)
         AND ($4::date IS NULL OR o.effective_date <= $4::date)
         AND ($5::fx_rate_type IS NULL OR o.rate_type = $5)
         AND ($6::text IS NULL OR o.source_id = $6)
       ORDER BY o.effective_date ASC, o.observed_at ASC`,
      [base, quote, from, to, rateType, sourceId]
    );
    return result.rows.map(mapObservation);
  },

  async createSyncRun({ providerKey, sourceId, status, startedAt, finishedAt, upserted, errorMessage, details }) {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO fx_sync_runs (
         provider_key, source_id, status, started_at, finished_at,
         observations_upserted, error_message, details
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
       RETURNING *`,
      [
        providerKey,
        sourceId || null,
        status,
        startedAt,
        finishedAt || new Date().toISOString(),
        upserted || 0,
        errorMessage || null,
        JSON.stringify(details || {}),
      ]
    );
    return result.rows[0];
  },

  async upsertSyncState({
    providerKey,
    sourceId,
    lastAttemptAt,
    lastSuccessAt,
    lastStatus,
    consecutiveFailures,
    lastErrorMessage,
  }) {
    const pool = getPool();
    await pool.query(
      `INSERT INTO fx_sync_state (
         provider_key, source_id, last_attempt_at, last_success_at,
         last_status, consecutive_failures, last_error_message, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (provider_key) DO UPDATE SET
         source_id = EXCLUDED.source_id,
         last_attempt_at = EXCLUDED.last_attempt_at,
         last_success_at = COALESCE(EXCLUDED.last_success_at, fx_sync_state.last_success_at),
         last_status = EXCLUDED.last_status,
         consecutive_failures = EXCLUDED.consecutive_failures,
         last_error_message = EXCLUDED.last_error_message,
         updated_at = NOW()`,
      [
        providerKey,
        sourceId || null,
        lastAttemptAt,
        lastSuccessAt || null,
        lastStatus,
        consecutiveFailures,
        lastErrorMessage || null,
      ]
    );
  },

  async getSyncState() {
    const pool = getPool();
    const [states, recentRuns, lastSuccess] = await Promise.all([
      pool.query(
        `SELECT ss.*, s.display_name AS source_display_name
         FROM fx_sync_state ss
         LEFT JOIN fx_sources s ON s.id = ss.source_id
         ORDER BY ss.provider_key`
      ),
      pool.query(
        `SELECT id, provider_key, source_id, status, started_at, finished_at,
                observations_upserted, error_message
         FROM fx_sync_runs
         ORDER BY started_at DESC
         LIMIT 20`
      ),
      pool.query(
        `SELECT MAX(last_success_at) AS last_success_at FROM fx_sync_state`
      ),
    ]);

    return {
      lastSuccessfulSyncAt: lastSuccess.rows[0]?.last_success_at || null,
      providers: states.rows.map((row) => ({
        providerKey: row.provider_key,
        sourceId: row.source_id,
        sourceDisplayName: row.source_display_name,
        lastAttemptAt: row.last_attempt_at,
        lastSuccessAt: row.last_success_at,
        lastStatus: row.last_status,
        consecutiveFailures: row.consecutive_failures,
        lastErrorMessage: row.last_error_message,
      })),
      recentRuns: recentRuns.rows.map((row) => ({
        id: row.id,
        providerKey: row.provider_key,
        sourceId: row.source_id,
        status: row.status,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        observationsUpserted: row.observations_upserted,
        errorMessage: row.error_message,
      })),
    };
  },

  async countObservations() {
    const pool = getPool();
    const result = await pool.query(`SELECT COUNT(*)::int AS count FROM fx_observations`);
    return result.rows[0].count;
  },
};
