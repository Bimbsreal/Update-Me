import { AppError } from './errorHandler.js';
import { requireAuth } from './auth.js';
import { getPool } from '../db/pool.js';
import { isStaffRole, roleHasPermission } from '../config/admin.js';

/**
 * Load staff user for admin gates. Rejects suspended accounts.
 * Automation tokens are NOT accepted here — /admin requires a staff session.
 * FX and Official sync use their own scoped token gates.
 */
export async function loadAdminUser(userId) {
  const result = await getPool().query(
    `SELECT id, display_name, email, is_active, is_moderator, admin_role,
            suspended_at, suspension_reason
     FROM users WHERE id = $1`,
    [userId]
  );
  const user = result.rows[0];
  if (!user || !user.is_active) {
    throw new AppError('Account not found or inactive.', 403, 'FORBIDDEN');
  }
  if (user.suspended_at) {
    throw new AppError('This account is suspended.', 403, 'ACCOUNT_SUSPENDED');
  }
  const role = user.admin_role || (user.is_moderator ? 'admin' : null);
  if (!isStaffRole(role)) {
    throw new AppError('Administrator access required.', 403, 'FORBIDDEN');
  }
  return {
    id: user.id,
    displayName: user.display_name,
    email: user.email,
    role,
    isModerator: true,
  };
}

/**
 * requireAdmin({ permission }) — backend authorization for every /admin endpoint.
 * Session staff only. Permission checks always apply.
 */
export function requireAdmin(options = {}) {
  const permission = options.permission || null;
  const anyOf = Array.isArray(options.anyOf) ? options.anyOf.filter(Boolean) : null;

  return async function adminGate(req, res, next) {
    try {
      await new Promise((resolve, reject) => {
        requireAuth(req, res, (err) => (err ? reject(err) : resolve()));
      });

      const staff = await loadAdminUser(req.auth.userId);
      if (anyOf?.length) {
        const ok = anyOf.some((p) => roleHasPermission(staff.role, p));
        if (!ok) {
          throw new AppError(
            'You do not have permission for this administrative action.',
            403,
            'FORBIDDEN'
          );
        }
      } else if (permission && !roleHasPermission(staff.role, permission)) {
        throw new AppError(
          'You do not have permission for this administrative action.',
          403,
          'FORBIDDEN'
        );
      }

      req.admin = {
        via: 'session',
        userId: staff.id,
        role: staff.role,
        displayName: staff.displayName,
        email: staff.email,
      };
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
