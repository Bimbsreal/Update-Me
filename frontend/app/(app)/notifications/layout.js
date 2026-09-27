import { buildPublicMetadata } from '@/lib/seo';

export const metadata = buildPublicMetadata({
  title: 'Notifications',
  description: 'Your Update Me notifications.',
  path: '/notifications',
  index: false,
  follow: false,
});

export default function NotificationsLayout({ children }) {
  return children;
}
