import TrafficEventDetailClient from './TrafficEventDetailClient';
import { publicFetchOptional } from '@/lib/publicFetch';
import { buildPublicMetadata, sanitizeMetaText } from '@/lib/seo';

export async function generateMetadata({ params }) {
  const { id } = await params;
  const data = await publicFetchOptional(`/traffic/events/${encodeURIComponent(id)}`, {
    revalidate: 60,
  });
  const event = data?.event;
  if (!event) {
    return buildPublicMetadata({
      title: 'Traffic event',
      description: 'Public traffic event on Update Me.',
      path: `/traffic/events/${id}`,
      index: false,
    });
  }

  const place = event.roadName || event.locationName || 'Nigeria';
  return buildPublicMetadata({
    title: sanitizeMetaText(`${event.title} — ${place}`, 70),
    description: sanitizeMetaText(
      `${event.severityBand?.label || 'Traffic'} on ${place}. Source: ${event.sourceLabel || 'community'}.`,
      160
    ),
    path: `/traffic/events/${event.id}`,
    type: 'article',
  });
}

export default async function TrafficEventDetailPage({ params }) {
  const { id } = await params;
  return <TrafficEventDetailClient id={id} />;
}
