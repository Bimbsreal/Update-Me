import Link from 'next/link';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { Container } from '@/components/ui/Container';

const footerLinks = [
  { href: '/about', label: 'About' },
  { href: '/#how-it-works', label: 'How It Works' },
  { href: '/#features', label: 'Features' },
  { href: '/explore', label: 'Explore' },
  { href: '/help', label: 'Help' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/contact', label: 'Contact' },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-surface-border bg-white pb-[env(safe-area-inset-bottom)]">
      <Container className="grid gap-8 py-10 md:grid-cols-[1.1fr_1.4fr] md:items-start">
        <div className="max-w-sm space-y-3">
          <BrandLogo />
          <p className="text-sm leading-relaxed text-ink-muted">
            Real people. Real updates. A better Nigeria.
          </p>
          <p className="text-xs font-semibold text-brand-700">
            Built for Nigerians. By Nigerians.
          </p>
        </div>

        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded text-sm text-ink-muted transition hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </Container>
      <div className="border-t border-surface-border py-4 text-center text-xs text-ink-soft">
        © {new Date().getFullYear()} Update Me. Useful information over social engagement.
      </div>
    </footer>
  );
}
