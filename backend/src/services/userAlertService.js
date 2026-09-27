import { AppError } from '../middleware/errorHandler.js';
import { USER_ALERT_KINDS } from '../config/notifications.js';
import { getPool } from '../db/pool.js';

function mapSub(row) {
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    category: row.category,
    enabled: row.enabled,
    locationId: row.location_id,
    locationName: row.location_name || null,
    stateId: row.state_id,
    roadName: row.road_name,
    sourceId: row.source_id,
    officialCategory: row.official_category,
    commodityCode: row.commodity_code,
    commodityVariant: row.commodity_variant,
    fuelType: row.fuel_type,
    fxBase: row.fx_base,
    fxQuote: row.fx_quote,
    thresholdValue: row.threshold_value != null ? Number(row.threshold_value) : null,
    thresholdDirection: row.threshold_direction,
    frequency: row.frequency,
    cooldownMinutes: row.cooldown_minutes,
    lastTriggeredAt: row.last_triggered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const userAlertService = {
  kinds() {
    return USER_ALERT_KINDS;
  },

  async list(userId) {
    const result = await getPool().query(
      `SELECT s.*, loc.name AS location_name
       FROM user_alert_subscriptions s
       LEFT JOIN locations loc ON loc.id = s.location_id
       WHERE s.user_id = $1
       ORDER BY s.created_at DESC`,
      [userId]
    );
    return { items: result.rows.map(mapSub) };
  },

  async create(userId, input) {
    const kindMeta = USER_ALERT_KINDS.find((k) => k.code === input.kind);
    if (!kindMeta) throw new AppError('Invalid alert kind.', 400, 'VALIDATION_ERROR');

    if (input.kind === 'fx_rate') {
      if (!input.fxBase || !input.fxQuote) {
        throw new AppError('FX base and quote are required.', 400, 'VALIDATION_ERROR');
      }
    }
    if (input.kind === 'commodity_price' && !input.commodityCode) {
      throw new AppError('Commodity code is required.', 400, 'VALIDATION_ERROR');
    }
    if ((input.kind === 'traffic_area' || input.kind === 'fuel_price') && !input.locationId) {
      throw new AppError('Location is required for this alert.', 400, 'VALIDATION_ERROR');
    }

    const result = await getPool().query(
      `INSERT INTO user_alert_subscriptions (
         user_id, kind, category, enabled, location_id, state_id, road_name,
         source_id, official_category, commodity_code, commodity_variant, fuel_type,
         fx_base, fx_quote, threshold_value, threshold_direction, frequency, cooldown_minutes
       ) VALUES (
         $1,$2,$3,TRUE,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
         COALESCE($16::notification_frequency,'immediate'), COALESCE($17,30)
       )
       RETURNING id`,
      [
        userId,
        input.kind,
        kindMeta.category,
        input.locationId || null,
        input.stateId || null,
        input.roadName || null,
        input.sourceId || null,
        input.officialCategory || null,
        input.commodityCode || null,
        input.commodityVariant || null,
        input.fuelType || null,
        input.fxBase ? String(input.fxBase).toUpperCase() : null,
        input.fxQuote ? String(input.fxQuote).toUpperCase() : null,
        input.thresholdValue ?? null,
        input.thresholdDirection || (input.thresholdValue != null ? 'below' : 'any_change'),
        input.frequency || 'immediate',
        input.cooldownMinutes ?? 30,
      ]
    );
    return this.get(userId, result.rows[0].id);
  },

  async get(userId, id) {
    const result = await getPool().query(
      `SELECT s.*, loc.name AS location_name
       FROM user_alert_subscriptions s
       LEFT JOIN locations loc ON loc.id = s.location_id
       WHERE s.id = $1 AND s.user_id = $2`,
      [id, userId]
    );
    if (!result.rows[0]) throw new AppError('Alert subscription not found.', 404, 'NOT_FOUND');
    return mapSub(result.rows[0]);
  },

  async update(userId, id, patch) {
    await this.get(userId, id);
    const result = await getPool().query(
      `UPDATE user_alert_subscriptions SET
         enabled = COALESCE($3, enabled),
         threshold_value = COALESCE($4, threshold_value),
         threshold_direction = COALESCE($5, threshold_direction),
         frequency = COALESCE($6::notification_frequency, frequency),
         cooldown_minutes = COALESCE($7, cooldown_minutes),
         road_name = COALESCE($8, road_name),
         updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [
        id,
        userId,
        patch.enabled ?? null,
        patch.thresholdValue ?? null,
        patch.thresholdDirection ?? null,
        patch.frequency ?? null,
        patch.cooldownMinutes ?? null,
        patch.roadName ?? null,
      ]
    );
    if (!result.rows[0]) throw new AppError('Alert subscription not found.', 404, 'NOT_FOUND');
    return this.get(userId, id);
  },

  async remove(userId, id) {
    const result = await getPool().query(
      `DELETE FROM user_alert_subscriptions WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId]
    );
    if (!result.rows[0]) throw new AppError('Alert subscription not found.', 404, 'NOT_FOUND');
    return { deleted: true };
  },

  /** Evaluate FX subscriptions against a rate snapshot. */
  async evaluateFxRate({ base, quote, rate }) {
    const result = await getPool().query(
      `SELECT * FROM user_alert_subscriptions
       WHERE enabled = TRUE AND kind = 'fx_rate'
         AND upper(fx_base) = upper($1) AND upper(fx_quote) = upper($2)`,
      [base, quote]
    );
    const hits = [];
    for (const row of result.rows) {
      const threshold = row.threshold_value != null ? Number(row.threshold_value) : null;
      const dir = row.threshold_direction || 'any_change';
      let match = dir === 'any_change';
      if (threshold != null) {
        if (dir === 'above' || dir === 'crosses') match = Number(rate) >= threshold;
        if (dir === 'below') match = Number(rate) <= threshold;
      }
      if (!match) continue;
      if (row.last_triggered_at) {
        const coolMs = (row.cooldown_minutes || 60) * 60 * 1000;
        if (Date.now() - new Date(row.last_triggered_at).getTime() < coolMs) continue;
      }
      hits.push({
        userId: row.user_id,
        subscriptionId: row.id,
        base,
        quote,
        rate,
        threshold,
      });
      await getPool().query(
        `UPDATE user_alert_subscriptions
         SET last_triggered_at = NOW(), last_trigger_key = $2, updated_at = NOW()
         WHERE id = $1`,
        [row.id, `${rate}`]
      );
    }
    return hits;
  },

  async evaluateCommodityPrice({
    commodityCode,
    commodityVariant = null,
    price,
    locationId = null,
    locationName = null,
    observationId = null,
    href = null,
    commodityLabel = null,
  }) {
    const result = await getPool().query(
      `SELECT * FROM user_alert_subscriptions
       WHERE enabled = TRUE AND kind = 'commodity_price'
         AND lower(commodity_code) = lower($1)
         AND ($2::text IS NULL OR commodity_variant IS NULL OR lower(commodity_variant) = lower($2))
         AND ($3::uuid IS NULL OR location_id IS NULL OR location_id = $3)`,
      [commodityCode, commodityVariant, locationId]
    );
    const hits = [];
    for (const row of result.rows) {
      const threshold = row.threshold_value != null ? Number(row.threshold_value) : null;
      const dir = row.threshold_direction || 'below';
      let match = dir === 'any_change';
      if (threshold != null) {
        if (dir === 'above') match = Number(price) >= threshold;
        if (dir === 'below') match = Number(price) <= threshold;
        if (dir === 'crosses') match = true;
      }
      if (!match) continue;
      if (row.last_triggered_at) {
        const coolMs = (row.cooldown_minutes || 120) * 60 * 1000;
        if (Date.now() - new Date(row.last_triggered_at).getTime() < coolMs) continue;
      }
      hits.push({
        userId: row.user_id,
        subscriptionId: row.id,
        commodityCode,
        commodityLabel: commodityLabel || commodityCode,
        price,
        locationId: locationId || row.location_id,
        locationName,
        observationId,
        href,
        detail: `Price is now ₦${Number(price).toLocaleString('en-NG')} (threshold ₦${threshold ?? '—'})`,
      });
      await getPool().query(
        `UPDATE user_alert_subscriptions
         SET last_triggered_at = NOW(), last_trigger_key = $2, updated_at = NOW()
         WHERE id = $1`,
        [row.id, `${price}`]
      );
    }
    return hits;
  },
};
