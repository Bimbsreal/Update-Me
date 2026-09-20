import { redirect } from 'next/navigation';

export const metadata = { title: 'Community — Update Me' };

export default function AppCommunityPage() {
  redirect('/community');
}
