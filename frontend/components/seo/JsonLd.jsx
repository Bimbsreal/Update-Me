/**
 * Safe JSON-LD injection for public pages. Pass plain serializable objects only.
 */
export function JsonLd({ data }) {
  if (!data) return null;
  const payload = Array.isArray(data) ? data : [data];
  const safe = payload.filter(Boolean);
  if (!safe.length) return null;

  return (
    <script
      type="application/ld+json"
      // Content is generated from our own public API fields (sanitized upstream).
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(safe).replace(/</g, '\\u003c'),
      }}
    />
  );
}

export function webPageJsonLd({ name, description, url, datePublished, dateModified }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name,
    description,
    url,
    isPartOf: {
      '@type': 'WebSite',
      name: 'Update Me',
      url: url ? new URL(url).origin : undefined,
    },
    ...(datePublished ? { datePublished } : {}),
    ...(dateModified ? { dateModified } : {}),
  };
}

export function placeJsonLd({ name, description, url, addressRegion, addressLocality }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name,
    description,
    url,
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'NG',
      ...(addressRegion ? { addressRegion } : {}),
      ...(addressLocality ? { addressLocality } : {}),
    },
  };
}

export function newsArticleJsonLd({
  headline,
  description,
  url,
  datePublished,
  dateModified,
  authorName,
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline,
    description,
    url,
    datePublished,
    dateModified: dateModified || datePublished,
    author: authorName
      ? { '@type': 'Organization', name: authorName }
      : { '@type': 'Organization', name: 'Update Me' },
    publisher: {
      '@type': 'Organization',
      name: 'Update Me',
    },
    isAccessibleForFree: true,
  };
}
