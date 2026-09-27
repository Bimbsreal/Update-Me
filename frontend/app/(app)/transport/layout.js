import { buildPublicMetadata } from '@/lib/seo';

export const metadata = buildPublicMetadata({
  title: 'Transport',
  description: 'Public transport routes and fare information on Update Me.',
  path: '/transport',
});

export default function TransportLayout({ children }) {
  return children;
}
