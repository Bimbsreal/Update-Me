import { PublicInfoChrome } from '@/components/layout/PublicInfoChrome';
import OfficialSourceClient from './OfficialSourceClient';

export const metadata = {
  title: 'Official source',
  description: 'Updates from a verified government or official agency source on Update Me.',
};

export default function OfficialSourcePage({ params }) {
  return (
    <PublicInfoChrome backHref="/official-updates" backLabel="All official updates">
      <OfficialSourceClient id={params?.id} />
    </PublicInfoChrome>
  );
}
