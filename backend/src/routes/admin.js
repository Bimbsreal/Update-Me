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
router.get(
  '/system-health',
  requireAdmin({ permission: P.dashboard }),
  ctrl.getSystemHealth
);
router.get(
  '/analytics',
  requireAdmin({ permission: P.analytics }),
  ctrl.getAnalyticsOverview
);
router.get(
  '/analytics/product',
  requireAdmin({ permission: P.analytics }),
  ctrl.getAnalyticsProduct
);
router.get(
  '/analytics/domains/:domain',
  requireAdmin({ permission: P.analytics }),
  ctrl.getAnalyticsDomain
);
router.get(
  '/analytics/operations',
  requireAdmin({ permission: P.analytics }),
  ctrl.getAnalyticsOperations
);
router.get(
  '/analytics/data-quality',
  requireAdmin({ permission: P.analytics }),
  ctrl.getAnalyticsDataQuality
);
router.get(
  '/analytics/security',
  requireAdmin({ permission: P.analytics_security }),
  ctrl.getAnalyticsSecurity
);
router.get(
  '/analytics/export',
  requireAdmin({ permission: P.analytics_export }),
  actionLimiter,
  ctrl.getAnalyticsExport
);
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
router.get(
  '/data-quality/intelligence',
  requireAdmin({ permission: P.data_quality }),
  ctrl.getDataQualityIntelligence
);
router.get(
  '/data-quality/domains/:domain',
  requireAdmin({ permission: P.data_quality }),
  ctrl.getDataQualityDomain
);
router.get(
  '/data-quality/events',
  requireAdmin({ permission: P.data_quality }),
  ctrl.getDataQualityEvents
);
router.get(
  '/data-quality/review-queue',
  requireAdmin({ permission: P.data_quality }),
  ctrl.getDataQualityReviewQueue
);
router.post(
  '/data-quality/events/:id/resolve',
  requireAdmin({ permission: P.data_quality }),
  actionLimiter,
  ctrl.postDataQualityResolveEvent
);
router.get(
  '/data-quality/rules',
  requireAdmin({ permission: P.data_quality }),
  ctrl.getDataQualityRules
);
router.patch(
  '/data-quality/rules/:code',
  requireAdmin({ permission: P.data_quality }),
  actionLimiter,
  ctrl.patchDataQualityRule
);
router.post(
  '/data-quality/scan-anomalies',
  requireAdmin({ permission: P.data_quality }),
  actionLimiter,
  ctrl.postDataQualityScanAnomalies
);
router.get(
  '/data-quality/inspect/:entityType/:entityId',
  requireAdmin({ permission: P.data_quality }),
  ctrl.getDataQualityInspect
);
router.get('/search', requireAdmin({ permission: P.search }), ctrl.getAdminSearch);
router.get(
  '/search/intelligence',
  requireAdmin({ permission: P.search }),
  ctrl.getSearchIntelligenceDashboard
);
router.get(
  '/search/aliases',
  requireAdmin({ permission: P.search }),
  ctrl.getSearchAliases
);
router.post(
  '/search/aliases',
  requireAdmin({ permission: P.search }),
  actionLimiter,
  ctrl.upsertSearchAlias
);
router.delete(
  '/search/aliases/:id',
  requireAdmin({ permission: P.search }),
  actionLimiter,
  ctrl.deleteSearchAlias
);
router.post(
  '/search/purge-stale',
  requireAdmin({ permission: P.search }),
  actionLimiter,
  ctrl.postSearchPurgeStale
);

