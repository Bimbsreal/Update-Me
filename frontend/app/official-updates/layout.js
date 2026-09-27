import { buildPublicMetadata } from '@/lib/seo';

export const metadata = buildPublicMetadata({
  title: 'Official updates',
  description:
    'Official notices from verified Nigerian government agencies and regulators on Update Me.',
  path: '/official-updates',
});

export default function OfficialUpdatesLayout({ children }) {
  return children;
}
