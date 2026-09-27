import OfficialDetailClient from './OfficialDetailClient';
import { JsonLd, newsArticleJsonLd } from '@/components/seo/JsonLd';
import { publicFetchOptional } from '@/lib/publicFetch';
import {
  absoluteUrl,
  buildPublicMetadata,
  sanitizeMetaText,
} from '@/lib/seo';

export async function generateMetadata({ params }) {
  const { id } = await params;
  const data = await publicFetchOptional(`/official-updates/${encodeURIComponent(id)}`, {
    revalidate: 180,
  });
  const update = data?.update;
  if (!update) {
    return buildPublicMetadata({
      title: 'Official update',
      description: 'Official notices from verified Nigerian sources on Update Me.',
      path: `/official-updates/${id}`,
      index: false,
    });
  }

  const agency = update.source?.shortName || update.source?.organizationName || 'Official';
  const when = update.publishedAt || update.retrievedAt;

  return buildPublicMetadata({
    title: sanitizeMetaText(update.title, 70),
    description: sanitizeMetaText(
      `${agency}: ${update.summary || update.title}. Published ${when ? new Date(when).toLocaleDateString('en-NG') : 'recently'}.`,
      160
    ),
    path: `/official-updates/${update.id}`,
    type: 'article',
    publishedTime: update.publishedAt,
    modifiedTime: update.updatedAt || update.retrievedAt || update.publishedAt,
  });
}

export default async function OfficialUpdateDetailPage({ params }) {
  const { id } = await params;
  const data = await publicFetchOptional(`/official-updates/${encodeURIComponent(id)}`, {
    revalidate: 180,
  });
  const update = data?.update;
  const jsonLd = update
    ? newsArticleJsonLd({
        headline: sanitizeMetaText(update.title, 110),
        description: sanitizeMetaText(update.summary || update.title, 160),
        url: absoluteUrl(`/official-updates/${update.id}`),
        datePublished: update.publishedAt || update.retrievedAt,
        dateModified: update.updatedAt || update.retrievedAt,
        authorName: update.source?.organizationName || update.source?.shortName,
      })
    : null;

  return (
    <>
      <JsonLd data={jsonLd} />
      <OfficialDetailClient id={id} />
    </>
  );
}
