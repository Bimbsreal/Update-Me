import {
  createSavedAreaSchema,
  createSavedRouteSchema,
  listNotificationsQuerySchema,
  notificationIdParamSchema,
  savedAreaIdParamSchema,
  savedRouteIdParamSchema,
  updatePreferencesSchema,
  updateSavedAreaSchema,
  updateSavedRouteSchema,
} from '../validators/notifications.js';
import {
  notificationService,
  savedPlacesService,
} from '../services/notificationService.js';

export async function getNotificationTaxonomy(_req, res, next) {
  try {
    return res.json({ success: true, ...notificationService.taxonomy() });
  } catch (error) {
    return next(error);
  }
}

export async function listNotifications(req, res, next) {
  try {
    const query = listNotificationsQuerySchema.parse(req.query);
    const result = await notificationService.list(req.auth.userId, query);
    return res.json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
}

export async function getUnreadCount(req, res, next) {
  try {
    const unreadCount = await notificationService.unreadCount(req.auth.userId);
    return res.json({ success: true, unreadCount });
  } catch (error) {
    return next(error);
  }
}

export async function markNotificationRead(req, res, next) {
  try {
    const { id } = notificationIdParamSchema.parse(req.params);
    const notification = await notificationService.markRead(req.auth.userId, id);
    return res.json({ success: true, notification });
  } catch (error) {
    return next(error);
  }
}

export async function markAllNotificationsRead(req, res, next) {
  try {
    const result = await notificationService.markAllRead(req.auth.userId);
    return res.json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
}

export async function getNotificationPreferences(req, res, next) {
  try {
    const preferences = await notificationService.getPreferences(req.auth.userId);
    return res.json({ success: true, preferences });
  } catch (error) {
    return next(error);
  }
}

export async function updateNotificationPreferences(req, res, next) {
  try {
    const body = updatePreferencesSchema.parse(req.body);
    const preferences = await notificationService.updatePreferences(
      req.auth.userId,
      body.preferences
    );
    return res.json({ success: true, preferences });
  } catch (error) {
    return next(error);
  }
}

export async function listSavedAreas(req, res, next) {
  try {
    const items = await savedPlacesService.listAreas(req.auth.userId);
    return res.json({ success: true, items });
  } catch (error) {
    return next(error);
  }
}

export async function createSavedArea(req, res, next) {
  try {
    const body = createSavedAreaSchema.parse(req.body);
    const item = await savedPlacesService.createArea(req.auth.userId, body);
    return res.status(201).json({ success: true, item });
  } catch (error) {
    return next(error);
  }
}

export async function updateSavedArea(req, res, next) {
  try {
    const { id } = savedAreaIdParamSchema.parse(req.params);
    const body = updateSavedAreaSchema.parse(req.body);
    const item = await savedPlacesService.updateArea(req.auth.userId, id, body);
    return res.json({ success: true, item });
  } catch (error) {
    return next(error);
  }
}

export async function deleteSavedArea(req, res, next) {
  try {
    const { id } = savedAreaIdParamSchema.parse(req.params);
    await savedPlacesService.deleteArea(req.auth.userId, id);
    return res.json({ success: true, deleted: true });
  } catch (error) {
    return next(error);
  }
}

export async function listSavedRoutes(req, res, next) {
  try {
    const items = await savedPlacesService.listRoutes(req.auth.userId);
    return res.json({ success: true, items });
  } catch (error) {
    return next(error);
  }
}

export async function createSavedRoute(req, res, next) {
  try {
    const body = createSavedRouteSchema.parse(req.body);
    const item = await savedPlacesService.createRoute(req.auth.userId, body);
    return res.status(201).json({ success: true, item });
  } catch (error) {
    return next(error);
  }
}

export async function updateSavedRoute(req, res, next) {
  try {
    const { id } = savedRouteIdParamSchema.parse(req.params);
    const body = updateSavedRouteSchema.parse(req.body);
    const item = await savedPlacesService.updateRoute(req.auth.userId, id, body);
    return res.json({ success: true, item });
  } catch (error) {
    return next(error);
  }
}

export async function deleteSavedRoute(req, res, next) {
  try {
    const { id } = savedRouteIdParamSchema.parse(req.params);
    await savedPlacesService.deleteRoute(req.auth.userId, id);
    return res.json({ success: true, deleted: true });
  } catch (error) {
    return next(error);
  }
}

export async function getPersonalization(req, res, next) {
  try {
    const data = await savedPlacesService.personalization(req.auth.userId);
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
}
