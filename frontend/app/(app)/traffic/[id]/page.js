import TrafficDetailClient from './TrafficDetailClient';
import { publicFetchOptional } from '@/lib/publicFetch';
import { buildPublicMetadata, freshnessAwareLead, sanitizeMetaText } from '@/lib/seo';

export async function generateMetadata({ params }) {
  const { id } = await params;
  const data = await publicFetchOptional(`/traffic/${encodeURIComponent(id)}`, {
    revalidate: 60,
  });
  const traffic = data?.traffic;
  if (!traffic) {
    return buildPublicMetadata({
      title: 'Traffic update',
      description: 'Public traffic information on Update Me.',
      path: `/traffic/${id}`,
      index: false,
    });
  }

  const place = traffic.road?.name || traffic.location?.name || 'Nigeria';
  const severity = traffic.severity || 'traffic';
  const freshness = traffic.report?.freshness || traffic.quality?.freshness?.state;
  const lead = freshnessAwareLead(freshness, `${severity} traffic near ${place}`);
  const when = traffic.report?.occurredAt || traffic.report?.createdAt;

  return buildPublicMetadata({
    title: sanitizeMetaText(`${severity} traffic — ${place}`, 70),
    description: sanitizeMetaText(
      `${lead}. Community report${when ? ` observed ${new Date(when).toLocaleDateString('en-NG')}` : ''}. Source: ${traffic.report?.sourceType || 'community'}.`,
      160
    ),
    path: `/traffic/${traffic.id}`,
    type: 'article',
    modifiedTime: traffic.report?.updatedAt || traffic.report?.lastConfirmedAt || when,
  });
}

export default async function TrafficDetailPage({ params }) {
  const { id } = await params;
  return <TrafficDetailClient id={id} />;
}
