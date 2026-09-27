import { buildPublicMetadata } from '@/lib/seo';

export const metadata = buildPublicMetadata({
  title: 'Profile',
  description: 'Your Update Me profile.',
  path: '/profile',
  index: false,
  follow: false,
});

export default function ProfileLayout({ children }) {
  return children;
}
