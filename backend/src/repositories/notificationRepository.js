import { getPool } from '../db/pool.js';
import { categoryLabel } from '../config/notifications.js';

function mapNotification(row) {
  if (!row) return null;
  const expired =
    row.expires_at != null && new Date(row.expires_at).getTime() <= Date.now();
  return {
    id: row.id,
    channel: row.channel,
    category: row.category,
    categoryLabel: categoryLabel(row.category),
    type: row.type,
    title: row.title,
    message: row.message || null,
    priority: row.priority,
    relatedEntityType: row.related_entity_type || null,
    relatedEntityId: row.related_entity_id || null,
    linkPath: row.link_path || null,
    location: row.location_id
      ? {
          id: row.location_id,
          name: row.location_name || null,
          type: row.location_type || null,
        }
      : null,
    read: Boolean(row.read_at),
    readAt: row.read_at,
    expiresAt: row.expires_at,
    expired,
    createdAt: row.created_at,
  };
}

export const notificationRepository = {
  mapNotification,

  async list(userId, query) {
    const conditions = [`n.user_id = $1`];
    const params = [userId];
    let i = 2;

    if (query.status === 'unread') conditions.push(`n.read_at IS NULL`);
    if (query.status === 'read') conditions.push(`n.read_at IS NOT NULL`);
    if (query.category) {
      conditions.push(`n.category = $${i++}`);
      params.push(query.category);
    }
    if (!query.includeExpired) {
      conditions.push(`(n.expires_at IS NULL OR n.expires_at > NOW())`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    const count = await getPool().query(
      `SELECT COUNT(*)::int AS total FROM notifications n ${where}`,
      params
    );
    const list = await getPool().query(
      `SELECT n.*,
              loc.name AS location_name,
              loc.type AS location_type
       FROM notifications n
       LEFT JOIN locations loc ON loc.id = n.location_id
       ${where}
       ORDER BY
         CASE WHEN n.read_at IS NULL THEN 0 ELSE 1 END,
         CASE n.priority WHEN 'urgent' THEN 0 WHEN 'important' THEN 1 ELSE 2 END,
         n.created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, limit, offset]
    );

    const unread = await getPool().query(
      `SELECT COUNT(*)::int AS count FROM notifications
       WHERE user_id = $1
         AND read_at IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [userId]
    );

    return {
      items: list.rows.map(mapNotification),
      page,
      limit,
      total: count.rows[0].total,
      unreadCount: unread.rows[0].count,
    };
  },

  async findById(userId, id) {
    const result = await getPool().query(
      `SELECT n.*,
              loc.name AS location_name,
              loc.type AS location_type
       FROM notifications n
       LEFT JOIN locations loc ON loc.id = n.location_id
       WHERE n.id = $1 AND n.user_id = $2`,
      [id, userId]
    );
    return mapNotification(result.rows[0]);
  },

  async create(input) {
    try {
      const result = await getPool().query(
        `INSERT INTO notifications (
           user_id, channel, category, type, title, message, priority,
           related_entity_type, related_entity_id, location_id, link_path,
           dedupe_key, expires_at
         ) VALUES (
           $1,'in_app',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
         )
         RETURNING id`,
        [
          input.userId,
          input.category,
          input.type,
          input.title,
          input.message || null,
          input.priority || 'normal',
          input.relatedEntityType || null,
          input.relatedEntityId || null,
          input.locationId || null,
          input.linkPath || null,
          input.dedupeKey,
          input.expiresAt || null,
        ]
      );
      return this.findById(input.userId, result.rows[0].id);
    } catch (error) {
      if (error.code === '23505') {
        return { duplicate: true };
      }
      throw error;
    }
  },

  async markRead(userId, id) {
    const result = await getPool().query(
      `UPDATE notifications
       SET read_at = COALESCE(read_at, NOW())
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, userId]
    );
    if (!result.rows[0]) return null;
    return this.findById(userId, id);
  },

  async markAllRead(userId) {
    const result = await getPool().query(
      `UPDATE notifications
       SET read_at = NOW()
       WHERE user_id = $1
         AND read_at IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())
       RETURNING id`,
      [userId]
    );
    return result.rowCount;
  },

  async unreadCount(userId) {
    const result = await getPool().query(
      `SELECT COUNT(*)::int AS count FROM notifications
       WHERE user_id = $1
         AND read_at IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [userId]
    );
    return result.rows[0].count;
  },

  async getPreferences(userId) {
    const result = await getPool().query(
      `SELECT category, enabled FROM user_notification_preferences WHERE user_id = $1`,
      [userId]
    );
    return result.rows;
  },

  async upsertPreference(userId, category, enabled) {
    await getPool().query(
      `INSERT INTO user_notification_preferences (user_id, category, enabled)
       VALUES ($1,$2,$3)
       ON CONFLICT (user_id, category)
       DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()`,
      [userId, category, enabled]
    );
  },

  async ensureDefaultPreferences(userId, defaults) {
    for (const item of defaults) {
      await getPool().query(
        `INSERT INTO user_notification_preferences (user_id, category, enabled)
         VALUES ($1,$2,$3)
         ON CONFLICT (user_id, category) DO NOTHING`,
        [userId, item.code, item.defaultEnabled]
      );
    }
  },
};
