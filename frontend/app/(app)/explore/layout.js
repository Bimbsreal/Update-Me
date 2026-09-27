import { buildPublicMetadata } from '@/lib/seo';

export const metadata = buildPublicMetadata({
  title: 'Explore',
  description: 'Explore public local information across Nigeria on Update Me.',
  path: '/explore',
});

export default function ExploreLayout({ children }) {
  return children;
}
