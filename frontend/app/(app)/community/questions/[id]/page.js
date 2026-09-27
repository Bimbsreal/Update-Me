import QuestionDetailClient from './QuestionDetailClient';
import { publicFetchOptional } from '@/lib/publicFetch';
import { buildPublicMetadata, sanitizeMetaText } from '@/lib/seo';

export async function generateMetadata({ params }) {
  const { id } = await params;
  const data = await publicFetchOptional(`/community/questions/${encodeURIComponent(id)}`, {
    revalidate: 120,
  });
  const question = data?.question;
  if (!question) {
    return buildPublicMetadata({
      title: 'Community question',
      description: 'Public community Q&A on Update Me.',
      path: `/community/questions/${id}`,
      index: false,
    });
  }

  const place = question.location?.name || 'Nigeria';

  return buildPublicMetadata({
    title: sanitizeMetaText(question.title, 70),
    description: sanitizeMetaText(
      `Community question about ${place}. ${question.status || 'Open'} on Update Me.`,
      160
    ),
    path: `/community/questions/${question.id}`,
    modifiedTime: question.updatedAt || question.createdAt,
  });
}

export default async function QuestionDetailPage({ params }) {
  const { id } = await params;
  return <QuestionDetailClient id={id} />;
}
