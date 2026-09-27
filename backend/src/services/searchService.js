import { getPool } from '../db/pool.js';
import { locationRepository } from '../repositories/locationRepository.js';
import { AppError } from '../middleware/errorHandler.js';

const CATEGORY_KEYWORDS = [
  { category: 'fuel', words: ['fuel', 'petrol', 'diesel', 'pms', 'ago', 'station', 'filling'] },
  { category: 'traffic', words: ['traffic', 'jam', 'congestion', 'gridlock', 'closure', 'road closure'] },
  { category: 'alerts', words: ['alert', 'blockage', 'flood', 'flooding', 'accident', 'danger', 'hazard'] },
  { category: 'transport', words: ['fare', 'bus', 'keke', 'danfo', 'route'] },
  { category: 'prices', words: ['price', 'prices', 'commodity', 'market', 'cheapest'] },
  { category: 'fx', words: ['fx', 'forex', 'exchange rate', 'dollar', 'usd', 'gbp', 'eur'] },
  { category: 'official', words: ['official', 'frsc', 'nmdpra', 'nnpcl', 'nnpc', 'lastma', 'agency', 'government', 'updates'] },
  { category: 'community', words: ['question', 'ask', 'community'] },
  { category: 'places', words: ['area', 'road', 'landmark', 'lga'] },
];

const FX_PAIR_PATTERNS = [
  { re: /\b(usd|dollar|\$)\b/i, base: 'USD', quote: 'NGN', label: 'USD/NGN' },
  { re: /\b(gbp|pound|£)\b/i, base: 'GBP', quote: 'NGN', label: 'GBP/NGN' },
  { re: /\b(eur|euro|€)\b/i, base: 'EUR', quote: 'NGN', label: 'EUR/NGN' },
];

/** Commodity names that hint Prices without being stripped from the query. */
const COMMODITY_HINT_WORDS = ['rice', 'garri', 'tomato', 'beans', 'beef', 'chicken', 'eggs', 'bread'];

const FRESHNESS_SQL = {
  '30m': `AND COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) >= NOW() - INTERVAL '30 minutes'`,
  '2h': `AND COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) >= NOW() - INTERVAL '2 hours'`,
  today: `AND COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) >= date_trunc('day', NOW())`,
  recent: `AND COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) >= NOW() - INTERVAL '24 hours'
           AND r.status IN ('submitted','active','confirmed')`,
  any: `AND r.status IN ('submitted','active','confirmed','stale')`,
};

export function normalizeQuery(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\-'/]/g, '')
    .trim();
}

function detectFxPairs(normalized) {
  const pairs = [];
  for (const p of FX_PAIR_PATTERNS) {
    if (p.re.test(normalized) || normalized.includes(`${p.base.toLowerCase()}/${p.quote.toLowerCase()}`)) {
      pairs.push(p);
    }
  }
  if (/\bfx\b|\bforex\b|\bexchange\b/.test(normalized) && pairs.length === 0) {
    pairs.push(FX_PAIR_PATTERNS[0]);
  }
  return pairs;
}

async function recordQueryMetric({
  normalized,
  category,
  resultCount,
  latencyMs,
  hadLocation,
  mode,
}) {
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO search_query_metrics (
         normalized_query, category, result_count, zero_result, latency_ms, had_location, mode
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        String(normalized || '').slice(0, 120) || 'empty',
        category || 'all',
        Math.max(0, Number(resultCount) || 0),
        Number(resultCount) === 0,
        latencyMs == null ? null : Math.max(0, Math.round(Number(latencyMs))),
        Boolean(hadLocation),
        mode === 'suggest' ? 'suggest' : 'full',
      ]
    );
  } catch {
    /* analytics must never break search */
  }
}

function escapeLike(value) {
  return String(value).replace(/[%_\\]/g, '\\$&');
}

function detectCategoryHints(normalized) {
  const hints = new Set();
  for (const entry of CATEGORY_KEYWORDS) {
    for (const word of entry.words) {
      if (word.includes(' ')) {
        if (normalized.includes(word)) hints.add(entry.category);
      } else if (new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(normalized)) {
        hints.add(entry.category);
      }
    }
  }
  for (const word of COMMODITY_HINT_WORDS) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(normalized)) hints.add('prices');
  }
  if (/\bto\b/.test(normalized) || /→|->/.test(normalized)) hints.add('transport');
  return [...hints];
}

