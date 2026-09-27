import { buildPublicMetadata } from '@/lib/seo';

export const metadata = buildPublicMetadata({
  title: 'Traffic',
  description: 'Public traffic reports and road conditions across Nigeria on Update Me.',
  path: '/traffic',
});

export default function TrafficLayout({ children }) {
  return children;
}
