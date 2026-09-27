import { buildPublicMetadata } from '@/lib/seo';

export const metadata = buildPublicMetadata({
  title: 'Community Q&A',
  description: 'Public community questions and answers about local places on Update Me.',
  path: '/community',
});

export default function CommunityLayout({ children }) {
  return children;
}
