import {
  listAreasQuerySchema,
  listLgasQuerySchema,
  listStatesQuerySchema,
  nearbyQuerySchema,
  searchQuerySchema,
  setUserLocationSchema,
  uuidParamSchema,
} from '../validators/locations.js';
import { locationService } from '../services/locationService.js';

export async function searchLocations(req, res, next) {
  try {
    const query = searchQuerySchema.parse(req.query);
    const results = await locationService.search(query);
    return res.json({ success: true, query: query.q, count: results.length, results });
  } catch (error) {
    return next(error);
  }
}

export async function getLocation(req, res, next) {
  try {
    const id = req.params.id;
    // allow slug or uuid
    const location = await locationService.getBySlugOrId(id);
    return res.json({ success: true, location });
  } catch (error) {
    return next(error);
  }
}

export async function nearbyLocations(req, res, next) {
  try {
    const query = nearbyQuerySchema.parse(req.query);
    const results = await locationService.nearby(query);
    return res.json({ success: true, count: results.length, results });
  } catch (error) {
    return next(error);
  }
}

export async function listStates(req, res, next) {
  try {
    const query = listStatesQuerySchema.parse(req.query);
    const states = await locationService.listStates(query.country);
    return res.json({ success: true, states });
  } catch (error) {
    return next(error);
  }
}

export async function listLgas(req, res, next) {
  try {
    const query = listLgasQuerySchema.parse({
      stateId: req.query.stateId || req.params.stateId,
    });
    const lgas = await locationService.listLgas(query.stateId);
    return res.json({ success: true, lgas });
  } catch (error) {
    return next(error);
  }
}

export async function listAreas(req, res, next) {
  try {
    const query = listAreasQuerySchema.parse({
      lgaId: req.query.lgaId || req.params.lgaId,
    });
    const areas = await locationService.listAreas(query.lgaId);
    return res.json({ success: true, areas });
  } catch (error) {
    return next(error);
  }
}

export async function capabilities(_req, res, next) {
  try {
    const data = await locationService.capabilities();
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
}

export async function setMyLocation(req, res, next) {
  try {
    const body = setUserLocationSchema.parse(req.body);
    if (body.locationId) uuidParamSchema.parse(body.locationId);
    const user = await locationService.setUserLocation(req.auth.userId, body);
    return res.json({ success: true, user, next: '/home' });
  } catch (error) {
    return next(error);
  }
}
