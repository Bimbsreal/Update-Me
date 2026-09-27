'use client';

import Link from 'next/link';
import { ShareControls } from '@/components/share/ShareControls';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';

const CATEGORY_LINKS = [
  { key: 'traffic', label: 'Traffic', href: (id) => `/traffic?locationId=${encodeURIComponent(id)}` },
  { key: 'fuel', label: 'Fuel', href: (id) => `/fuel?locationId=${encodeURIComponent(id)}` },
  { key: 'transport', label: 'Transport', href: (id) => `/transport?locationId=${encodeURIComponent(id)}` },
  { key: 'prices', label: 'Prices', href: (id) => `/prices?locationId=${encodeURIComponent(id)}` },
  { key: 'alerts', label: 'Alerts', href: (id) => `/alerts?locationId=${encodeURIComponent(id)}` },
  {
    key: 'explore',
    label: 'Explore map',
    href: (id) => `/explore?locationId=${encodeURIComponent(id)}&freshness=all`,
  },
  {
    key: 'official',
    label: 'Official updates',
    href: (id) => `/explore?locationId=${encodeURIComponent(id)}&category=official&freshness=all`,
  },
];

/**
 * Public location hub — no private user coordinates.
 */
export default function LocationHubClient({ initialLocation, slugKey }) {
  const location = initialLocation;

  if (!location) {
    return (
      <Container className="section-y">
        <div className="mx-auto max-w-2xl rounded-card border border-surface-border bg-white p-6 shadow-card">
          <h1 className="text-xl font-bold text-ink">Place not found</h1>
          <p className="mt-2 text-sm text-ink-muted">
            No public location matched{slugKey ? ` “${slugKey}”` : ''}. Try Explore or Search.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button as={Link} href="/explore" variant="secondary">
              Open Explore
            </Button>
            <Button as={Link} href="/" variant="ghost">
              Home
            </Button>
          </div>
        </div>
      </Container>
    );
  }

  const crumbs = Array.isArray(location.breadcrumb) ? location.breadcrumb : [];
  const pathSlug = location.slug || location.id;

  return (
    <Container className="section-y">
      <article className="mx-auto max-w-2xl rounded-card border border-surface-border bg-white p-5 shadow-card sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {crumbs.length ? (
              <p className="text-xs text-ink-muted break-words">
                {crumbs.map((c) => c.name || c).filter(Boolean).join(' · ')}
              </p>
            ) : null}
            <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-brand-700">
              {location.type || 'Place'}
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink break-words sm:text-3xl">
              {location.name}
            </h1>
            {location.subtitle ? (
              <p className="mt-2 text-sm text-ink-muted break-words">{location.subtitle}</p>
            ) : null}
          </div>
          <ShareControls title={`${location.name} — Update Me`} text={location.subtitle || location.name} />
        </div>

        <p className="mt-6 text-sm leading-relaxed text-ink-muted">
          Public local information for this place. Exact personal device coordinates are never shown
          here. Status and freshness come from community and official sources on Update Me.
        </p>

        <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-ink-muted">
          Discover nearby information
        </h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {CATEGORY_LINKS.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href(location.id)}
                className="flex min-h-11 items-center justify-between rounded-lg border border-surface-border px-3 py-2 text-sm font-semibold text-ink hover:border-brand-300 hover:bg-brand-50/60"
              >
                {item.label}
                <span aria-hidden className="text-brand-700">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-wrap gap-2">
          <Button as={Link} href={`/explore/${encodeURIComponent(pathSlug)}`} variant="secondary">
            Open in Explore
          </Button>
          <Button as={Link} href="/" variant="ghost">
            Update Me home
          </Button>
        </div>
      </article>
    </Container>
  );
}
