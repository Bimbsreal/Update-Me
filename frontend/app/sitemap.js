import { absoluteUrl } from '@/lib/seo';
import { publicFetchOptional } from '@/lib/publicFetch';

const STATIC_PATHS = [
  '/',
  '/about',
  '/help',
  '/contact',
  '/privacy',
  '/terms',
  '/official-updates',
  '/explore',
  '/traffic',
  '/fuel',
  '/transport',
  '/prices',
  '/alerts',
  '/directions',
  '/community',
];

function entry(path, { lastModified, changeFrequency = 'daily', priority = 0.6 } = {}) {
  return {
    url: absoluteUrl(path),
    lastModified: lastModified ? new Date(lastModified) : new Date(),
    changeFrequency,
    priority,
  };
}

/**
 * Production-safe sitemap: static public hubs + bounded entity samples.
 * Never includes auth/admin/private surfaces.
 */
export default async function sitemap() {
  const entries = STATIC_PATHS.map((path) =>
    entry(path, {
      priority: path === '/' ? 1 : path === '/explore' || path === '/official-updates' ? 0.8 : 0.7,
      changeFrequency: path === '/' ? 'weekly' : 'hourly',
    })
  );

  const [official, traffic, alerts, fuel, questions, locations] = await Promise.all([
    publicFetchOptional('/official-updates?limit=40&page=1', { revalidate: 300 }),
    publicFetchOptional('/traffic?limit=30&page=1', { revalidate: 120 }),
    publicFetchOptional('/alerts?limit=30&page=1', { revalidate: 120 }),
    publicFetchOptional('/fuel/stations?limit=30&page=1', { revalidate: 300 }),
    publicFetchOptional('/community/questions?limit=30&page=1', { revalidate: 180 }),
    publicFetchOptional('/locations/search?q=a&limit=40', { revalidate: 600 }),
  ]);

  for (const item of official?.items || official?.updates || []) {
    if (!item?.id) continue;
    entries.push(
      entry(`/official-updates/${item.id}`, {
        lastModified: item.updatedAt || item.retrievedAt || item.publishedAt,
        changeFrequency: 'daily',
        priority: 0.65,
      })
    );
  }

  for (const item of traffic?.items || traffic?.traffic || []) {
    if (!item?.id) continue;
    entries.push(
      entry(`/traffic/${item.id}`, {
        lastModified: item.updatedAt || item.observedAt || item.createdAt,
        changeFrequency: 'hourly',
        priority: 0.55,
      })
    );
  }

  for (const item of alerts?.items || alerts?.alerts || []) {
    if (!item?.id) continue;
    entries.push(
      entry(`/alerts/${item.id}`, {
        lastModified: item.updatedAt || item.observedAt || item.createdAt,
        changeFrequency: 'hourly',
        priority: 0.55,
      })
    );
  }

  for (const item of fuel?.items || fuel?.stations || []) {
    if (!item?.id) continue;
    entries.push(
      entry(`/fuel/stations/${item.id}`, {
        lastModified: item.updatedAt,
        changeFrequency: 'daily',
        priority: 0.5,
      })
    );
  }

  for (const item of questions?.items || questions?.questions || []) {
    if (!item?.id) continue;
    entries.push(
      entry(`/community/questions/${item.id}`, {
        lastModified: item.updatedAt || item.createdAt,
        changeFrequency: 'daily',
        priority: 0.45,
      })
    );
  }

  const locItems = locations?.results || locations?.items || locations?.locations || [];
  for (const loc of locItems) {
    const slug = loc.slug || loc.id;
    if (!slug) continue;
    // Only index places that already exist in geography — no invented paths.
    entries.push(
      entry(`/locations/${encodeURIComponent(slug)}`, {
        changeFrequency: 'daily',
        priority: 0.5,
      })
    );
  }

  // Cap to keep sitemap bounded
  const seen = new Set();
  const unique = [];
  for (const item of entries) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    unique.push(item);
    if (unique.length >= 500) break;
  }
  return unique;
}
