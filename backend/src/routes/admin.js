import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAdmin } from '../middleware/admin.js';
import { ADMIN_PERMISSIONS } from '../config/admin.js';
import * as ctrl from '../controllers/adminController.js';

const actionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many admin actions. Please wait and try again.',
  },
});

const syncLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many sync requests. Please wait and try again.',
  },
});

const router = Router();

const P = ADMIN_PERMISSIONS;

router.get('/me', requireAdmin(), ctrl.getAdminMe);
router.get('/dashboard', requireAdmin({ permission: P.dashboard }), ctrl.getDashboard);
router.get('/data-quality', requireAdmin({ permission: P.data_quality }), ctrl.getDataQuality);
router.get(
  '/data-quality/reports',
  requireAdmin({ permission: P.data_quality }),
  ctrl.getDataQualityReports
);
router.get(
  '/data-quality/conflicts',
  requireAdmin({ permission: P.data_quality }),
  ctrl.getDataQualityConflicts
);
router.get(
  '/data-quality/stale',
  requireAdmin({ permission: P.data_quality }),
  ctrl.getDataQualityStale
);
router.get(
  '/data-quality/expired',
  requireAdmin({ permission: P.data_quality }),
  ctrl.getDataQualityExpired
);
router.get('/search', requireAdmin({ permission: P.search }), ctrl.getAdminSearch);

router.get('/moderation', requireAdmin({ permission: P.moderation }), ctrl.getModerationQueue);
router.post(
  '/moderation/:id/action',
  requireAdmin({ permission: P.moderation }),
  actionLimiter,
  ctrl.postModerationAction
);

router.get('/reports', requireAdmin({ permission: P.reports }), ctrl.getAdminReports);

router.get('/alerts', requireAdmin({ permission: P.alerts }), ctrl.getAdminAlerts);
router.post(
  '/alerts/:id/action',
  requireAdmin({ permission: P.alerts }),
  actionLimiter,
  ctrl.postAlertAction
);

router.get('/users', requireAdmin({ permission: P.users }), ctrl.getAdminUsers);
router.get('/users/:id', requireAdmin({ permission: P.users }), ctrl.getAdminUser);
router.post(
  '/users/:id/suspend',
  requireAdmin({ permission: P.users_suspend }),
  actionLimiter,
  ctrl.postSuspendUser
);
router.post(
  '/users/:id/restore',
  requireAdmin({ permission: P.users_suspend }),
  actionLimiter,
  ctrl.postRestoreUser
);
router.patch(
  '/users/:id/role',
  requireAdmin({ permission: P.users_roles }),
  actionLimiter,
  ctrl.patchUserRole
);

router.get(
  '/official-sources',
  requireAdmin({ permission: P.official_sources }),
  ctrl.getOfficialSources
);
router.get(
  '/ingestion-runs',
  requireAdmin({ permission: P.official_sources }),
  ctrl.getIngestionRuns
);
router.post(
  '/official-sources',
  requireAdmin({ permission: P.official_sources }),
  actionLimiter,
  ctrl.postOfficialSource
);
router.post(
  '/official-sources/sync',
  requireAdmin({ permission: P.official_sync }),
  syncLimiter,
  ctrl.postOfficialSyncAll
);
router.patch(
  '/official-sources/:id',
  requireAdmin({ permission: P.official_sources }),
  actionLimiter,
  ctrl.patchOfficialSource
);
router.post(
  '/official-sources/:id/sync',
  requireAdmin({ permission: P.official_sync }),
  syncLimiter,
  ctrl.postOfficialSourceSync
);

router.get(
  '/official-updates',
  requireAdmin({ permission: P.official_updates }),
  ctrl.getOfficialUpdates
);
router.post(
  '/official-updates/:id/hide',
  requireAdmin({ permission: P.official_updates }),
  actionLimiter,
  ctrl.postHideOfficialUpdate
);
router.post(
  '/official-updates/:id/restore',
  requireAdmin({ permission: P.official_updates }),
  actionLimiter,
  ctrl.postRestoreOfficialUpdate
);

router.get('/fx', requireAdmin({ permission: P.fx }), ctrl.getFxAdmin);
router.post('/fx/sync', requireAdmin({ permission: P.fx_sync }), syncLimiter, ctrl.postFxSync);

router.get('/locations', requireAdmin({ permission: P.locations }), ctrl.getAdminLocations);

router.get('/fuel-stations', requireAdmin({ permission: P.fuel_stations }), ctrl.getFuelStations);
router.patch(
  '/fuel-stations/:id',
  requireAdmin({ permission: P.fuel_stations }),
  actionLimiter,
  ctrl.patchFuelStation
);

router.get('/transport-routes', requireAdmin({ permission: P.transport }), ctrl.getTransportRoutes);
router.patch(
  '/transport-routes/:id',
  requireAdmin({ permission: P.transport }),
  actionLimiter,
  ctrl.patchTransportRoute
);

router.get('/commodities', requireAdmin({ permission: P.commodities }), ctrl.getCommodities);
router.patch(
  '/commodities/:id',
  requireAdmin({ permission: P.commodities }),
  actionLimiter,
  ctrl.patchCommodity
);

router.get('/community', requireAdmin({ permission: P.community }), ctrl.getCommunity);

router.get('/audit-log', requireAdmin({ permission: P.audit_log }), ctrl.getAuditLog);

export default router;
