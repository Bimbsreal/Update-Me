import { homeService } from '../services/homeService.js';

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, ...data });
}

export async function getHome(req, res, next) {
  try {
    const home = await homeService.getHome(req.auth.userId, {
      locationId: req.query.locationId || undefined,
      savedAreaId: req.query.savedAreaId || undefined,
      savedRouteId: req.query.savedRouteId || undefined,
      radiusKm: req.query.radiusKm,
    });
    return ok(res, { home });
  } catch (error) {
    return next(error);
  }
}
