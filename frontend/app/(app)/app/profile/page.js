import { redirect } from 'next/navigation';

export const metadata = { title: 'Profile — Update Me' };

export default function AppProfileRedirectPage() {
  redirect('/profile');
}
