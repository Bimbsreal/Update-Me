import { buildPublicMetadata } from '@/lib/seo';

export const metadata = buildPublicMetadata({
  title: 'Safety alerts',
  description: 'Public safety and road alerts on Update Me.',
  path: '/alerts',
});

export default function AlertsLayout({ children }) {
  return children;
}
