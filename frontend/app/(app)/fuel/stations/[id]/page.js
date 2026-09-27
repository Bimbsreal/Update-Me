import FuelStationDetailClient from './FuelStationDetailClient';
import { publicFetchOptional } from '@/lib/publicFetch';
import { buildPublicMetadata, freshnessAwareLead, sanitizeMetaText } from '@/lib/seo';

export async function generateMetadata({ params }) {
  const { id } = await params;
  const data = await publicFetchOptional(`/fuel/stations/${encodeURIComponent(id)}`, {
    revalidate: 120,
  });
  const station = data?.station;
  if (!station) {
    return buildPublicMetadata({
      title: 'Fuel station',
      description: 'Public fuel station information on Update Me.',
      path: `/fuel/stations/${id}`,
      index: false,
    });
  }

  const place = station.location?.name || station.areaName || 'Nigeria';
  const freshness = data?.latestReport?.freshness || data?.quality?.freshness?.state;
  const lead = freshnessAwareLead(freshness, `Fuel at ${station.name}`);

  return buildPublicMetadata({
    title: sanitizeMetaText(`${station.name} — Fuel`, 70),
    description: sanitizeMetaText(`${lead} in ${place}. Community-reported availability and prices.`, 160),
    path: `/fuel/stations/${station.id}`,
    modifiedTime: data?.latestReport?.observedAt || station.updatedAt,
  });
}

export default async function FuelStationDetailPage({ params }) {
  const { id } = await params;
  return <FuelStationDetailClient id={id} />;
}
