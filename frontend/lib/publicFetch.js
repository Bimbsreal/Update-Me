/**
 * Server-side public API fetch (no cookies / no private session data).
 * Used for metadata, sitemap, and SSR of public pages only.
 */
import { API_BASE_URL } from '@/lib/api';

export async function publicFetch(path, { revalidate = 60, tags } = {}) {
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    next: {
      revalidate,
      ...(tags ? { tags } : {}),
    },
  });

  if (!res.ok) {
    const err = new Error(`Public fetch failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

export async function publicFetchOptional(path, options) {
  try {
    return await publicFetch(path, options);
  } catch {
    return null;
  }
}
