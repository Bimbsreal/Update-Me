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
  resolve: (lat, lng, accuracy) =>
    apiFetch('/geo/resolve', {
      method: 'POST',
      body: JSON.stringify({
        lat,
        lng,
        ...(accuracy != null ? { accuracy } : {}),
      }),
    }),
};

export const locationsApi = {
  search: (q, params = {}) => {
    const query = new URLSearchParams({ q, ...params });
    return apiFetch(`/locations/search?${query.toString()}`);
  },
  resolve: (q, params = {}) => {
    const query = new URLSearchParams({
      q,
      ...Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      ),
    });
    return apiFetch(`/locations/resolve?${query.toString()}`);
  },
  geocode: (q) => apiFetch(`/locations/geocode?${new URLSearchParams({ q })}`),
  reverseGeocode: (lat, lng) =>
    apiFetch(`/locations/reverse-geocode?${new URLSearchParams({ lat: String(lat), lng: String(lng) })}`),
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
  events: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    );
    return apiFetch(`/traffic/events?${query.toString()}`);
  },
  event: (id) => apiFetch(`/traffic/events/${id}`),
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
  source: (id) => apiFetch(`/official-updates/sources/${encodeURIComponent(id)}`),
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
  station: (id, params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    );
    const qs = query.toString();
    return apiFetch(`/fuel/stations/${id}${qs ? `?${qs}` : ''}`);
  },
  stationHistory: (id, params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    );
    const qs = query.toString();
    return apiFetch(`/fuel/stations/${id}/history${qs ? `?${qs}` : ''}`);
  },
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
  compare: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    );
    const qs = query.toString();
    return apiFetch(`/fuel/compare${qs ? `?${qs}` : ''}`);
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
  compare: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    );
    const qs = query.toString();
    return apiFetch(`/prices/compare${qs ? `?${qs}` : ''}`);
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
  archive: (id) => apiFetch(`/notifications/${id}/archive`, { method: 'POST', body: '{}' }),
  pushConfig: () => apiFetch('/notifications/push/config'),
  pushSubscriptions: () => apiFetch('/notifications/push/subscriptions'),
  pushSubscribe: (body) =>
    apiFetch('/notifications/push/subscribe', { method: 'POST', body: JSON.stringify(body) }),
  pushUnsubscribe: (body) =>
    apiFetch('/notifications/push/unsubscribe', { method: 'POST', body: JSON.stringify(body) }),
};

