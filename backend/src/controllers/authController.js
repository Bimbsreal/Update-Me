import {
  COOKIE_NAME,
  cookieOptions,
  signToken,
} from '../middleware/auth.js';
import { authService, geoService } from '../services/authService.js';
import {
  loginSchema,
  registerSchema,
  resolveLocationSchema,
  setLocationSchema,
} from '../validators/auth.js';

function setSessionCookie(res, userId) {
  const token = signToken({ sub: userId });
  res.cookie(COOKIE_NAME, token, cookieOptions());
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
    setSessionCookie(res, user.id);
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
    const user = await authService.login(body);
    setSessionCookie(res, user.id);
    return res.json({
      success: true,
      user,
      next: user.onboardingCompleted ? '/home' : '/onboarding',
    });
  } catch (error) {
    return next(error);
  }
}

export async function logout(_req, res) {
  clearSessionCookie(res);
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
    const area = await authService.resolveLocation(body.lat, body.lng);
    return res.json({ success: true, area });
  } catch (error) {
    return next(error);
  }
}
