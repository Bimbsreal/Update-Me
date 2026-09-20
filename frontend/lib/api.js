export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api/v1';

export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new ApiError(data?.message || 'Request failed', {
      status: response.status,
      code: data?.code,
      details: data?.details,
    });
  }

  return data;
}

export const authApi = {
  register: (body) =>
    apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => apiFetch('/auth/logout', { method: 'POST', body: '{}' }),
  me: () => apiFetch('/auth/me'),
  setLocation: (areaId) =>
    apiFetch('/auth/me/location', {
      method: 'PATCH',
      body: JSON.stringify({ areaId }),
    }),
};

export const geoApi = {
  states: () => apiFetch('/geo/states'),
  lgas: (stateId) => apiFetch(`/geo/states/${stateId}/lgas`),
  areas: (lgaId) => apiFetch(`/geo/lgas/${lgaId}/areas`),
  resolve: (lat, lng) =>
    apiFetch('/geo/resolve', {
      method: 'POST',
      body: JSON.stringify({ lat, lng }),
    }),
};

export const locationsApi = {
  search: (q, params = {}) => {
    const query = new URLSearchParams({ q, ...params });
    return apiFetch(`/locations/search?${query.toString()}`);
  },
  get: (id) => apiFetch(`/locations/${id}`),
  nearby: (lat, lng, params = {}) => {
    const query = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      ...Object.fromEntries(
        Object.entries(params).map(([k, v]) => [k, String(v)])
      ),
    });
    return apiFetch(`/locations/nearby?${query.toString()}`);
  },
  states: () => apiFetch('/locations/states'),
  lgas: (stateId) => apiFetch(`/locations/states/${stateId}/lgas`),
  areas: (lgaId) => apiFetch(`/locations/lgas/${lgaId}/areas`),
  setMyLocation: (body) =>
    apiFetch('/locations/me', { method: 'PATCH', body: JSON.stringify(body) }),
  capabilities: () => apiFetch('/locations/capabilities'),
};