export const userApi = {
  personalization: () => apiFetch('/user/personalization'),
  notificationPreferences: () => apiFetch('/user/notification-preferences'),
  updateNotificationPreferences: (preferences) =>
    apiFetch('/user/notification-preferences', {
      method: 'PUT',
      body: JSON.stringify({ preferences }),
    }),
  alertSubscriptions: () => apiFetch('/user/alert-subscriptions'),
  createAlertSubscription: (body) =>
    apiFetch('/user/alert-subscriptions', { method: 'POST', body: JSON.stringify(body) }),
  updateAlertSubscription: (id, body) =>
    apiFetch(`/user/alert-subscriptions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteAlertSubscription: (id) =>
    apiFetch(`/user/alert-subscriptions/${id}`, { method: 'DELETE' }),
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
  systemHealth: () => apiFetch('/admin/system-health'),
  analyticsOverview: (params = {}) => apiFetch(`/admin/analytics${adminQuery(params)}`),
  analyticsProduct: (params = {}) => apiFetch(`/admin/analytics/product${adminQuery(params)}`),
  analyticsDomain: (domain, params = {}) =>
    apiFetch(`/admin/analytics/domains/${encodeURIComponent(domain)}${adminQuery(params)}`),
  analyticsOperations: () => apiFetch('/admin/analytics/operations'),
  analyticsDataQuality: () => apiFetch('/admin/analytics/data-quality'),
  analyticsSecurity: (params = {}) => apiFetch(`/admin/analytics/security${adminQuery(params)}`),
  analyticsExport: async (params = {}) => {
    const qs = adminQuery(params);
    const response = await fetch(`${API_BASE_URL}/admin/analytics/export${qs}`, {
      credentials: 'include',
    });
    if (!response.ok) {
      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      throw new ApiError(data?.message || 'Export failed', {
        status: response.status,
        code: data?.code,
      });
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/);
    return { blob, filename: match?.[1] || `analytics-export.${params.format || 'json'}` };
  },
  dataQuality: () => apiFetch('/admin/data-quality'),
  dataQualityIntelligence: () => apiFetch('/admin/data-quality/intelligence'),
  dataQualityDomain: (domain) =>
    apiFetch(`/admin/data-quality/domains/${encodeURIComponent(domain)}`),
  dataQualityEvents: (params = {}) =>
    apiFetch(`/admin/data-quality/events${adminQuery(params)}`),
  dataQualityReviewQueue: (params = {}) =>
    apiFetch(`/admin/data-quality/review-queue${adminQuery(params)}`),
  dataQualityResolveEvent: (id, body) =>
    apiFetch(`/admin/data-quality/events/${encodeURIComponent(id)}/resolve`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  dataQualityRules: (params = {}) =>
    apiFetch(`/admin/data-quality/rules${adminQuery(params)}`),
  dataQualityPatchRule: (code, body) =>
    apiFetch(`/admin/data-quality/rules/${encodeURIComponent(code)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  dataQualityScanAnomalies: () =>
    apiFetch('/admin/data-quality/scan-anomalies', { method: 'POST', body: '{}' }),
  dataQualityInspect: (entityType, entityId) =>
    apiFetch(
      `/admin/data-quality/inspect/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`
    ),
  dataQualityReports: (params = {}) =>
    apiFetch(`/admin/data-quality/reports${adminQuery(params)}`),
  dataQualityConflicts: (params = {}) =>
    apiFetch(`/admin/data-quality/conflicts${adminQuery(params)}`),
  dataQualityStale: (params = {}) =>
    apiFetch(`/admin/data-quality/stale${adminQuery(params)}`),
  dataQualityExpired: (params = {}) =>
    apiFetch(`/admin/data-quality/expired${adminQuery(params)}`),
  search: (q, params = {}) => apiFetch(`/admin/search${adminQuery({ q, ...params })}`),
  searchIntelligence: (params = {}) =>
    apiFetch(`/admin/search/intelligence${adminQuery(params)}`),
  searchAliases: (params = {}) => apiFetch(`/admin/search/aliases${adminQuery(params)}`),
  upsertSearchAlias: (body) =>
    apiFetch('/admin/search/aliases', { method: 'POST', body: JSON.stringify(body) }),
  deleteSearchAlias: (id, body = {}) =>
    apiFetch(`/admin/search/aliases/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      body: JSON.stringify(body),
    }),
  purgeSearchStale: () =>
    apiFetch('/admin/search/purge-stale', { method: 'POST', body: '{}' }),
  moderation: (params = {}) => apiFetch(`/admin/moderation${adminQuery(params)}`),
  moderationMetrics: () => apiFetch('/admin/moderation/metrics'),
  moderationDetail: (id) => apiFetch(`/admin/moderation/${encodeURIComponent(id)}`),
  moderationAction: (id, body) =>
    apiFetch(`/admin/moderation/${encodeURIComponent(id)}/action`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  correctReportLocation: (id, body) =>
    apiFetch(`/admin/moderation/reports/${encodeURIComponent(id)}/correct-location`, {
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
  disableUser: (id, body) =>
    apiFetch(`/admin/users/${id}/disable`, { method: 'POST', body: JSON.stringify(body) }),
  disableReporting: (id, body) =>
    apiFetch(`/admin/users/${id}/disable-reporting`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  enableReporting: (id, body) =>
    apiFetch(`/admin/users/${id}/enable-reporting`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  setUserRole: (id, body) =>
    apiFetch(`/admin/users/${id}/role`, { method: 'PATCH', body: JSON.stringify(body) }),
  revokeUserSession: (id, sessionId, body = {}) =>
    apiFetch(`/admin/users/${id}/sessions/${sessionId}/revoke`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  revokeAllUserSessions: (id, body = {}) =>
    apiFetch(`/admin/users/${id}/sessions/revoke-all`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  roleCatalog: () => apiFetch('/admin/roles'),
  roleDetail: (code) => apiFetch(`/admin/roles/${encodeURIComponent(code)}`),
  invitations: (params = {}) => apiFetch(`/admin/invitations${adminQuery(params)}`),
  createInvitation: (body) =>
    apiFetch('/admin/invitations', { method: 'POST', body: JSON.stringify(body) }),
  revokeInvitation: (id, body = {}) =>
    apiFetch(`/admin/invitations/${id}/revoke`, { method: 'POST', body: JSON.stringify(body) }),
  resendInvitation: (id, body = {}) =>
    apiFetch(`/admin/invitations/${id}/resend`, { method: 'POST', body: JSON.stringify(body) }),
  verifyAdminInvite: (token) => apiFetch(`/auth/admin-invite/${encodeURIComponent(token)}`),
  acceptAdminInvite: (token, body) =>
    apiFetch(`/auth/admin-invite/${encodeURIComponent(token)}/accept`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  officialSources: () => apiFetch('/admin/official-sources'),
  notificationDashboard: () => apiFetch('/admin/notifications/dashboard'),
  notificationRules: () => apiFetch('/admin/notifications/rules'),
  patchNotificationRule: (code, body) =>
    apiFetch(`/admin/notifications/rules/${encodeURIComponent(code)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  sendEmergencyNotification: (body) =>
    apiFetch('/admin/notifications/emergency', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  officialSourceHealth: () => apiFetch('/admin/official-sources/health'),
  officialOrganizations: (params = {}) =>
    apiFetch(`/admin/official-organizations${adminQuery(params)}`),
  officialAgency: (id) => apiFetch(`/admin/official-sources/${encodeURIComponent(id)}`),
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
  officialReviewQueue: (params = {}) =>
    apiFetch(`/admin/official-updates/queue${adminQuery(params)}`),
  officialUpdateDetail: (id) => apiFetch(`/admin/official-updates/${id}`),
  createManualOfficialUpdate: (body) =>
    apiFetch('/admin/official-updates', { method: 'POST', body: JSON.stringify(body) }),
  approveOfficialUpdate: (id, body) =>
    apiFetch(`/admin/official-updates/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  rejectOfficialUpdate: (id, body) =>
    apiFetch(`/admin/official-updates/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  correctOfficialUpdate: (id, body) =>
    apiFetch(`/admin/official-updates/${id}/correct`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  correlateOfficialUpdates: (body) =>
    apiFetch('/admin/official-updates/correlate', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  setOfficialUpdatePriority: (id, body) =>
    apiFetch(`/admin/official-updates/${id}/priority`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  associateOfficialTraffic: (id, body) =>
    apiFetch(`/admin/official-updates/${id}/associate-traffic`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
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
  location: (id) => apiFetch(`/admin/locations/${id}`),
  locationDashboard: () => apiFetch('/admin/locations/dashboard'),
  locationTree: (params = {}) => apiFetch(`/admin/locations/tree${adminQuery(params)}`),
  locationDuplicates: (params = {}) =>
    apiFetch(`/admin/locations/duplicates${adminQuery(params)}`),
  locationImpact: (id) => apiFetch(`/admin/locations/${id}/impact`),
  locationQuality: () => apiFetch('/admin/locations/quality'),
  patchLocation: (id, body) =>
    apiFetch(`/admin/locations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deactivateLocation: (id, body = {}) =>
    apiFetch(`/admin/locations/${id}/deactivate`, { method: 'POST', body: JSON.stringify(body) }),
  activateLocation: (id, body = {}) =>
    apiFetch(`/admin/locations/${id}/activate`, { method: 'POST', body: JSON.stringify(body) }),
  createLocationArea: (body) =>
    apiFetch('/admin/locations/areas', { method: 'POST', body: JSON.stringify(body) }),
  createLocationChild: (body) =>
    apiFetch('/admin/locations/children', { method: 'POST', body: JSON.stringify(body) }),
  addLocationAlias: (id, body) =>
    apiFetch(`/admin/locations/${id}/aliases`, { method: 'POST', body: JSON.stringify(body) }),
  removeLocationAlias: (id, aliasId, body = {}) =>
    apiFetch(`/admin/locations/${id}/aliases/${aliasId}`, {
      method: 'DELETE',
      body: JSON.stringify(body),
    }),
  unresolvedLocations: (params = {}) =>
    apiFetch(`/admin/locations-unresolved${adminQuery(params)}`),
  resolveLocationQueue: (id, body) =>
    apiFetch(`/admin/locations-unresolved/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  verifyLocation: (id, body) =>
    apiFetch(`/admin/locations/${id}/verify`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  mergeLocations: (id, body) =>
    apiFetch(`/admin/locations/${id}/merge`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  locationConflicts: (params = {}) =>
    apiFetch(`/admin/locations-conflicts${adminQuery(params)}`),
  geocodingHealth: (params = {}) =>
    apiFetch(`/admin/geocoding/health${adminQuery(params)}`),
  locationSearchMetrics: (params = {}) =>
    apiFetch(`/admin/locations-search-metrics${adminQuery(params)}`),
  fuelStations: (params = {}) => apiFetch(`/admin/fuel-stations${adminQuery(params)}`),
  fuelStation: (id) => apiFetch(`/admin/fuel-stations/${id}`),
  fuelDashboard: () => apiFetch('/admin/fuel-stations/dashboard'),
  fuelSubmissions: (params = {}) =>
    apiFetch(`/admin/fuel-stations/submissions${adminQuery(params)}`),
  fuelConflicts: (params = {}) =>
    apiFetch(`/admin/fuel-stations/conflicts${adminQuery(params)}`),
  fuelDuplicates: (params = {}) =>
    apiFetch(`/admin/fuel-stations/duplicates${adminQuery(params)}`),
  fuelQuality: (params = {}) => apiFetch(`/admin/fuel-stations/quality${adminQuery(params)}`),
  fuelPriceHistory: (id, params = {}) =>
    apiFetch(`/admin/fuel-stations/${id}/history${adminQuery(params)}`),
  fuelSources: () => apiFetch('/admin/fuel-stations/sources'),
  fuelBrands: () => apiFetch('/admin/fuel-stations/brands'),
  fuelBrandCatalogue: (params = {}) =>
    apiFetch(`/admin/fuel-stations/brand-catalogue${adminQuery(params)}`),
  createFuelBrand: (body) =>
    apiFetch('/admin/fuel-stations/brands', { method: 'POST', body: JSON.stringify(body) }),
  fuelProducts: () => apiFetch('/admin/fuel-stations/products'),
  fuelAnomalies: (params = {}) =>
    apiFetch(`/admin/fuel-stations/anomalies${adminQuery(params)}`),
  fuelCompare: (params = {}) => apiFetch(`/admin/fuel-stations/compare${adminQuery(params)}`),
  recordFuelAvailability: (body) =>
    apiFetch('/admin/fuel-stations/availability', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  mergeFuelStations: (body) =>
    apiFetch('/admin/fuel-stations/merge', { method: 'POST', body: JSON.stringify(body) }),
  fuelSimilar: (params = {}) => apiFetch(`/admin/fuel-stations/similar${adminQuery(params)}`),
  createFuelStation: (body) =>
    apiFetch('/admin/fuel-stations', { method: 'POST', body: JSON.stringify(body) }),
  patchFuelStation: (id, body) =>
    apiFetch(`/admin/fuel-stations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  addFuelStationAlias: (id, body) =>
    apiFetch(`/admin/fuel-stations/${id}/aliases`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  removeFuelStationAlias: (id, aliasId, body = {}) =>
    apiFetch(`/admin/fuel-stations/${id}/aliases/${aliasId}`, {
      method: 'DELETE',
      body: JSON.stringify(body),
    }),
  transportRoutes: (params = {}) => apiFetch(`/admin/transport-routes${adminQuery(params)}`),
  transportDashboard: () => apiFetch('/admin/transport-routes/dashboard'),
  transportRoute: (id) => apiFetch(`/admin/transport-routes/${id}`),
  createTransportRoute: (body) =>
    apiFetch('/admin/transport-routes', { method: 'POST', body: JSON.stringify(body) }),
  transportStops: (params = {}) =>
    apiFetch(`/admin/transport-routes/stops${adminQuery(params)}`),
  transportDirectoryStops: (params = {}) =>
    apiFetch(`/admin/transport-routes/directory-stops${adminQuery(params)}`),
  createTransportDirectoryStop: (body) =>
    apiFetch('/admin/transport-routes/directory-stops', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  transportFares: (params = {}) =>
    apiFetch(`/admin/transport-routes/fares${adminQuery(params)}`),
  transportConflicts: (params = {}) =>
    apiFetch(`/admin/transport-routes/conflicts${adminQuery(params)}`),
  transportAnomalies: (params = {}) =>
    apiFetch(`/admin/transport-routes/anomalies${adminQuery(params)}`),
  transportDuplicates: (params = {}) =>
    apiFetch(`/admin/transport-routes/duplicates${adminQuery(params)}`),
  transportQuality: (params = {}) =>
    apiFetch(`/admin/transport-routes/quality${adminQuery(params)}`),
  patchTransportRoute: (id, body) =>
    apiFetch(`/admin/transport-routes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  patchTransportStop: (id, body) =>
    apiFetch(`/admin/transport-stops/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  trafficDashboard: () => apiFetch('/admin/traffic/dashboard'),
  trafficReports: (params = {}) => apiFetch(`/admin/traffic${adminQuery(params)}`),
  trafficReport: (id) => apiFetch(`/admin/traffic/${id}`),
  patchTrafficReport: (id, body) =>
    apiFetch(`/admin/traffic/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  trafficDuplicates: (params = {}) =>
    apiFetch(`/admin/traffic/duplicates${adminQuery(params)}`),
  trafficQuality: (params = {}) => apiFetch(`/admin/traffic/quality${adminQuery(params)}`),
  trafficSources: () => apiFetch('/admin/traffic/sources'),
  trafficEventVocab: () => apiFetch('/admin/traffic/events/vocab'),
  trafficEvents: (params = {}) => apiFetch(`/admin/traffic/events${adminQuery(params)}`),
  trafficEvent: (id) => apiFetch(`/admin/traffic/events/${id}`),
  createTrafficEvent: (body) =>
    apiFetch('/admin/traffic/events', { method: 'POST', body: JSON.stringify(body) }),
  patchTrafficEvent: (id, body) =>
    apiFetch(`/admin/traffic/events/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  resolveTrafficEvent: (id, body) =>
    apiFetch(`/admin/traffic/events/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  linkTrafficEventReport: (id, body) =>
    apiFetch(`/admin/traffic/events/${id}/link-report`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  mergeTrafficEvent: (id, body) =>
    apiFetch(`/admin/traffic/events/${id}/merge`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  splitTrafficEvent: (id, body) =>
    apiFetch(`/admin/traffic/events/${id}/split`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  flagTrafficEventDuplicate: (id, body) =>
    apiFetch(`/admin/traffic/events/${id}/flag-duplicate`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  recomputeTrafficEventConfidence: (id) =>
    apiFetch(`/admin/traffic/events/${id}/recompute-confidence`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  trafficEventDuplicates: (params = {}) =>
    apiFetch(`/admin/traffic/event-duplicates${adminQuery(params)}`),
  expireTrafficEvents: (body = {}) =>
    apiFetch('/admin/traffic/events/expire-stale', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  trafficRoads: (params = {}) => apiFetch(`/admin/traffic/roads${adminQuery(params)}`),
  createRoadSegment: (body) =>
    apiFetch('/admin/traffic/road-segments', { method: 'POST', body: JSON.stringify(body) }),
  addRoadAlias: (id, body) =>
    apiFetch(`/admin/traffic/roads/${id}/aliases`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  commodities: (params = {}) => apiFetch(`/admin/commodities${adminQuery(params)}`),
  commodityDashboard: () => apiFetch('/admin/commodities/dashboard'),
  commodity: (id) => apiFetch(`/admin/commodities/${id}`),
  commodityCategories: () => apiFetch('/admin/commodities/categories'),
  createCommodity: (body) =>
    apiFetch('/admin/commodities', { method: 'POST', body: JSON.stringify(body) }),
  patchCommodity: (id, body) =>
    apiFetch(`/admin/commodities/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  createCommodityVariant: (id, body) =>
    apiFetch(`/admin/commodities/${id}/variants`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  patchCommodityVariant: (id, body) =>
    apiFetch(`/admin/commodity-variants/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  commodityObservations: (params = {}) =>
    apiFetch(`/admin/commodities/observations${adminQuery(params)}`),
  commodityObservation: (id) => apiFetch(`/admin/commodities/observations/${id}`),
  patchCommodityObservation: (id, body) =>
    apiFetch(`/admin/commodities/observations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  commodityMarkets: (params = {}) =>
    apiFetch(`/admin/commodities/markets${adminQuery(params)}`),
  createCommodityMarket: (body) =>
    apiFetch('/admin/commodities/markets', { method: 'POST', body: JSON.stringify(body) }),
  patchCommodityMarket: (id, body) =>
    apiFetch(`/admin/commodities/markets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  addCommodityMarketAlias: (id, body) =>
    apiFetch(`/admin/commodities/markets/${id}/aliases`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  removeCommodityMarketAlias: (id, aliasId, body = {}) =>
    apiFetch(`/admin/commodities/markets/${id}/aliases/${aliasId}`, {
      method: 'DELETE',
      body: JSON.stringify(body),
    }),
  commodityConflicts: (params = {}) =>
    apiFetch(`/admin/commodities/conflicts${adminQuery(params)}`),
  commodityDuplicates: (params = {}) =>
    apiFetch(`/admin/commodities/duplicates${adminQuery(params)}`),
  commodityQuality: (params = {}) =>
    apiFetch(`/admin/commodities/quality${adminQuery(params)}`),
  commoditySources: () => apiFetch('/admin/commodities/sources'),
  commodityAnomalies: (params = {}) =>
    apiFetch(`/admin/commodities/anomalies${adminQuery(params)}`),
  commodityCompare: (params = {}) =>
    apiFetch(`/admin/commodities/compare${adminQuery(params)}`),
  mergeCommodityMarkets: (body) =>
    apiFetch('/admin/commodities/markets/merge', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
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
