import {
  COOKIE_NAME,
  cookieOptions,
  signToken,
} from '../middleware/auth.js';
import { authService, geoService } from '../services/authService.js';
import { sessionService } from '../services/sessionService.js';
import { adminAccessService } from '../services/adminAccessService.js';
import { isStaffRole } from '../config/admin.js';
import {
  loginSchema,
  registerSchema,
  resolveLocationSchema,
  setLocationSchema,
} from '../validators/auth.js';

async function establishSession(res, user, req) {
  const session = await sessionService.create(user.id, req);
  const token = signToken({ sub: user.id, sid: session.id });
  res.cookie(COOKIE_NAME, token, cookieOptions());
  if (isStaffRole(user.adminRole)) {
    await adminAccessService.recordSecurityEvent(
      { userId: user.id },
      {
        action: 'admin.login',
        entityType: 'user',
        entityId: user.id,
        previousState: null,
        newState: { sessionId: session.id, role: user.adminRole },
        reason: 'Administrator signed in',
      },
      req
    );
  }
  return session;
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    ...cookieOptions(),
    maxAge: 0,
  });
}

export async function register(req, res, next) {
  try {
    const body = registerSchema.parse(req.body);
    const user = await authService.register(body);
    await establishSession(res, user, req);
    return res.status(201).json({
      success: true,
      user,
      next: user.onboardingCompleted ? '/home' : '/onboarding',
    });
  } catch (error) {
    return next(error);
  }
}

export async function login(req, res, next) {
  try {
    const body = loginSchema.parse(req.body);
    try {
      const user = await authService.login(body);
      await establishSession(res, user, req);
      return res.json({
        success: true,
        user,
        next: user.onboardingCompleted ? '/home' : '/onboarding',
      });
    } catch (error) {
      // Best-effort: record failed login only when contact matches a staff account
      try {
        const { detectContactType, normalizeContact } = await import('../validators/auth.js');
        const type = detectContactType(body.contact);
        if (type === 'email') {
          const email = normalizeContact(body.contact).toLowerCase();
          const { getPool } = await import('../db/pool.js');
          const staff = await getPool().query(
            `SELECT id, admin_role FROM users WHERE lower(email) = $1 AND admin_role IS NOT NULL`,
            [email]
          );
          if (staff.rows[0]) {
            await adminAccessService.recordSecurityEvent(
              null,
              {
                action: 'admin.login_failed',
                entityType: 'user',
                entityId: staff.rows[0].id,
                previousState: null,
                newState: { role: staff.rows[0].admin_role },
                reason: error.message || 'Failed administrator login',
              },
              req
            );
          }
        }
      } catch {
        // ignore audit side-effects
      }
      throw error;
    }
  } catch (error) {
    return next(error);
  }
}

export async function logout(req, res) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (token) {
      try {
        const { verifyToken } = await import('../middleware/auth.js');
        const decoded = verifyToken(token);
        if (decoded?.sid) {
          await sessionService.revoke(decoded.sid, { reason: 'Signed out' });
        }
      } catch {
        // ignore invalid token on logout
      }
    }
  } finally {
    clearSessionCookie(res);
  }
  return res.json({ success: true, message: 'Signed out' });
}

export async function me(req, res, next) {
  try {
    const user = await authService.me(req.auth.userId);
    return res.json({ success: true, user });
  } catch (error) {
    return next(error);
  }
}

export async function setLocation(req, res, next) {
  try {
    const body = setLocationSchema.parse(req.body);
    const user = await authService.setLocation(req.auth.userId, body.areaId);
    return res.json({
      success: true,
      user,
      next: '/home',
    });
  } catch (error) {
    return next(error);
  }
}

export async function listStates(_req, res, next) {
  try {
    const states = await geoService.listStates();
    return res.json({ success: true, states });
  } catch (error) {
    return next(error);
  }
}

export async function listLgas(req, res, next) {
  try {
    const lgas = await geoService.listLgas(req.params.stateId);
    return res.json({ success: true, lgas });
  } catch (error) {
    return next(error);
  }
}

export async function listAreas(req, res, next) {
  try {
    const areas = await geoService.listAreas(req.params.lgaId);
    return res.json({ success: true, areas });
  } catch (error) {
    return next(error);
  }
}

export async function resolveLocation(req, res, next) {
  try {
    const body = resolveLocationSchema.parse(req.body);
    const area = await authService.resolveLocation(body.lat, body.lng, {
      accuracy: body.accuracy,
    });
    return res.json({ success: true, area });
  } catch (error) {
    return next(error);
  }
}
