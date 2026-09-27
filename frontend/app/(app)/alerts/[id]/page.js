import AlertDetailClient from './AlertDetailClient';
import { publicFetchOptional } from '@/lib/publicFetch';
import { buildPublicMetadata, freshnessAwareLead, sanitizeMetaText } from '@/lib/seo';

export async function generateMetadata({ params }) {
  const { id } = await params;
  const data = await publicFetchOptional(`/alerts/${encodeURIComponent(id)}`, {
    revalidate: 60,
  });
  const alert = data?.alert;
  if (!alert) {
    return buildPublicMetadata({
      title: 'Safety alert',
      description: 'Public safety and road alerts on Update Me.',
      path: `/alerts/${id}`,
      index: false,
    });
  }

  const place = alert.location?.name || 'Nigeria';
  const freshness = alert.freshness || alert.quality?.freshness?.state;
  const titleBase = alert.title || `${alert.severity || 'Safety'} alert`;
  const lead = freshnessAwareLead(freshness, titleBase);

  return buildPublicMetadata({
    title: sanitizeMetaText(`${titleBase} — ${place}`, 70),
    description: sanitizeMetaText(
      `${lead} near ${place}. Severity: ${alert.severity || 'unspecified'}.`,
      160
    ),
    path: `/alerts/${alert.id}`,
    type: 'article',
    modifiedTime: alert.updatedAt || alert.observedAt || alert.createdAt,
  });
}

export default async function AlertDetailPage({ params }) {
  const { id } = await params;
  return <AlertDetailClient id={id} />;
}