router.get('/moderation', requireAdmin({ permission: P.moderation }), ctrl.getModerationQueue);
router.get(
  '/moderation/metrics',
  requireAdmin({ permission: P.moderation }),
  ctrl.getModerationMetrics
);
router.get(
  '/moderation/:id',
  requireAdmin({ permission: P.moderation }),
  ctrl.getModerationDetail
);
router.post(
  '/moderation/:id/action',
  requireAdmin({ permission: P.moderation }),
  actionLimiter,
  ctrl.postModerationAction
);
router.post(
  '/moderation/reports/:id/correct-location',
  requireAdmin({ anyOf: [P.moderation, P.locations_edit] }),
  actionLimiter,
  ctrl.postCorrectReportLocation
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
router.post(
  '/users/:id/disable',
  requireAdmin({ permission: P.users_suspend }),
  actionLimiter,
  ctrl.postDisableUser
);
router.post(
  '/users/:id/disable-reporting',
  requireAdmin({ permission: P.users_suspend }),
  actionLimiter,
  ctrl.postDisableReporting
);
router.post(
  '/users/:id/enable-reporting',
  requireAdmin({ permission: P.users_suspend }),
  actionLimiter,
  ctrl.postEnableReporting
);
router.patch(
  '/users/:id/role',
  requireAdmin({ permission: P.users_roles }),
  actionLimiter,
  ctrl.patchUserRole
);
router.post(
  '/users/:id/sessions/:sessionId/revoke',
  requireAdmin({ permission: P.users_suspend }),
  actionLimiter,
  ctrl.postRevokeUserSession
);
router.post(
  '/users/:id/sessions/revoke-all',
  requireAdmin({ permission: P.users_suspend }),
  actionLimiter,
  ctrl.postRevokeAllUserSessions
);

router.get('/roles', requireAdmin({ permission: P.users_roles }), ctrl.getRoleCatalog);
router.get('/roles/:code', requireAdmin({ permission: P.users_roles }), ctrl.getRoleDetail);

router.get('/invitations', requireAdmin({ permission: P.users_roles }), ctrl.getAdminInvitations);
router.post(
  '/invitations',
  requireAdmin({ permission: P.users_roles }),
  actionLimiter,
  ctrl.postAdminInvitation
);
router.post(
  '/invitations/:id/revoke',
  requireAdmin({ permission: P.users_roles }),
  actionLimiter,
  ctrl.postRevokeInvitation
);
router.post(
  '/invitations/:id/resend',
  requireAdmin({ permission: P.users_roles }),
  actionLimiter,
  ctrl.postResendInvitation
);

router.get(
  '/official-sources',
  requireAdmin({ permission: P.official_sources }),
  ctrl.getOfficialSources
);
router.get(
  '/official-sources/health',
  requireAdmin({ permission: P.official_sources }),
  ctrl.getOfficialSourceHealth
);
router.get(
  '/official-organizations',
  requireAdmin({ permission: P.official_sources }),
  ctrl.getOfficialOrganizations
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
router.get(
  '/official-sources/:id',
  requireAdmin({ permission: P.official_sources }),
  ctrl.getOfficialAgencyProfile
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
router.get(
  '/official-updates/queue',
  requireAdmin({ permission: P.official_updates }),
  ctrl.getOfficialReviewQueue
);
router.post(
  '/official-updates',
  requireAdmin({ permission: P.official_updates }),
  actionLimiter,
  ctrl.postManualOfficialUpdate
);
router.post(
  '/official-updates/correlate',
  requireAdmin({ permission: P.official_updates }),
  actionLimiter,
  ctrl.postCorrelateOfficialUpdate
);
router.get(
  '/official-updates/:id',
  requireAdmin({ permission: P.official_updates }),
  ctrl.getOfficialUpdateAdminDetail
);
router.post(
  '/official-updates/:id/approve',
  requireAdmin({ permission: P.official_updates }),
  actionLimiter,
  ctrl.postApproveOfficialUpdate
);
router.post(
  '/official-updates/:id/reject',
  requireAdmin({ permission: P.official_updates }),
  actionLimiter,
  ctrl.postRejectOfficialUpdate
);
router.post(
  '/official-updates/:id/correct',
  requireAdmin({ permission: P.official_updates }),
  actionLimiter,
  ctrl.postCorrectOfficialUpdate
);
router.post(
  '/official-updates/:id/associate-traffic',
  requireAdmin({ permission: P.official_updates }),
  actionLimiter,
  ctrl.postAssociateOfficialTraffic
);
router.post(
  '/official-updates/:id/priority',
  requireAdmin({ permission: P.official_updates }),
  actionLimiter,
  ctrl.postOfficialUpdatePriority
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
router.get(
  '/locations/dashboard',
  requireAdmin({ permission: P.locations }),
  ctrl.getAdminLocationDashboard
);
router.get(
  '/locations/tree',
  requireAdmin({ permission: P.locations }),
  ctrl.getAdminLocationTree
);
router.get(
  '/locations/duplicates',
  requireAdmin({ permission: P.locations }),
  ctrl.getAdminLocationDuplicates
);
router.get(
  '/locations/quality',
  requireAdmin({ permission: P.locations }),
  ctrl.getAdminLocationQuality
);
router.post(
  '/locations/areas',
  requireAdmin({ permission: P.locations_edit }),
  actionLimiter,
  ctrl.postAdminLocationArea
);
router.post(
  '/locations/children',
  requireAdmin({ permission: P.locations_edit }),
  actionLimiter,
  ctrl.postAdminLocationChild
);
router.get('/locations/:id', requireAdmin({ permission: P.locations }), ctrl.getAdminLocation);
router.get(
  '/locations/:id/impact',
  requireAdmin({ permission: P.locations }),
  ctrl.getAdminLocationImpact
);
router.patch(
  '/locations/:id',
  requireAdmin({ permission: P.locations_edit }),
  actionLimiter,
  ctrl.patchAdminLocation
);
router.post(
  '/locations/:id/deactivate',
  requireAdmin({ permission: P.locations_edit }),
  actionLimiter,
  ctrl.postAdminLocationDeactivate
);
router.post(
  '/locations/:id/activate',
  requireAdmin({ permission: P.locations_edit }),
  actionLimiter,
  ctrl.postAdminLocationActivate
);
router.post(
  '/locations/:id/aliases',
  requireAdmin({ permission: P.locations_edit }),
  actionLimiter,
  ctrl.postAdminLocationAlias
);
router.delete(
  '/locations/:id/aliases/:aliasId',
  requireAdmin({ permission: P.locations_edit }),
  actionLimiter,
  ctrl.deleteAdminLocationAlias
);
router.get(
  '/locations-unresolved',
  requireAdmin({ permission: P.locations }),
  ctrl.getUnresolvedLocations
);
router.post(
  '/locations-unresolved/:id/resolve',
  requireAdmin({ permission: P.locations_edit }),
  actionLimiter,
  ctrl.postResolveLocationQueue
);
router.post(
  '/locations/:id/verify',
  requireAdmin({ permission: P.locations_edit }),
  actionLimiter,
  ctrl.postVerifyLocation
);
router.post(
  '/locations/:id/merge',
  requireAdmin({ permission: P.locations_edit }),
  actionLimiter,
  ctrl.postMergeLocations
);
router.get(
  '/locations-conflicts',
  requireAdmin({ permission: P.locations }),
  ctrl.getLocationConflicts
);
router.get(
  '/geocoding/health',
  requireAdmin({ permission: P.locations }),
  ctrl.getGeocodingHealth
);
router.get(
  '/locations-search-metrics',
  requireAdmin({ permission: P.locations }),
  ctrl.getLocationSearchMetrics
);

router.get('/fuel-stations', requireAdmin({ permission: P.fuel_stations }), ctrl.getFuelStations);
router.get(
  '/fuel-stations/dashboard',
  requireAdmin({ permission: P.fuel_stations }),
  ctrl.getFuelDashboard
);
router.get(
  '/fuel-stations/submissions',
  requireAdmin({ permission: P.fuel_stations }),
  ctrl.getFuelSubmissions
);
router.get(
  '/fuel-stations/conflicts',
  requireAdmin({ permission: P.fuel_stations }),
  ctrl.getFuelConflicts
);
router.get(
  '/fuel-stations/duplicates',
  requireAdmin({ permission: P.fuel_stations }),
  ctrl.getFuelDuplicates
);
router.get(
  '/fuel-stations/quality',
  requireAdmin({ permission: P.fuel_stations }),
  ctrl.getFuelQuality
);
router.get(
  '/fuel-stations/sources',
  requireAdmin({ permission: P.fuel_stations }),
  ctrl.getFuelOfficialSources
);
router.get(
  '/fuel-stations/brands',
  requireAdmin({ permission: P.fuel_stations }),
  ctrl.getFuelBrands
);
router.get(
  '/fuel-stations/brand-catalogue',
  requireAdmin({ permission: P.fuel_stations }),
  ctrl.getFuelBrandCatalogue
);
router.post(
  '/fuel-stations/brands',
  requireAdmin({ permission: P.fuel_stations }),
  actionLimiter,
  ctrl.postFuelBrand
);
router.get(
  '/fuel-stations/products',
  requireAdmin({ permission: P.fuel_stations }),
  ctrl.getFuelProducts
);
router.get(
  '/fuel-stations/anomalies',
  requireAdmin({ permission: P.fuel_stations }),
  ctrl.getFuelPriceAnomalies
);
router.get(
  '/fuel-stations/compare',
  requireAdmin({ permission: P.fuel_stations }),
  ctrl.getFuelCompare
);
router.post(
  '/fuel-stations/availability',
  requireAdmin({ permission: P.fuel_stations }),
  actionLimiter,
  ctrl.postFuelAvailability
);
router.post(
  '/fuel-stations/merge',
  requireAdmin({ permission: P.fuel_stations }),
  actionLimiter,
  ctrl.postFuelStationMerge
);
router.get(
  '/fuel-stations/similar',
  requireAdmin({ permission: P.fuel_stations }),
  ctrl.getFuelSimilarStations
);
router.post(
  '/fuel-stations',
  requireAdmin({ permission: P.fuel_stations }),
  actionLimiter,
  ctrl.postFuelStation
);
router.get(
  '/fuel-stations/:id',
  requireAdmin({ permission: P.fuel_stations }),
  ctrl.getFuelStationDetail
);
router.get(
  '/fuel-stations/:id/history',
  requireAdmin({ permission: P.fuel_stations }),
  ctrl.getFuelPriceHistory
);
router.patch(
  '/fuel-stations/:id',
  requireAdmin({ permission: P.fuel_stations }),
  actionLimiter,
  ctrl.patchFuelStation
);
router.post(
  '/fuel-stations/:id/aliases',
  requireAdmin({ permission: P.fuel_stations }),
  actionLimiter,
  ctrl.postFuelStationAlias
);
router.delete(
  '/fuel-stations/:id/aliases/:aliasId',
  requireAdmin({ permission: P.fuel_stations }),
  actionLimiter,
  ctrl.deleteFuelStationAlias
);

router.get('/traffic/dashboard', requireAdmin({ permission: P.traffic }), ctrl.getTrafficDashboard);
router.get('/traffic/events/vocab', requireAdmin({ permission: P.traffic }), ctrl.getTrafficEventVocab);
router.get('/traffic/events', requireAdmin({ permission: P.traffic }), ctrl.getTrafficEvents);
router.post(
  '/traffic/events',
  requireAdmin({ permission: P.traffic }),
  actionLimiter,
  ctrl.postTrafficEvent
);
router.get('/traffic/events/:id', requireAdmin({ permission: P.traffic }), ctrl.getTrafficEventDetail);
router.patch(
  '/traffic/events/:id',
  requireAdmin({ permission: P.traffic }),
  actionLimiter,
  ctrl.patchTrafficEvent
);
router.post(
  '/traffic/events/:id/resolve',
  requireAdmin({ permission: P.traffic }),
  actionLimiter,
  ctrl.postResolveTrafficEvent
);
router.post(
  '/traffic/events/:id/link-report',
  requireAdmin({ permission: P.traffic }),
  actionLimiter,
  ctrl.postLinkTrafficEventReport
);
router.post(
  '/traffic/events/:id/merge',
  requireAdmin({ permission: P.traffic }),
  actionLimiter,
  ctrl.postMergeTrafficEvent
);
router.post(
  '/traffic/events/:id/split',
  requireAdmin({ permission: P.traffic }),
  actionLimiter,
  ctrl.postSplitTrafficEvent
);
router.post(
  '/traffic/events/:id/flag-duplicate',
  requireAdmin({ permission: P.traffic }),
  actionLimiter,
  ctrl.postFlagTrafficEventDuplicate
);
router.post(
  '/traffic/events/:id/recompute-confidence',
  requireAdmin({ permission: P.traffic }),
  actionLimiter,
  ctrl.postRecomputeTrafficEventConfidence
);
router.get(
  '/traffic/event-duplicates',
  requireAdmin({ permission: P.traffic }),
  ctrl.getTrafficEventDuplicates
);
router.post(
  '/traffic/events/expire-stale',
  requireAdmin({ permission: P.traffic }),
  actionLimiter,
  ctrl.postExpireTrafficEvents
);
router.get('/traffic/roads', requireAdmin({ permission: P.traffic }), ctrl.getTrafficRoads);
router.post(
  '/traffic/road-segments',
  requireAdmin({ permission: P.traffic }),
  actionLimiter,
  ctrl.postRoadSegment
);
router.post(
  '/traffic/roads/:id/aliases',
  requireAdmin({ permission: P.traffic }),
  actionLimiter,
  ctrl.postRoadAlias
);
router.get('/traffic', requireAdmin({ permission: P.traffic }), ctrl.getTrafficReports);
router.get('/traffic/duplicates', requireAdmin({ permission: P.traffic }), ctrl.getTrafficDuplicates);
router.get('/traffic/quality', requireAdmin({ permission: P.traffic }), ctrl.getTrafficQuality);
router.get('/traffic/sources', requireAdmin({ permission: P.traffic }), ctrl.getTrafficOfficialSources);
router.get('/traffic/:id', requireAdmin({ permission: P.traffic }), ctrl.getTrafficReportDetail);
router.patch(
  '/traffic/:id',
  requireAdmin({ permission: P.traffic }),
  actionLimiter,
  ctrl.patchTrafficReport
);

router.get(
  '/transport-routes/dashboard',
  requireAdmin({ permission: P.transport }),
  ctrl.getTransportDashboard
);
router.get('/transport-routes', requireAdmin({ permission: P.transport }), ctrl.getTransportRoutes);
router.post(
  '/transport-routes',
  requireAdmin({ permission: P.transport }),
  actionLimiter,
  ctrl.postTransportRoute
);
router.get(
  '/transport-routes/directory-stops',
  requireAdmin({ permission: P.transport }),
  ctrl.getTransportDirectoryStops
);
router.post(
  '/transport-routes/directory-stops',
  requireAdmin({ permission: P.transport }),
  actionLimiter,
  ctrl.postTransportDirectoryStop
);
router.get(
  '/transport-routes/stops',
  requireAdmin({ permission: P.transport }),
  ctrl.getTransportStops
);
router.get(
  '/transport-routes/fares',
  requireAdmin({ permission: P.transport }),
  ctrl.getTransportFares
);
router.get(
  '/transport-routes/conflicts',
  requireAdmin({ permission: P.transport }),
  ctrl.getTransportFareConflicts
);
router.get(
  '/transport-routes/anomalies',
  requireAdmin({ permission: P.transport }),
  ctrl.getTransportFareAnomalies
);
router.get(
  '/transport-routes/duplicates',
  requireAdmin({ permission: P.transport }),
  ctrl.getTransportDuplicates
);
router.get(
  '/transport-routes/quality',
  requireAdmin({ permission: P.transport }),
  ctrl.getTransportQuality
);
router.get(
  '/transport-routes/:id',
  requireAdmin({ permission: P.transport }),
  ctrl.getTransportRouteDetail
);
router.patch(
  '/transport-routes/:id',
  requireAdmin({ permission: P.transport }),
  actionLimiter,
  ctrl.patchTransportRoute
);
router.patch(
  '/transport-stops/:id',
  requireAdmin({ permission: P.transport }),
  actionLimiter,
  ctrl.patchTransportStop
);

router.get('/commodities', requireAdmin({ permission: P.commodities }), ctrl.getCommodities);
router.get(
  '/commodities/dashboard',
  requireAdmin({ permission: P.commodities }),
  ctrl.getCommodityDashboard
);
router.get(
  '/commodities/categories',
  requireAdmin({ permission: P.commodities }),
  ctrl.getCommodityCategories
);
router.get(
  '/commodities/observations',
  requireAdmin({ permission: P.commodities }),
  ctrl.getCommodityObservations
);
router.get(
  '/commodities/observations/:id',
  requireAdmin({ permission: P.commodities }),
  ctrl.getCommodityObservationDetail
);
router.patch(
  '/commodities/observations/:id',
  requireAdmin({ permission: P.commodities }),
  actionLimiter,
  ctrl.patchCommodityObservation
);
router.get(
  '/commodities/markets',
  requireAdmin({ permission: P.commodities }),
  ctrl.getCommodityMarkets
);
router.post(
  '/commodities/markets',
  requireAdmin({ permission: P.commodities }),
  actionLimiter,
  ctrl.postCommodityMarket
);
router.patch(
  '/commodities/markets/:id',
  requireAdmin({ permission: P.commodities }),
  actionLimiter,
  ctrl.patchCommodityMarket
);
router.post(
  '/commodities/markets/:id/aliases',
  requireAdmin({ permission: P.commodities }),
  actionLimiter,
  ctrl.postCommodityMarketAlias
);
router.delete(
  '/commodities/markets/:id/aliases/:aliasId',
  requireAdmin({ permission: P.commodities }),
  actionLimiter,
  ctrl.deleteCommodityMarketAlias
);
router.get(
  '/commodities/conflicts',
  requireAdmin({ permission: P.commodities }),
  ctrl.getCommodityConflicts
);
router.get(
  '/commodities/duplicates',
  requireAdmin({ permission: P.commodities }),
  ctrl.getCommodityDuplicates
);
router.get(
  '/commodities/quality',
  requireAdmin({ permission: P.commodities }),
  ctrl.getCommodityQuality
);
router.get(
  '/commodities/sources',
  requireAdmin({ permission: P.commodities }),
  ctrl.getCommodityOfficialSources
);
router.get(
  '/commodities/anomalies',
  requireAdmin({ permission: P.commodities }),
  ctrl.getCommodityPriceAnomalies
);
router.get(
  '/commodities/compare',
  requireAdmin({ permission: P.commodities }),
  ctrl.getCommodityCompare
);
router.post(
  '/commodities/markets/merge',
  requireAdmin({ permission: P.commodities }),
  actionLimiter,
  ctrl.postCommodityMarketMerge
);
router.post(
  '/commodities',
  requireAdmin({ permission: P.commodities }),
  actionLimiter,
  ctrl.postCommodity
);
router.get('/commodities/:id', requireAdmin({ permission: P.commodities }), ctrl.getCommodityDetail);
router.patch(
  '/commodities/:id',
  requireAdmin({ permission: P.commodities }),
  actionLimiter,
  ctrl.patchCommodity
);
router.post(
  '/commodities/:id/variants',
  requireAdmin({ permission: P.commodities }),
  actionLimiter,
  ctrl.postCommodityVariant
);
router.patch(
  '/commodity-variants/:id',
  requireAdmin({ permission: P.commodities }),
  actionLimiter,
  ctrl.patchCommodityVariant
);

router.get('/community', requireAdmin({ permission: P.community }), ctrl.getCommunity);

router.get(
  '/notifications/dashboard',
  requireAdmin({ permission: P.notifications }),
  ctrl.getNotificationDashboard
);
router.get(
  '/notifications/rules',
  requireAdmin({ permission: P.notifications }),
  ctrl.getNotificationRules
);
router.patch(
  '/notifications/rules/:code',
  requireAdmin({ permission: P.notifications }),
  actionLimiter,
  ctrl.patchNotificationRule
);
router.post(
  '/notifications/emergency',
  requireAdmin({ permission: P.notifications }),
  actionLimiter,
  ctrl.postEmergencyNotification
);

router.get('/audit-log', requireAdmin({ permission: P.audit_log }), ctrl.getAuditLog);

export default router;
