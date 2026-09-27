/**
 * Public SEO helpers — never include private user data.
 */

export function siteOrigin() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  try {
    return new URL(raw).origin;
  } catch {
    return 'http://localhost:3000';
  }
}

export function absoluteUrl(path = '/') {
  const origin = siteOrigin();
  if (!path || path === '/') return `${origin}/`;
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Strip control chars / excess whitespace for safe meta text. */
export function sanitizeMetaText(value, maxLength = 160) {
  if (value == null) return '';
  const text = String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

/**
 * Build Next.js metadata for a public page.
 * robots.index defaults true; set false for noindex surfaces.
 */
export function buildPublicMetadata({
  title,
  description,
  path,
  type = 'website',
  publishedTime,
  modifiedTime,
  images,
  index = true,
  follow = true,
} = {}) {
  const safeTitle = sanitizeMetaText(title, 70) || 'Update Me';
  const safeDescription =
    sanitizeMetaText(description, 160) ||
    'Community-powered local information for Nigeria.';
  const canonical = absoluteUrl(path || '/');

  return {
    title: safeTitle,
    description: safeDescription,
    alternates: { canonical },
    robots: {
      index: Boolean(index),
      follow: Boolean(follow),
      googleBot: {
        index: Boolean(index),
        follow: Boolean(follow),
      },
    },
    openGraph: {
      title: safeTitle,
      description: safeDescription,
      url: canonical,
      siteName: 'Update Me',
      type,
      locale: 'en_NG',
      ...(publishedTime ? { publishedTime } : {}),
      ...(modifiedTime ? { modifiedTime } : {}),
      ...(images?.length ? { images } : {}),
    },
    twitter: {
      card: 'summary',
      title: safeTitle,
      description: safeDescription,
      ...(images?.length ? { images: images.map((i) => i.url || i) } : {}),
    },
  };
}

/** Prefer freshness-aware wording — never claim "live" when stale/expired. */
export function freshnessAwareLead(freshnessState, fallback = 'Local update') {
  switch (freshnessState) {
    case 'fresh':
    case 'recent':
      return fallback;
    case 'aging':
      return `${fallback} (aging)`;
    case 'stale':
      return `${fallback} (may be outdated)`;
    case 'expired':
      return `${fallback} (expired — historical)`;
    default:
      return fallback;
  }
}

export function formatPublicWhen(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
