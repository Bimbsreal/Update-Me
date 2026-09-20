import { getPool } from '../db/pool.js';

export const adminAuditRepository = {
  async create({
    actorUserId,
    action,
    entityType,
    entityId = null,
    previousState = null,
    newState = null,
    reason = null,
    ipAddress = null,
    userAgent = null,
  }) {
    const result = await getPool().query(
      `INSERT INTO admin_audit_log (
         actor_user_id, action, entity_type, entity_id,
         previous_state, new_state, reason, ip_address, user_agent
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9)
       RETURNING *`,
      [
        actorUserId,
        action,
        entityType,
        entityId,
        previousState ? JSON.stringify(previousState) : null,
        newState ? JSON.stringify(newState) : null,
        reason,
        ipAddress,
        userAgent,
      ]
    );
    return result.rows[0];
  },

  async list({ limit = 40, offset = 0, actorUserId, entityType, action } = {}) {
    const params = [];
    const where = [];
    if (actorUserId) {
      params.push(actorUserId);
      where.push(`a.actor_user_id = $${params.length}`);
    }
    if (entityType) {
      params.push(entityType);
      where.push(`a.entity_type = $${params.length}`);
    }
    if (action) {
      params.push(action);
      where.push(`a.action = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(Math.min(Number(limit) || 40, 100));
    params.push(Math.max(Number(offset) || 0, 0));
    const result = await getPool().query(
      `SELECT a.*, u.display_name AS actor_display_name, u.email AS actor_email
       FROM admin_audit_log a
       LEFT JOIN users u ON u.id = a.actor_user_id
       ${whereSql}
       ORDER BY a.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const count = await getPool().query(
      `SELECT COUNT(*)::int AS total FROM admin_audit_log a ${whereSql}`,
      params.slice(0, -2)
    );
    return { items: result.rows, total: count.rows[0]?.total || 0 };
  },
};
