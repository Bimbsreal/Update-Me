import { buildPublicMetadata } from '@/lib/seo';

export const metadata = buildPublicMetadata({
  title: 'Home',
  description: 'Your personalized Update Me home.',
  path: '/home',
  index: false,
  follow: false,
});

export default function HomeLayout({ children }) {
  return children;
}
