import { PlaceholderPage } from '@/components/PlaceholderPage';

export const metadata = { title: 'Help — Update Me' };

export default function HelpPage() {
  return (
    <PlaceholderPage
      title="Help"
      description="Help centre content will live here. Reach out through Contact once that page is ready."
      primaryHref="/contact"
      primaryLabel="Contact"
    />
  );
}
