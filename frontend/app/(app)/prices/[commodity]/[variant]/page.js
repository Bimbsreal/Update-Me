import PriceDetailClient from './PriceDetailClient';
import { publicFetchOptional } from '@/lib/publicFetch';
import { buildPublicMetadata, freshnessAwareLead, sanitizeMetaText } from '@/lib/seo';

export async function generateMetadata({ params }) {
  const { commodity, variant } = await params;
  const path = `/prices/${encodeURIComponent(commodity)}/${encodeURIComponent(variant)}`;
  const data = await publicFetchOptional(
    `/prices/${encodeURIComponent(commodity)}/${encodeURIComponent(variant)}`,
    { revalidate: 120 }
  );
  const detail = data?.commodity || data?.detail || data;
  if (!detail && !data?.reports?.length && !data?.summary) {
    return buildPublicMetadata({
      title: 'Commodity prices',
      description: 'Public commodity price information on Update Me.',
      path,
      index: false,
    });
  }

  const label =
    detail?.label ||
    data?.summary?.label ||
    `${decodeURIComponent(commodity)} ${decodeURIComponent(variant)}`;
  const freshness = data?.summary?.freshness || data?.quality?.freshness?.state;
  const lead = freshnessAwareLead(freshness, `Prices for ${label}`);

  return buildPublicMetadata({
    title: sanitizeMetaText(`${label} — Prices`, 70),
    description: sanitizeMetaText(`${lead}. Community-reported market prices in Nigeria.`, 160),
    path,
  });
}

export default async function PriceDetailPage({ params }) {
  const { commodity, variant } = await params;
  return <PriceDetailClient commodity={commodity} variant={variant} />;
}
