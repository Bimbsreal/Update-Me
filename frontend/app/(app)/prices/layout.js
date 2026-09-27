import { buildPublicMetadata } from '@/lib/seo';

export const metadata = buildPublicMetadata({
  title: 'Commodity prices',
  description: 'Public commodity price reports across Nigeria on Update Me.',
  path: '/prices',
});

export default function PricesLayout({ children }) {
  return children;
}
