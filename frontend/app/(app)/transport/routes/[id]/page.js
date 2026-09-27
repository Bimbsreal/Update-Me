import TransportRouteDetailClient from './TransportRouteDetailClient';
import { publicFetchOptional } from '@/lib/publicFetch';
import { buildPublicMetadata, sanitizeMetaText } from '@/lib/seo';

export async function generateMetadata({ params }) {
  const { id } = await params;
  const data = await publicFetchOptional(`/transport/routes/${encodeURIComponent(id)}`, {
    revalidate: 180,
  });
  const route = data?.route;
  if (!route) {
    return buildPublicMetadata({
      title: 'Transport route',
      description: 'Public transport route information on Update Me.',
      path: `/transport/routes/${id}`,
      index: false,
    });
  }

  const name =
    route.name ||
    [route.origin?.name, route.destination?.name].filter(Boolean).join(' → ') ||
    'Transport route';

  return buildPublicMetadata({
    title: sanitizeMetaText(`${name} — Transport`, 70),
    description: sanitizeMetaText(
      `Public transport information for ${name}${route.mode ? ` (${route.mode})` : ''}.`,
      160
    ),
    path: `/transport/routes/${route.id}`,
  });
}

export default async function TransportRouteDetailPage({ params }) {
  const { id } = await params;
  return <TransportRouteDetailClient id={id} />;
}
