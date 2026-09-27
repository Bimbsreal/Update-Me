import LocationHubClient from './LocationHubClient';
import { JsonLd, placeJsonLd } from '@/components/seo/JsonLd';
import { publicFetchOptional } from '@/lib/publicFetch';
import { absoluteUrl, buildPublicMetadata, sanitizeMetaText } from '@/lib/seo';

function resolveKey(slugParts) {
  if (!Array.isArray(slugParts) || !slugParts.length) return null;
  // Prefer the deepest segment; API resolves by slug or UUID.
  return decodeURIComponent(slugParts[slugParts.length - 1]);
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const key = resolveKey(slug);
  if (!key) {
    return buildPublicMetadata({
      title: 'Locations',
      description: 'Public places in Nigeria on Update Me.',
      path: '/locations',
      index: false,
    });
  }

  const data = await publicFetchOptional(`/locations/${encodeURIComponent(key)}`, {
    revalidate: 300,
  });
  const location = data?.location;
  if (!location) {
    return buildPublicMetadata({
      title: 'Location',
      description: 'Public place information on Update Me.',
      path: `/locations/${slug.map(encodeURIComponent).join('/')}`,
      index: false,
    });
  }

  const pathSlug = location.slug || location.id;
  const region = location.state?.name;
  const locality = location.lga?.name || location.city?.name || location.area?.name;

  return buildPublicMetadata({
    title: sanitizeMetaText(`${location.name} — Local updates`, 70),
    description: sanitizeMetaText(
      `Public local information for ${location.name}${location.subtitle ? ` (${location.subtitle})` : ''} in Nigeria — traffic, fuel, transport, prices, and alerts.`,
      160
    ),
    path: `/locations/${encodeURIComponent(pathSlug)}`,
  });
}

export default async function LocationPage({ params }) {
  const { slug } = await params;
  const key = resolveKey(slug);
  const data = await publicFetchOptional(`/locations/${encodeURIComponent(key || '')}`, {
    revalidate: 300,
  });
  const location = data?.location;
  const pathSlug = location?.slug || location?.id || key;
  const jsonLd = location
    ? placeJsonLd({
        name: location.name,
        description: location.subtitle || `Public information for ${location.name}, Nigeria`,
        url: absoluteUrl(`/locations/${encodeURIComponent(pathSlug)}`),
        addressRegion: location.state?.name,
        addressLocality: location.lga?.name || location.city?.name || location.area?.name,
      })
    : null;

  return (
    <>
      <JsonLd data={jsonLd} />
      <LocationHubClient initialLocation={location || null} slugKey={key} />
    </>
  );
}