function stripCategoryWords(normalized) {
  let q = normalized;
  for (const entry of CATEGORY_KEYWORDS) {
    for (const word of entry.words) {
      q = q.replace(new RegExp(`\\b${word}\\b`, 'gi'), ' ');
    }
  }
  q = q.replace(/\bnear\s+me\b/gi, ' ').replace(/\s+/g, ' ').trim();
  return q;
}

function exactBoost(name, q) {
  const n = String(name || '').toLowerCase();
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.includes(q)) return 2;
  return 3;
}

function ageMinutes(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  return Math.floor(ms / 60000);
}

function freshnessLabel(iso) {
  const mins = ageMinutes(iso);
  if (mins == null) return null;
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function haversineKm(aLat, aLng, bLat, bLng) {
  if (aLat == null || aLng == null || bLat == null || bLng == null) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

async function resolveAliases(pool, normalized) {
  try {
    const result = await pool.query(
      `SELECT alias, canonical, category
       FROM search_aliases
       WHERE lower(alias) = $1
          OR (
            char_length(alias) >= 4
            AND (
              lower($1) = lower(alias)
              OR lower($1) LIKE lower(alias) || ' %'
              OR lower($1) LIKE '% ' || lower(alias)
              OR lower($1) LIKE '% ' || lower(alias) || ' %'
              OR lower($1) LIKE '%-' || lower(alias)
              OR lower($1) LIKE lower(alias) || '-%'
            )
          )
          OR (
            char_length(alias) >= 4
            AND abs(char_length(alias) - char_length($1)) <= 3
            AND similarity(lower(alias), $1) > 0.6
          )
       ORDER BY
         CASE WHEN lower(alias) = $1 THEN 0 ELSE 1 END,
         char_length(alias) DESC,
         similarity(lower(alias), $1) DESC
       LIMIT 5`,
      [normalized]
    );
    return result.rows;
  } catch {
    return [];
  }
}

async function resolveContextCoords(pool, { locationId, lat, lng }) {
  if (lat != null && lng != null) return { lat, lng, source: 'coords' };
  if (!locationId) return null;
  const result = await pool.query(
    `SELECT latitude, longitude FROM locations WHERE id = $1 AND latitude IS NOT NULL`,
    [locationId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return { lat: Number(row.latitude), lng: Number(row.longitude), source: 'location' };
}

function rankItem(item, { q, hints, center, radiusKm }) {
  let score = 100;
  score += exactBoost(item.title, q) * 10;
  if (hints.includes(item.group)) score -= 55;
  if (item.matchKind === 'exact') score -= 40;
  if (item.matchKind === 'trgm') score -= 5;
  if (item.freshnessMinutes != null) {
    if (item.freshnessMinutes <= 30) score -= 15;
    else if (item.freshnessMinutes <= 120) score -= 8;
    else if (item.freshnessMinutes > 24 * 60) score += 20;
  }
  if (center && item.coordinates) {
    const d = haversineKm(center.lat, center.lng, item.coordinates.lat, item.coordinates.lng);
    if (d != null) {
      item.distanceKm = Number(d.toFixed(1));
      if (radiusKm != null && d > radiusKm) {
        item._outOfRadius = true;
      }
      if (d <= 5) score -= 12;
      else if (d <= 15) score -= 6;
      else if (d > 40) score += 8;
    }
  }
  return score;
}

function sortItems(items, sort, center) {
  const mode = sort || 'relevance';
  if (mode === 'newest') {
    return [...items].sort((a, b) => {
      const at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bt - at;
    });
  }
  if (mode === 'nearest' && center) {
    return [...items].sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
  }
  if (mode === 'price') {
    return [...items].sort((a, b) => {
      const ap = a.priceAmount ?? Number.POSITIVE_INFINITY;
      const bp = b.priceAmount ?? Number.POSITIVE_INFINITY;
      return ap - bp;
    });
  }
  return items;
}

export const searchService = {
  normalizeQuery,
  detectCategoryHints,

  async suggest(query) {
    const full = await this.search({
      ...query,
      mode: 'suggest',
      limit: Math.min(Number(query.limit) || 12, 20),
      category: 'all',
      freshness: 'any',
    });
    return {
      q: full.q,
      suggestions: full.items.slice(0, Number(query.limit) || 12),
      interpreted: full.interpreted,
    };
  },

  async search(query = {}) {
    const started = Date.now();
    const rawQ = String(query.q || '').trim();
    if (!rawQ) throw new AppError('Enter a search term.', 400, 'VALIDATION_ERROR');

    const pool = getPool();
    const normalized = normalizeQuery(rawQ);
    const aliases = await resolveAliases(pool, normalized);
    const aliasExpand = aliases.map((a) => a.canonical).filter(Boolean);
    const searchTerms = [...new Set([normalized, ...aliasExpand.map(normalizeQuery)].filter(Boolean))];

    let category = query.category || 'all';
    const hints = detectCategoryHints(normalized);
    const fxPairs = detectFxPairs(normalized);
    if (fxPairs.length) hints.push('fx');
    const uniqueHints = [...new Set(hints)];
    const entityQ = stripCategoryWords(normalized);
    // Prefer alias canonical when it better reflects the entity (e.g. lekki epe → lekki-epe expressway)
    const aliasCanonical = aliasExpand.map(normalizeQuery).find((c) => c && c !== normalized && c.length >= 3);
    // Only force a sole category when the query is category-only (e.g. "fuel near me").
    const categoryOnly = !entityQ && uniqueHints.length > 0;
    if (category === 'all' && categoryOnly && uniqueHints.length === 1) {
      category = uniqueHints[0];
    }
    if (category === 'all' && fxPairs.length && !entityQ.replace(/\b(usd|gbp|eur|ngn|dollar|pound|euro|today|to|naira)\b/gi, '').trim()) {
      category = 'fx';
    }
    let primaryTerm = entityQ || (categoryOnly ? '' : normalized);
    if (aliasCanonical && primaryTerm) {
      // Only replace entity term when alias clearly expands the same phrase (not a short hijack)
      const aliasLooksLikeExpansion =
        aliasCanonical.includes(primaryTerm) ||
        primaryTerm.includes(aliasCanonical.split(' ')[0]) ||
        aliases.some((a) => normalizeQuery(a.alias) === normalized || normalizeQuery(a.alias) === primaryTerm);
      if (aliasLooksLikeExpansion) {
        const strippedAlias = stripCategoryWords(aliasCanonical);
        if (strippedAlias && strippedAlias.length >= primaryTerm.length) primaryTerm = strippedAlias;
      }
    } else if (aliasCanonical && !primaryTerm && !categoryOnly) {
      primaryTerm = stripCategoryWords(aliasCanonical) || aliasCanonical;
    }
    const like = primaryTerm ? `%${escapeLike(primaryTerm)}%` : '%';
    const limit = Math.min(Number(query.limit) || 20, 40);
    const perBucket = query.mode === 'suggest' ? 5 : 8;
    const freshness = query.freshness || 'recent';
    const source = query.source || 'all';
    const page = Math.max(1, Number(query.page) || 1);
    const sort = query.sort || 'relevance';
    const radiusKm = query.radiusKm != null ? Number(query.radiusKm) : null;
    const nearMe = /\bnear\s+me\b/i.test(rawQ);

    const center = await resolveContextCoords(pool, {
      locationId: query.locationId,
      lat: query.lat,
      lng: query.lng,
    });

    const want = (group) => {
      if (category === 'all') {
        if (categoryOnly) return uniqueHints.includes(group);
        return true;
      }
      return category === group;
    };

    const jobs = [];

    if (want('places') && primaryTerm) {
      jobs.push(
        locationRepository
          .search({
            q: primaryTerm,
            stateId: query.stateId,
            lgaId: query.lgaId,
            limit: perBucket,
          })
          .then((rows) =>
            (rows || []).map((loc) => ({
              group: 'places',
              type: loc.type || 'location',
              id: loc.id,
              title: loc.name,
              subtitle: loc.subtitle || loc.type,
              locationName: loc.subtitle,
              status: null,
              sourceType: null,
              sourceLabel: null,
              updatedAt: null,
              freshnessLabel: null,
              href: `/explore?locationId=${loc.id}`,
              coordinates: loc.coordinates || null,
              matchKind: exactBoost(loc.name, primaryTerm) === 0 ? 'exact' : 'partial',
            }))
          )
          .catch(() => [])
      );
    } else jobs.push(Promise.resolve([]));

    if (want('fuel')) {
      jobs.push(
        pool
          .query(
            `SELECT fs.id, fs.name, fs.brand, loc.name AS location_name,
                    loc.latitude, loc.longitude,
                    (SELECT fr.availability FROM fuel_reports fr
                       WHERE fr.station_id = fs.id AND fr.fuel_type = 'pms'
                       ORDER BY fr.created_at DESC LIMIT 1) AS availability,
                    (SELECT fr.price_amount FROM fuel_reports fr
                       WHERE fr.station_id = fs.id AND fr.fuel_type = 'pms'
                       ORDER BY fr.created_at DESC LIMIT 1) AS price_amount,
                    (SELECT fr.created_at FROM fuel_reports fr
                       WHERE fr.station_id = fs.id
                       ORDER BY fr.created_at DESC LIMIT 1) AS last_report_at,
                    GREATEST(
                      similarity(lower(fs.name), lower($2)),
                      CASE WHEN fs.name ILIKE $1 THEN 0.5 ELSE 0 END
                    ) AS sim
             FROM fuel_stations fs
             LEFT JOIN locations loc ON loc.id = fs.location_id
             WHERE fs.is_active = TRUE
               AND (
                 $2 = ''
                 OR fs.name ILIKE $1
                 OR lower(fs.name) % lower($2)
                 OR COALESCE(fs.brand,'') ILIKE $1
                 OR COALESCE(loc.name,'') ILIKE $1
                 OR EXISTS (
                   SELECT 1 FROM fuel_station_aliases fsa
                   WHERE fsa.station_id = fs.id
                     AND (lower(fsa.alias) ILIKE $1 OR lower(fsa.alias) % lower($2))
                 )
                 OR loc.lga_id IN (
                   SELECT l.id FROM lgas l WHERE l.name ILIKE $1
                 )
                 OR loc.area_id IN (
                   SELECT a.id FROM areas a WHERE a.name ILIKE $1
                 )
               )
             ORDER BY sim DESC, fs.name
             LIMIT $3`,
            [like, primaryTerm || ' ', perBucket]
          )
          .then((res) =>
            res.rows.map((s) => ({
              group: 'fuel',
              type: 'fuel_station',
              id: s.id,
              title: s.name,
              subtitle: [s.location_name, s.brand].filter(Boolean).join(' · ') || 'Fuel station',
              locationName: s.location_name,
              status:
                s.availability
                  ? `Petrol · ${String(s.availability).charAt(0).toUpperCase()}${String(s.availability).slice(1).replace(/_/g, ' ')}`
                  : s.price_amount != null
                    ? `Petrol · ₦${Number(s.price_amount).toLocaleString('en-NG')}`
                    : 'Fuel station',
              priceAmount: s.price_amount != null ? Number(s.price_amount) : null,
              sourceType: 'community',
              sourceLabel: 'Community Report',
              updatedAt: s.last_report_at,
              freshnessLabel: freshnessLabel(s.last_report_at),
              freshnessMinutes: ageMinutes(s.last_report_at),
              href: `/fuel/stations/${s.id}`,
              coordinates:
                s.latitude != null ? { lat: Number(s.latitude), lng: Number(s.longitude) } : null,
              matchKind: Number(s.sim) > 0.55 ? 'trgm' : 'partial',
            }))
          )
          .catch(() => [])
      );
    } else jobs.push(Promise.resolve([]));

    if (want('transport')) {
      jobs.push(
        pool
          .query(
            `SELECT tr.id, tr.name, tr.primary_mode::text AS mode,
                    o.name AS origin_name, d.name AS destination_name,
                    (SELECT fr.fare_amount FROM transport_fare_reports fr
                       WHERE fr.route_id = tr.id
                       ORDER BY fr.created_at DESC LIMIT 1) AS fare_amount,
                    (SELECT fr.created_at FROM transport_fare_reports fr
                       WHERE fr.route_id = tr.id
                       ORDER BY fr.created_at DESC LIMIT 1) AS last_fare_at
             FROM transport_routes tr
             LEFT JOIN locations o ON o.id = tr.origin_location_id
             LEFT JOIN locations d ON d.id = tr.destination_location_id
             WHERE tr.is_active = TRUE
               AND (
                 $2 = ''
                 OR tr.name ILIKE $1
                 OR o.name ILIKE $1
                 OR d.name ILIKE $1
                 OR lower(COALESCE(tr.name,'')) % lower($2)
               )
             ORDER BY tr.name NULLS LAST
             LIMIT $3`,
            [like, primaryTerm, perBucket]
          )
          .then((res) =>
            res.rows.map((r) => ({
              group: 'transport',
              type: 'transport_route',
              id: r.id,
              title: r.name || `${r.origin_name || '?'} → ${r.destination_name || '?'}`,
              subtitle: [r.mode, r.origin_name && r.destination_name ? `${r.origin_name} → ${r.destination_name}` : null]
                .filter(Boolean)
                .join(' · '),
              locationName: r.origin_name,
              status:
                r.fare_amount != null
                  ? `Recent fare: ₦${Number(r.fare_amount).toLocaleString('en-NG')}`
                  : 'Transport route',
              sourceType: 'community',
              sourceLabel: 'Community Report',
              updatedAt: r.last_fare_at,
              freshnessLabel: freshnessLabel(r.last_fare_at),
              freshnessMinutes: ageMinutes(r.last_fare_at),
              href: `/transport/routes/${r.id}`,
              coordinates: null,
              matchKind: 'partial',
            }))
          )
          .catch(() => [])
      );
    } else jobs.push(Promise.resolve([]));

    if (want('prices')) {
      jobs.push(
        pool
          .query(
            `SELECT c.id, c.name, c.slug,
                    (SELECT cv.display_name FROM commodity_variants cv
                       WHERE cv.commodity_id = c.id AND cv.is_active = TRUE
                       ORDER BY cv.sort_order NULLS LAST, cv.display_name LIMIT 1) AS variant_name,
                    (SELECT cv.code FROM commodity_variants cv
                       WHERE cv.commodity_id = c.id AND cv.is_active = TRUE
                       ORDER BY cv.sort_order NULLS LAST, cv.display_name LIMIT 1) AS variant_code
             FROM commodities c
             WHERE c.is_active = TRUE
               AND ($2 = '' OR c.name ILIKE $1 OR lower(c.name) % lower($2))
             ORDER BY
               CASE WHEN lower(c.name) = lower($2) THEN 0 ELSE 1 END,
               c.name
             LIMIT $3`,
            [like, primaryTerm, perBucket]
          )
          .then((res) =>
            res.rows.map((c) => ({
              group: 'prices',
              type: 'commodity',
              id: c.id,
              title: c.name,
              subtitle: c.variant_name ? `Prices · ${c.variant_name}` : 'Commodity prices',
              locationName: null,
              status: null,
              sourceType: null,
              sourceLabel: null,
              updatedAt: null,
              freshnessLabel: null,
              href: c.slug && c.variant_code
                ? `/prices/${c.slug}/${c.variant_code}`
                : `/prices?q=${encodeURIComponent(c.name)}`,
              coordinates: null,
              matchKind: exactBoost(c.name, primaryTerm) === 0 ? 'exact' : 'partial',
            }))
          )
          .catch(() => [])
      );
    } else jobs.push(Promise.resolve([]));

    const reportFreshSql = FRESHNESS_SQL[freshness] || FRESHNESS_SQL.recent;
    const sourceSql =
      source === 'official'
        ? `AND r.source_type = 'official'`
        : source === 'community'
          ? `AND r.source_type = 'community'`
          : '';

    if (want('traffic')) {
      jobs.push(
        pool
          .query(
            `SELECT tr.id, r.title, tr.severity, rd.name AS road_name, loc.name AS location_name,
                    r.last_confirmed_at, r.occurred_at, r.created_at, r.source_type, r.status
             FROM traffic_reports tr
             JOIN reports r ON r.id = tr.report_id
             LEFT JOIN roads rd ON rd.id = tr.road_id
             LEFT JOIN locations loc ON loc.id = r.location_id
             WHERE r.visibility = 'public'
               AND r.status IN ('submitted','active','confirmed','stale')
               ${reportFreshSql}
               ${sourceSql}
               AND (
                 $2 = ''
                 OR r.title ILIKE $1
                 OR COALESCE(rd.name,'') ILIKE $1
                 OR COALESCE(loc.name,'') ILIKE $1
                 OR lower(r.title) % lower($2)
                 OR EXISTS (
                   SELECT 1 FROM road_aliases ra
                   WHERE ra.road_id = rd.id
                     AND (lower(ra.alias) ILIKE $1 OR lower(ra.alias) % lower($2))
                 )
               )
             ORDER BY COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) DESC
             LIMIT $3`,
            [like, primaryTerm, perBucket]
          )
          .then((res) =>
            res.rows.map((row) => {
              const updated = row.last_confirmed_at || row.occurred_at || row.created_at;
              return {
                group: 'traffic',
                type: 'traffic',
                id: row.id,
                title: String(row.severity || 'Traffic').replace(/_/g, ' '),
                subtitle: row.road_name || row.location_name || row.title,
                locationName: row.location_name || row.road_name,
                status: `${String(row.severity || '').replace(/_/g, ' ')} traffic`,
                sourceType: row.source_type || 'community',
                sourceLabel:
                  row.source_type === 'official' ? 'Official' : 'Community Report',
                updatedAt: updated,
                freshnessLabel: freshnessLabel(updated),
                freshnessMinutes: ageMinutes(updated),
                href: `/traffic/${row.id}`,
                coordinates: null,
                matchKind: 'partial',
              };
            })
          )
          .catch(() => [])
      );
    } else jobs.push(Promise.resolve([]));

    if (want('alerts')) {
      jobs.push(
        pool
          .query(
            `SELECT ar.id, r.title, ar.alert_category, ar.severity, loc.name AS location_name,
                    r.last_confirmed_at, r.occurred_at, r.created_at, r.source_type, r.status
             FROM local_alert_reports ar
             JOIN reports r ON r.id = ar.report_id
             LEFT JOIN locations loc ON loc.id = r.location_id
             WHERE r.visibility = 'public'
               ${reportFreshSql}
               ${sourceSql}
               AND r.status IN ('submitted','active','confirmed')
               AND (
                 $2 = ''
                 OR r.title ILIKE $1
                 OR COALESCE(ar.alert_category::text,'') ILIKE $1
                 OR COALESCE(loc.name,'') ILIKE $1
               )
             ORDER BY COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) DESC
             LIMIT $3`,
            [like, primaryTerm, perBucket]
          )
          .then((res) =>
            res.rows.map((row) => {
              const updated = row.last_confirmed_at || row.occurred_at || row.created_at;
              return {
                group: 'alerts',
                type: 'alert',
                id: row.id,
                title: String(row.alert_category || row.title || 'Alert').replace(/_/g, ' '),
                subtitle: [row.location_name, row.severity].filter(Boolean).join(' · '),
                locationName: row.location_name,
                status: row.severity,
                sourceType: row.source_type || 'community',
                sourceLabel:
                  row.source_type === 'official' ? 'Official' : 'Community Report',
                updatedAt: updated,
                freshnessLabel: freshnessLabel(updated),
                freshnessMinutes: ageMinutes(updated),
                href: `/alerts/${row.id}`,
                coordinates: null,
                matchKind: 'partial',
              };
            })
          )
          .catch(() => [])
      );
    } else jobs.push(Promise.resolve([]));

    if (want('official') && source !== 'community') {
      jobs.push(
        pool
          .query(
            `SELECT ou.id, ou.title, ou.published_at, ou.summary,
                    COALESCE(os.short_name, os.organization_name) AS agency_name,
                    loc.name AS location_name
             FROM official_updates ou
             JOIN official_sources os ON os.id = ou.source_id
             LEFT JOIN locations loc ON loc.id = ou.location_id
             WHERE ou.status = 'published'
               AND (
                 $2 = ''
                 OR ou.title ILIKE $1
                 OR COALESCE(ou.summary,'') ILIKE $1
                 OR lower(ou.title) % lower($2)
                 OR COALESCE(os.short_name,'') ILIKE $1
                 OR COALESCE(os.organization_name,'') ILIKE $1
                 OR COALESCE(loc.name,'') ILIKE $1
               )
             ORDER BY ou.published_at DESC NULLS LAST
             LIMIT $3`,
            [like, primaryTerm, perBucket]
          )
          .then((res) =>
            res.rows.map((row) => ({
              group: 'official',
              type: 'official_update',
              id: row.id,
              title: row.title,
              subtitle: [row.agency_name, row.location_name].filter(Boolean).join(' · '),
              locationName: row.location_name,
              status: 'Official Update',
              sourceType: 'official',
              sourceLabel: 'Official',
              updatedAt: row.published_at,
              freshnessLabel: freshnessLabel(row.published_at),
              freshnessMinutes: ageMinutes(row.published_at),
              href: `/official-updates/${row.id}`,
              coordinates: null,
              matchKind: 'partial',
            }))
          )
          .catch(() => [])
      );
    } else jobs.push(Promise.resolve([]));

    if (want('fx') && (category === 'fx' || fxPairs.length > 0 || uniqueHints.includes('fx'))) {
      const pairs = fxPairs.length
        ? fxPairs
        : [
            { base: 'USD', quote: 'NGN', label: 'USD/NGN' },
            { base: 'GBP', quote: 'NGN', label: 'GBP/NGN' },
            { base: 'EUR', quote: 'NGN', label: 'EUR/NGN' },
          ];
      jobs.push(
        (async () => {
          try {
            const out = [];
            for (const pair of pairs.slice(0, 3)) {
              const res = await pool.query(
                `SELECT o.id, o.base_currency, o.quote_currency, o.rate, o.rate_type,
                        o.observed_at, s.display_name AS source_name
                 FROM fx_observations o
                 JOIN fx_sources s ON s.id = o.source_id
                 WHERE o.base_currency = $1 AND o.quote_currency = $2
                 ORDER BY
                   CASE WHEN o.rate_type = 'official_reference' THEN 0 ELSE 1 END,
                   o.observed_at DESC
                 LIMIT 1`,
                [pair.base, pair.quote]
              );
              const row = res.rows[0];
              if (!row) continue;
              const rate = row.rate != null ? Number(row.rate) : null;
              out.push({
                group: 'fx',
                type: 'fx_rate',
                id: row.id,
                title: `${row.base_currency}/${row.quote_currency}`,
                subtitle: [
                  rate != null ? `₦${rate.toLocaleString('en-NG', { maximumFractionDigits: 2 })}` : null,
                  row.source_name,
                  row.rate_type ? String(row.rate_type).replace(/_/g, ' ') : null,
                ]
                  .filter(Boolean)
                  .join(' · '),
                locationName: null,
                status: 'Reference rate — not every market',
                priceAmount: rate,
                sourceType: 'official',
                sourceLabel: row.source_name || 'FX source',
                updatedAt: row.observed_at,
                freshnessLabel: freshnessLabel(row.observed_at),
                freshnessMinutes: ageMinutes(row.observed_at),
                href: `/fx?base=${row.base_currency}&quote=${row.quote_currency}`,
                coordinates: null,
                matchKind: 'exact',
              });
            }
            return out;
          } catch {
            return [];
          }
        })()
      );
    } else jobs.push(Promise.resolve([]));

    if (want('community') && source !== 'official') {
      jobs.push(
        pool
          .query(
            `SELECT q.id, q.title, loc.name AS location_name, q.created_at, q.status
             FROM questions q
             LEFT JOIN locations loc ON loc.id = q.location_id
             WHERE q.status IN ('open','answered')
               AND ($2 = '' OR q.title ILIKE $1 OR COALESCE(q.description,'') ILIKE $1)
             ORDER BY q.created_at DESC
             LIMIT $3`,
            [like, primaryTerm, perBucket]
          )
          .then((res) =>
            res.rows.map((row) => ({
              group: 'community',
              type: 'question',
              id: row.id,
              title: row.title,
              subtitle: row.location_name || 'Community Q&A',
              locationName: row.location_name,
              status: row.status,
              sourceType: 'community',
              sourceLabel: 'Community',
              updatedAt: row.created_at,
              freshnessLabel: freshnessLabel(row.created_at),
              freshnessMinutes: ageMinutes(row.created_at),
              href: `/community/questions/${row.id}`,
              coordinates: null,
              matchKind: 'partial',
            }))
          )
          .catch(() => [])
      );
    } else jobs.push(Promise.resolve([]));

    const buckets = await Promise.all(jobs);
    let items = buckets.flat();

    // Typo fallback for places: if few location hits, try trigram on locations
    if (want('places') && items.filter((i) => i.group === 'places').length < 3 && primaryTerm.length >= 3) {
      try {
        const trgm = await pool.query(
          `SELECT loc.id, loc.name, loc.type, loc.latitude, loc.longitude,
                  GREATEST(
                    similarity(lower(loc.name), lower($1)),
                    word_similarity(lower($1), lower(loc.name))
                  ) AS sim
           FROM locations loc
           WHERE loc.status = 'active'
             AND loc.type IN ('area','lga','state','landmark','road','city')
             AND (
               similarity(lower(loc.name), lower($1)) > 0.28
               OR word_similarity(lower($1), lower(loc.name)) > 0.45
             )
           ORDER BY sim DESC, loc.name
           LIMIT 8`,
          [primaryTerm]
        );
        const existing = new Set(items.filter((i) => i.group === 'places').map((i) => i.id));
        for (const row of trgm.rows) {
          if (existing.has(row.id)) continue;
          items.push({
            group: 'places',
            type: row.type || 'location',
            id: row.id,
            title: row.name,
            subtitle: row.type,
            locationName: null,
            status: null,
            sourceType: null,
            sourceLabel: null,
            updatedAt: null,
            freshnessLabel: null,
            href: `/explore?locationId=${row.id}`,
            coordinates:
              row.latitude != null
                ? { lat: Number(row.latitude), lng: Number(row.longitude) }
                : null,
            matchKind: 'trgm',
          });
        }
      } catch {
        /* trigram optional if extension missing mid-migration */
      }
    }

    const scored = items
      .map((item) => ({
        ...item,
        _score: rankItem(item, { q: primaryTerm, hints: uniqueHints, center, radiusKm: nearMe || center ? radiusKm : null }),
      }))
      .filter((item) => !item._outOfRadius)
      .map(({ _outOfRadius, ...rest }) => rest);

    let ordered = scored.sort((a, b) => a._score - b._score);
    if (sort !== 'relevance') {
      ordered = sortItems(ordered, sort, center);
    }

    const total = ordered.length;
    const start = (page - 1) * limit;
    const pageItems = ordered.slice(start, start + limit).map(({ _score, ...rest }) => rest);

    const groups = {};
    for (const item of pageItems) {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    }

    const payload = {
      q: rawQ,
      interpreted: {
        normalized,
        entityQuery: primaryTerm,
        category,
        categoryHints: uniqueHints,
        aliasesApplied: aliases.map((a) => ({ alias: a.alias, canonical: a.canonical })),
        searchTerms,
        nearMe,
        sort,
        radiusKm: nearMe || center ? radiusKm : null,
        locationContext: center
          ? { lat: center.lat, lng: center.lng, source: center.source }
          : null,
      },
      groups,
      items: pageItems,
      pagination: {
        page,
        limit,
        total,
        hasMore: start + limit < total,
      },
      empty: total === 0,
      emptyMessage: 'No results found',
      emptyHints: [
        'Try a different spelling',
        'Search a road, area, station, or update',
        'Explore nearby',
      ],
    };

    if (query.mode !== 'suggest') {
      recordQueryMetric({
        normalized: normalized || rawQ.toLowerCase().slice(0, 120),
        category,
        resultCount: total,
        latencyMs: Date.now() - started,
        hadLocation: Boolean(center),
        mode: 'full',
      }).catch(() => {});
    }

    return payload;
  },

  async listRecent(userId, { limit = 8 } = {}) {
    if (!userId) return { items: [] };
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, query, created_at
       FROM user_recent_searches
       WHERE user_id = $1
         AND created_at > NOW() - INTERVAL '30 days'
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, Math.min(limit, 20)]
    );
    return {
      items: result.rows.map((r) => ({
        id: r.id,
        query: r.query,
        createdAt: r.created_at,
      })),
    };
  },

  async recordRecent(userId, query) {
    if (!userId) return;
    const q = String(query || '').trim().slice(0, 120);
    if (q.length < 2) return;
    const normalized = normalizeQuery(q);
    if (!normalized) return;
    const pool = getPool();
    await pool.query(
      `INSERT INTO user_recent_searches (user_id, query, normalized_query)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, normalized_query)
       DO UPDATE SET query = EXCLUDED.query, created_at = NOW()`,
      [userId, q, normalized]
    );
    // Cap history per user
    await pool.query(
      `DELETE FROM user_recent_searches
       WHERE user_id = $1
         AND id NOT IN (
           SELECT id FROM user_recent_searches
           WHERE user_id = $1
           ORDER BY created_at DESC
           LIMIT 20
         )`,
      [userId]
    );
  },

  async clearRecent(userId) {
    if (!userId) return { cleared: 0 };
    const pool = getPool();
    const result = await pool.query(`DELETE FROM user_recent_searches WHERE user_id = $1`, [
      userId,
    ]);
    return { cleared: result.rowCount || 0 };
  },
};