export const reportsApi = {
  categories: () => apiFetch('/reports/categories'),
  list: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    );
    return apiFetch(`/reports?${query.toString()}`);
  },
  get: (id) => apiFetch(`/reports/${id}`),
  nearby: (lat, lng, params = {}) => {
    const query = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      ...Object.fromEntries(
        Object.entries(params).map(([k, v]) => [k, String(v)])
      ),
    });
    return apiFetch(`/reports/nearby?${query.toString()}`);
  },
  create: (body) => apiFetch('/reports', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) =>
    apiFetch(`/reports/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  confirm: (id, body = {}) =>
    apiFetch(`/reports/${id}/confirm`, { method: 'POST', body: JSON.stringify(body) }),
  correct: (id, body) =>
    apiFetch(`/reports/${id}/correct`, { method: 'POST', body: JSON.stringify(body) }),
  flag: (id, body) =>
    apiFetch(`/reports/${id}/flag`, { method: 'POST', body: JSON.stringify(body) }),
  history: (id) => apiFetch(`/reports/${id}/history`),
};

export const trafficApi = {
  list: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    );
    return apiFetch(`/traffic?${query.toString()}`);
  },
  summary: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    );
    return apiFetch(`/traffic/summary?${query.toString()}`);
  },
  nearby: (lat, lng, params = {}) => {
    const query = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    });
    return apiFetch(`/traffic/nearby?${query.toString()}`);
  },
  get: (id) => apiFetch(`/traffic/${id}`),
  create: (body) => apiFetch('/traffic', { method: 'POST', body: JSON.stringify(body) }),
  confirm: (id, body = {}) =>
    apiFetch(`/traffic/${id}/confirm`, { method: 'POST', body: JSON.stringify(body) }),
  correct: (id, body) =>
    apiFetch(`/traffic/${id}/correct`, { method: 'POST', body: JSON.stringify(body) }),
  history: (id) => apiFetch(`/traffic/${id}/history`),
};

export const fxApi = {
  currencies: () => apiFetch('/fx/currencies'),
  latest: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : String(v)])
      )
    );
    const qs = query.toString();
    return apiFetch(`/fx/latest${qs ? `?${qs}` : ''}`);
  },
  history: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    );
    return apiFetch(`/fx/history?${query.toString()}`);
  },
  pair: (base, quote) => apiFetch(`/fx/${encodeURIComponent(base)}/${encodeURIComponent(quote)}`),
};

export const officialApi = {
  taxonomy: () => apiFetch('/official-updates/taxonomy'),
  sources: () => apiFetch('/official-updates/sources'),
  list: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    );
    const qs = query.toString();
    return apiFetch(`/official-updates${qs ? `?${qs}` : ''}`);
  },
  get: (id) => apiFetch(`/official-updates/${id}`),
  nearby: (lat, lng, params = {}) => {
    const query = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    });
    return apiFetch(`/official-updates/nearby?${query.toString()}`);
  },
  context: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    );
    return apiFetch(`/official-updates/context?${query.toString()}`);
  },
};

export const fuelApi = {
  taxonomy: () => apiFetch('/fuel/taxonomy'),
  summary: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    );
    const qs = query.toString();
    return apiFetch(`/fuel/summary${qs ? `?${qs}` : ''}`);
  },
  stations: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    );
    const qs = query.toString();
    return apiFetch(`/fuel/stations${qs ? `?${qs}` : ''}`);
  },
  station: (id) => apiFetch(`/fuel/stations/${id}`),
  createStation: (body) =>
    apiFetch('/fuel/stations', { method: 'POST', body: JSON.stringify(body) }),
  nearby: (lat, lng, params = {}) => {
    const query = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    });
    return apiFetch(`/fuel/nearby?${query.toString()}`);
  },
  reports: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    );
    const qs = query.toString();
    return apiFetch(`/fuel/reports${qs ? `?${qs}` : ''}`);
  },
  report: (id) => apiFetch(`/fuel/reports/${id}`),
  createReport: (body) =>
    apiFetch('/fuel/reports', { method: 'POST', body: JSON.stringify(body) }),
  confirm: (id, body = {}) =>
    apiFetch(`/fuel/reports/${id}/confirm`, { method: 'POST', body: JSON.stringify(body) }),
  correct: (id, body) =>
    apiFetch(`/fuel/reports/${id}/correct`, { method: 'POST', body: JSON.stringify(body) }),
  history: (id) => apiFetch(`/fuel/reports/${id}/history`),
};

export const transportApi = {
  taxonomy: () => apiFetch('/transport/taxonomy'),
  summary: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    );
    const qs = query.toString();
    return apiFetch(`/transport/summary${qs ? `?${qs}` : ''}`);
  },
  routes: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    );
    const qs = query.toString();
    return apiFetch(`/transport/routes${qs ? `?${qs}` : ''}`);
  },
  route: (id) => apiFetch(`/transport/routes/${id}`),
  createRoute: (body) =>
    apiFetch('/transport/routes', { method: 'POST', body: JSON.stringify(body) }),
  search: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    );
    return apiFetch(`/transport/search?${query.toString()}`);
  },
  fares: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    );
    const qs = query.toString();
    return apiFetch(`/transport/fares${qs ? `?${qs}` : ''}`);
  },
  fare: (id) => apiFetch(`/transport/fares/${id}`),
  createFare: (body) =>
    apiFetch('/transport/fares', { method: 'POST', body: JSON.stringify(body) }),
  confirm: (id, body = {}) =>
    apiFetch(`/transport/fares/${id}/confirm`, { method: 'POST', body: JSON.stringify(body) }),
  correct: (id, body) =>
    apiFetch(`/transport/fares/${id}/correct`, { method: 'POST', body: JSON.stringify(body) }),
  history: (id) => apiFetch(`/transport/fares/${id}/history`),
};

export const pricesApi = {
  taxonomy: () => apiFetch('/prices/taxonomy'),
  commodities: () => apiFetch('/prices/commodities'),
  summary: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    );
    const qs = query.toString();
    return apiFetch(`/prices/summary${qs ? `?${qs}` : ''}`);
  },
  list: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    );
    const qs = query.toString();
    return apiFetch(`/prices${qs ? `?${qs}` : ''}`);
  },
  detail: (commodity, variant, params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    );
    const qs = query.toString();
    return apiFetch(`/prices/${encodeURIComponent(commodity)}/${encodeURIComponent(variant)}${qs ? `?${qs}` : ''}`);
  },
  nearby: (lat, lng, params = {}) => {
    const query = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    });
    return apiFetch(`/prices/nearby?${query.toString()}`);
  },
  create: (body) => apiFetch('/prices', { method: 'POST', body: JSON.stringify(body) }),
  report: (id) => apiFetch(`/prices/reports/${id}`),
  confirm: (id, body = {}) =>
    apiFetch(`/prices/${id}/confirm`, { method: 'POST', body: JSON.stringify(body) }),
  correct: (id, body) =>
    apiFetch(`/prices/${id}/correct`, { method: 'POST', body: JSON.stringify(body) }),
  reportHistory: (id) => apiFetch(`/prices/${id}/history`),
};

export const alertsApi = {
  taxonomy: () => apiFetch('/alerts/taxonomy'),
  list: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    );
    const qs = query.toString();
    return apiFetch(`/alerts${qs ? `?${qs}` : ''}`);
  },
  nearby: (lat, lng, params = {}) => {
    const query = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      ...Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      ),
    });
    return apiFetch(`/alerts/nearby?${query.toString()}`);
  },
  get: (id) => apiFetch(`/alerts/${id}`),
  create: (body) => apiFetch('/alerts', { method: 'POST', body: JSON.stringify(body) }),
  confirm: (id, body = {}) =>
    apiFetch(`/alerts/${id}/confirm`, { method: 'POST', body: JSON.stringify(body) }),
  correct: (id, body) =>
    apiFetch(`/alerts/${id}/correct`, { method: 'POST', body: JSON.stringify(body) }),
  flag: (id, body) =>
    apiFetch(`/alerts/${id}/flag`, { method: 'POST', body: JSON.stringify(body) }),
  history: (id) => apiFetch(`/alerts/${id}/history`),
};

export const directionsApi = {
  taxonomy: () => apiFetch('/directions/taxonomy'),
  search: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    );
    return apiFetch(`/directions?${query.toString()}`);
  },
  get: (id) => apiFetch(`/directions/${encodeURIComponent(id)}`),
  localKnowledge: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    );
    const qs = query.toString();
    return apiFetch(`/directions/local-knowledge${qs ? `?${qs}` : ''}`);
  },
  createLocalKnowledge: (body) =>
    apiFetch('/directions/local-knowledge', { method: 'POST', body: JSON.stringify(body) }),
  confirmLocalKnowledge: (id, body = {}) =>
    apiFetch(`/directions/local-knowledge/${id}/confirm`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  correctLocalKnowledge: (id, body) =>
    apiFetch(`/directions/local-knowledge/${id}/correct`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

export const notificationsApi = {
  taxonomy: () => apiFetch('/notifications/taxonomy'),
  list: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    );
    return apiFetch(`/notifications?${query.toString()}`);
  },
  unreadCount: () => apiFetch('/notifications/unread-count'),
  markRead: (id) => apiFetch(`/notifications/${id}/read`, { method: 'POST', body: '{}' }),
  markAllRead: () => apiFetch('/notifications/read-all', { method: 'POST', body: '{}' }),
};

export const userApi = {
  personalization: () => apiFetch('/user/personalization'),
  notificationPreferences: () => apiFetch('/user/notification-preferences'),
  updateNotificationPreferences: (preferences) =>
    apiFetch('/user/notification-preferences', {
      method: 'PUT',
      body: JSON.stringify({ preferences }),
    }),
  savedAreas: () => apiFetch('/user/saved-areas'),
  createSavedArea: (body) =>
    apiFetch('/user/saved-areas', { method: 'POST', body: JSON.stringify(body) }),
  updateSavedArea: (id, body) =>
    apiFetch(`/user/saved-areas/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteSavedArea: (id) => apiFetch(`/user/saved-areas/${id}`, { method: 'DELETE' }),
  savedRoutes: () => apiFetch('/user/saved-routes'),
  createSavedRoute: (body) =>
    apiFetch('/user/saved-routes', { method: 'POST', body: JSON.stringify(body) }),
  updateSavedRoute: (id, body) =>
    apiFetch(`/user/saved-routes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteSavedRoute: (id) => apiFetch(`/user/saved-routes/${id}`, { method: 'DELETE' }),
};

export const homeApi = {
  get: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    );
    const qs = query.toString();
    return apiFetch(`/home${qs ? `?${qs}` : ''}`);
  },
};

export const communityApi = {
  taxonomy: () => apiFetch('/community/taxonomy'),
  listQuestions: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    );
    return apiFetch(`/community/questions?${query.toString()}`);
  },
  getQuestion: (id) => apiFetch(`/community/questions/${id}`),
  createQuestion: (body) =>
    apiFetch('/community/questions', { method: 'POST', body: JSON.stringify(body) }),
  createAnswer: (questionId, body) =>
    apiFetch(`/community/questions/${questionId}/answers`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateAnswer: (id, body) =>
    apiFetch(`/community/answers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  markUseful: (id, body = {}) =>
    apiFetch(`/community/answers/${id}/useful`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  markInaccurate: (id, body = {}) =>
    apiFetch(`/community/answers/${id}/inaccurate`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  flagQuestion: (id, body) =>
    apiFetch(`/community/questions/${id}/flag`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

function adminQuery(params = {}) {
  const query = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params)
        .filter(([, v]) => v != null && v !== '')
        .map(([k, v]) => [k, String(v)])
    )
  );
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}

export const adminApi = {
  me: () => apiFetch('/admin/me'),
  dashboard: () => apiFetch('/admin/dashboard'),
  dataQuality: () => apiFetch('/admin/data-quality'),
  dataQualityReports: (params = {}) =>
    apiFetch(`/admin/data-quality/reports${adminQuery(params)}`),
  dataQualityConflicts: (params = {}) =>
    apiFetch(`/admin/data-quality/conflicts${adminQuery(params)}`),
  dataQualityStale: (params = {}) =>
    apiFetch(`/admin/data-quality/stale${adminQuery(params)}`),
  dataQualityExpired: (params = {}) =>
    apiFetch(`/admin/data-quality/expired${adminQuery(params)}`),
  search: (q, params = {}) => apiFetch(`/admin/search${adminQuery({ q, ...params })}`),
  moderation: (params = {}) => apiFetch(`/admin/moderation${adminQuery(params)}`),
  moderationAction: (id, body) =>
    apiFetch(`/admin/moderation/${encodeURIComponent(id)}/action`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  reports: (params = {}) => apiFetch(`/admin/reports${adminQuery(params)}`),
  alerts: (params = {}) => apiFetch(`/admin/alerts${adminQuery(params)}`),
  alertAction: (id, body) =>
    apiFetch(`/admin/alerts/${id}/action`, { method: 'POST', body: JSON.stringify(body) }),
  users: (params = {}) => apiFetch(`/admin/users${adminQuery(params)}`),
  user: (id) => apiFetch(`/admin/users/${id}`),
  suspendUser: (id, body) =>
    apiFetch(`/admin/users/${id}/suspend`, { method: 'POST', body: JSON.stringify(body) }),
  restoreUser: (id, body = {}) =>
    apiFetch(`/admin/users/${id}/restore`, { method: 'POST', body: JSON.stringify(body) }),
  setUserRole: (id, body) =>
    apiFetch(`/admin/users/${id}/role`, { method: 'PATCH', body: JSON.stringify(body) }),
  officialSources: () => apiFetch('/admin/official-sources'),
  ingestionRuns: (params = {}) => apiFetch(`/admin/ingestion-runs${adminQuery(params)}`),
  createOfficialSource: (body) =>
    apiFetch('/admin/official-sources', { method: 'POST', body: JSON.stringify(body) }),
  updateOfficialSource: (id, body) =>
    apiFetch(`/admin/official-sources/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  syncOfficialSource: (id) =>
    apiFetch(`/admin/official-sources/${id}/sync`, { method: 'POST', body: '{}' }),
  syncOfficialAll: () =>
    apiFetch('/admin/official-sources/sync', { method: 'POST', body: '{}' }),
  officialUpdates: (params = {}) => apiFetch(`/admin/official-updates${adminQuery(params)}`),
  hideOfficialUpdate: (id, body) =>
    apiFetch(`/admin/official-updates/${id}/hide`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  restoreOfficialUpdate: (id, body = {}) =>
    apiFetch(`/admin/official-updates/${id}/restore`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  fx: () => apiFetch('/admin/fx'),
  fxSync: () => apiFetch('/admin/fx/sync', { method: 'POST', body: '{}' }),
  locations: (params = {}) => apiFetch(`/admin/locations${adminQuery(params)}`),
  fuelStations: (params = {}) => apiFetch(`/admin/fuel-stations${adminQuery(params)}`),
  patchFuelStation: (id, body) =>
    apiFetch(`/admin/fuel-stations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  transportRoutes: (params = {}) => apiFetch(`/admin/transport-routes${adminQuery(params)}`),
  patchTransportRoute: (id, body) =>
    apiFetch(`/admin/transport-routes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  commodities: (params = {}) => apiFetch(`/admin/commodities${adminQuery(params)}`),
  patchCommodity: (id, body) =>
    apiFetch(`/admin/commodities/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  community: (params = {}) => apiFetch(`/admin/community${adminQuery(params)}`),
  auditLog: (params = {}) => apiFetch(`/admin/audit-log${adminQuery(params)}`),
};

function exploreQuery(params = {}) {
  const query = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params)
        .filter(([, v]) => v != null && v !== '')
        .map(([k, v]) => [k, String(v)])
    )
  );
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}

export const exploreApi = {
  taxonomy: () => apiFetch('/explore/taxonomy'),
  search: (q, params = {}) => apiFetch(`/explore/search${exploreQuery({ q, ...params })}`),
  list: (params = {}) => apiFetch(`/explore${exploreQuery(params)}`),
};

export const searchApi = {
  search: (q, params = {}) => apiFetch(`/search${exploreQuery({ q, ...params })}`),
  suggest: (q, params = {}) => apiFetch(`/search/suggest${exploreQuery({ q, ...params })}`),
  recent: (params = {}) => apiFetch(`/search/recent${exploreQuery(params)}`),
  clearRecent: () => apiFetch('/search/recent', { method: 'DELETE' }),
};
