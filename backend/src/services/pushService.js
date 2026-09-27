/**
 * Web Push — optional. When VAPID keys are not configured, subscribe APIs
 * still accept/store endpoints for future delivery, but send is a no-op.
 * Never logs subscription auth keys.
 */
import { getPool } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { env } from '../config/env.js';

function vapidConfigured() {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

function mapSub(row) {
  if (!row) return null;
  return {
    id: row.id,
    endpointHint: String(row.endpoint || '').slice(0, 48) + '…',
    deviceLabel: row.device_label || null,
    userAgent: row.user_agent ? String(row.user_agent).slice(0, 120) : null,
    isActive: row.is_active,
    lastSuccessAt: row.last_success_at,
    lastFailureAt: row.last_failure_at,
    failureCount: row.failure_count,
    createdAt: row.created_at,
  };
}

export const pushService = {
  isConfigured() {
    return vapidConfigured();
  },

  publicConfig() {
    return {
      enabled: vapidConfigured(),
      publicKey: env.VAPID_PUBLIC_KEY || null,
      note: vapidConfigured()
        ? 'Web Push is configured.'
        : 'Web Push not configured — in-app notifications remain available. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to enable.',
    };
  },

  async listSubscriptions(userId) {
    const result = await getPool().query(
      `SELECT * FROM push_subscriptions
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId]
    );
    return result.rows.map(mapSub);
  },

  async upsertSubscription(userId, { endpoint, keys, deviceLabel = null, userAgent = null }) {
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      throw new AppError('Invalid push subscription.', 400, 'VALIDATION_ERROR');
    }
    const result = await getPool().query(
      `INSERT INTO push_subscriptions (
         user_id, endpoint, p256dh, auth, user_agent, device_label, is_active
       ) VALUES ($1,$2,$3,$4,$5,$6,TRUE)
       ON CONFLICT (endpoint) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         p256dh = EXCLUDED.p256dh,
         auth = EXCLUDED.auth,
         user_agent = COALESCE(EXCLUDED.user_agent, push_subscriptions.user_agent),
         device_label = COALESCE(EXCLUDED.device_label, push_subscriptions.device_label),
         is_active = TRUE,
         failure_count = 0,
         updated_at = NOW()
       RETURNING *`,
      [
        userId,
        String(endpoint).slice(0, 2048),
        String(keys.p256dh).slice(0, 255),
        String(keys.auth).slice(0, 255),
        userAgent ? String(userAgent).slice(0, 300) : null,
        deviceLabel ? String(deviceLabel).slice(0, 80) : null,
      ]
    );
    return mapSub(result.rows[0]);
  },

  async revokeSubscription(userId, { endpoint = null, id = null } = {}) {
    if (!endpoint && !id) {
      throw new AppError('endpoint or id is required.', 400, 'VALIDATION_ERROR');
    }
    const result = await getPool().query(
      `UPDATE push_subscriptions
       SET is_active = FALSE, updated_at = NOW()
       WHERE user_id = $1
         AND (
           ($2::text IS NOT NULL AND endpoint = $2)
           OR ($3::uuid IS NOT NULL AND id = $3)
         )
       RETURNING id`,
      [userId, endpoint, id]
    );
    return { revoked: result.rowCount || 0 };
  },

  async deactivateEndpoint(endpoint, errorCode = 'gone') {
    await getPool().query(
      `UPDATE push_subscriptions
       SET is_active = FALSE,
           last_failure_at = NOW(),
           failure_count = failure_count + 1,
           updated_at = NOW()
       WHERE endpoint = $1`,
      [endpoint]
    );
    return { deactivated: true, errorCode };
  },

  /**
   * Deliver push for a notification. No-op when VAPID missing or web-push unavailable.
   * Invalid/expired subscriptions are deactivated; failures never throw to caller.
   */
  async deliverToUser(userId, payload) {
    if (!vapidConfigured()) {
      return { skipped: true, reason: 'vapid_not_configured', delivered: 0 };
    }

    let webpush;
    try {
      webpush = (await import('web-push')).default;
    } catch {
      return { skipped: true, reason: 'web_push_package_missing', delivered: 0 };
    }

    webpush.setVapidDetails(
      env.VAPID_SUBJECT || 'mailto:ops@updateme.local',
      env.VAPID_PUBLIC_KEY,
      env.VAPID_PRIVATE_KEY
    );

    const subs = await getPool().query(
      `SELECT * FROM push_subscriptions
       WHERE user_id = $1 AND is_active = TRUE`,
      [userId]
    );

    let delivered = 0;
    let failed = 0;
    for (const row of subs.rows) {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          JSON.stringify({
            title: payload.title,
            body: payload.message || '',
            url: payload.linkPath || '/notifications',
            tag: payload.dedupeKey || payload.id || 'update-me',
          })
        );
        await getPool().query(
          `UPDATE push_subscriptions
           SET last_success_at = NOW(), failure_count = 0, updated_at = NOW()
           WHERE id = $1`,
          [row.id]
        );
        delivered += 1;
      } catch (err) {
        failed += 1;
        const statusCode = err?.statusCode || err?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await this.deactivateEndpoint(row.endpoint, String(statusCode));
        } else {
          await getPool().query(
            `UPDATE push_subscriptions
             SET last_failure_at = NOW(),
                 failure_count = failure_count + 1,
                 updated_at = NOW()
             WHERE id = $1`,
            [row.id]
          );
        }
      }
    }

    return { delivered, failed, total: subs.rows.length };
  },

  async countActive() {
    const result = await getPool().query(
      `SELECT COUNT(*)::int AS c FROM push_subscriptions WHERE is_active = TRUE`
    );
    return result.rows[0]?.c || 0;
  },
};
