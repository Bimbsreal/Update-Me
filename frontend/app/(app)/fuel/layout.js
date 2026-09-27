import { buildPublicMetadata } from '@/lib/seo';

export const metadata = buildPublicMetadata({
  title: 'Fuel',
  description: 'Public fuel station availability and price reports on Update Me.',
  path: '/fuel',
});

export default function FuelLayout({ children }) {
  return children;
}
