import { buildPublicMetadata } from '@/lib/seo';

export const metadata = buildPublicMetadata({
  title: 'Directions',
  description: 'Local directions and route tips on Update Me.',
  path: '/directions',
});

export default function DirectionsLayout({ children }) {
  return children;
}
