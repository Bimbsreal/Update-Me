import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Container } from '@/components/ui/Container';
import { CategoryIcon } from '@/components/landing/CategoryIcon';
import { StatusPill } from '@/components/landing/FeatureCard';
import { DEMO_PREVIEW_LABEL, demoNearby } from '@/lib/landingDemo';

const filters = [
  { label: 'Traffic', name: 'traffic' },
  { label: 'Fuel', name: 'fuel' },
  { label: 'Transport', name: 'transport' },
  { label: 'Prices', name: 'prices' },
  { label: 'Alerts', name: 'alerts' },
];

export function MapPreview() {
  return (
    <section id="explore-preview" className="section-y">
      <Container>
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              Explore information around Nigeria
            </h2>
            <p className="mt-3 text-ink-muted">
              A location-first view of community updates — designed for nationwide
              coverage, demonstrated here with a map-style preview.
            </p>
            <p className="mt-2 text-xs font-medium text-ink-soft">{DEMO_PREVIEW_LABEL}</p>
            <Button as={Link} href="/explore" className="mt-6" size="lg">
              Open Explore
            </Button>
          </div>

          <Card padded={false} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-surface-border p-3">
              <div className="min-w-[140px] flex-1 rounded-control border border-surface-border bg-surface-muted px-3 py-2 text-xs text-ink-soft">
                Search areas across Nigeria…
              </div>
              {filters.map((filter) => (
                <Badge key={filter.label} tone="neutral" className="gap-1.5">
                  <CategoryIcon name={filter.name} className="h-3.5 w-3.5" />
                  {filter.label}
                </Badge>
              ))}
            </div>

            <div className="grid lg:grid-cols-[1.25fr_0.9fr]">
              <div className="relative min-h-[260px] overflow-hidden bg-[#d9ebe1] sm:min-h-[320px]">
                <img
                  src="/map-preview.svg"
                  alt="Stylised map preview of Nigerian areas with example update markers"
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                />
                <div className="absolute left-[12%] top-[34%] max-w-[220px] rounded-control bg-ink px-3 py-2 text-xs text-white shadow-soft">
                  Heavy traffic · Lekki–Epe Expressway
                </div>
                <div className="absolute bottom-4 left-4 rounded-pill bg-white/95 px-3 py-1 text-[11px] font-semibold text-brand-700">
                  Map preview · MapLibre-ready
                </div>
              </div>

              <div className="space-y-3 border-t border-surface-border p-4 lg:border-l lg:border-t-0">
                <p className="text-sm font-bold text-ink">Nearby updates</p>
                {demoNearby.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-control border border-surface-border p-3"
                    data-category={item.category}
                  >
                    <StatusPill
                      status={item.status || item.availability || 'attention'}
                      label={item.title}
                    />
                    <p className="mt-2 text-sm font-semibold text-ink">{item.place}</p>
                    <p className="mt-1 text-xs text-ink-soft">
                      {item.priceLabel || item.fareLabel || item.freshnessLabel} · Demo
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </Container>
    </section>
  );
}
