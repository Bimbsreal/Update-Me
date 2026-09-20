'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { StatusPill } from '@/components/landing/FeatureCard';
import { CategoryIcon } from '@/components/landing/CategoryIcon';

const categories = [
  { label: 'Traffic', name: 'traffic', tone: 'urgent' },
  { label: 'Fuel', name: 'fuel', tone: 'available' },
  { label: 'Transport', name: 'transport', tone: 'official' },
  { label: 'Prices', name: 'prices', tone: 'attention' },
  { label: 'Directions', name: 'directions', tone: 'normal' },
  { label: 'Alerts', name: 'alerts', tone: 'urgent' },
];

export function Hero() {
  const router = useRouter();
  const [q, setQ] = useState('');

  function onSearch(e) {
    e.preventDefault();
    const term = q.trim();
    if (!term) {
      router.push('/explore');
      return;
    }
    router.push(`/explore?q=${encodeURIComponent(term)}`);
  }

  return (
    <section id="home" className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        aria-hidden
        style={{
          background:
            'radial-gradient(ellipse 70% 55% at 85% 10%, rgba(0,109,68,0.16), transparent 55%), linear-gradient(180deg, #f7fbf8 0%, #ffffff 55%, #f8f9fa 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 -z-10 hidden w-[48%] opacity-30 lg:block"
        aria-hidden
        style={{
          backgroundImage:
            'linear-gradient(90deg, #ffffff 0%, rgba(255,255,255,0.55) 28%, transparent 60%), url("/hero-bridge.svg")',
          backgroundSize: 'cover',
          backgroundPosition: 'center right',
        }}
      />

      <Container className="grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:py-20">
        <div className="min-w-0">
          <Badge className="uppercase tracking-[0.12em]">
            Nigeria’s community utility updates
          </Badge>
          <h1 className="mt-5 max-w-[18ch] text-[2.15rem] font-extrabold leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-[3.35rem]">
            Know what’s happening{' '}
            <span className="text-brand-600">around you.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
            Real-time, community-powered information for everyday life in Nigeria —
            traffic, fuel, transport, prices, directions, and local alerts from people
            nearby.
          </p>

          <form onSubmit={onSearch} className="mt-7 max-w-xl">
            <label htmlFor="landing-search" className="sr-only">
              Search Update Me
            </label>
            <div className="flex gap-2">
              <input
                id="landing-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search Lekki, fuel, traffic…"
                className="h-12 min-w-0 flex-1 rounded-control border border-surface-border bg-white px-3.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                autoComplete="off"
              />
              <button
                type="submit"
                className="h-12 shrink-0 rounded-control bg-brand-700 px-4 text-sm font-semibold text-white"
              >
                Search
              </button>
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              Finds Update Me places and information — not the open web.
            </p>
          </form>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button as={Link} href="/explore" size="lg" className="w-full sm:w-auto">
              Explore Updates
              <span aria-hidden>→</span>
            </Button>
            <Button
              as={Link}
              href="/register"
              variant="secondary"
              size="lg"
              className="w-full sm:w-auto"
            >
              Join Update Me
            </Button>
          </div>
          <p className="mt-6 text-sm font-medium text-ink-muted">
            Real people. Real updates. A better Nigeria.
          </p>
        </div>

        <HeroVisual />
      </Container>
    </section>
  );
}

function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[380px] lg:max-w-none">
      <div className="absolute -left-2 top-8 hidden rounded-card border border-brand-100 bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-soft sm:block lg:-left-6">
        Useful information over social engagement
      </div>
      <div className="rounded-[2rem] border-[10px] border-ink bg-white p-3 shadow-soft">
        <div className="rounded-[1.4rem] bg-surface-muted p-3 sm:p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-ink-muted">Around you</p>
              <p className="font-bold text-ink">Lagos · Demo preview</p>
            </div>
            <StatusPill status="available" label="Preview" />
          </div>
          <div className="mt-3 rounded-control border border-surface-border bg-white px-3 py-2.5 text-xs text-ink-soft">
            Search areas, routes, fuel, prices…
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {categories.map((item) => (
              <div
                key={item.label}
                className="rounded-control border border-surface-border bg-white p-2 text-center"
              >
                <span className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                  <CategoryIcon name={item.name} className="h-4 w-4" />
                </span>
                <p className="text-[10px] font-semibold text-ink">{item.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-2">
            <p className="text-xs font-semibold text-ink">What’s happening now?</p>
            <div className="rounded-control border border-surface-border bg-white p-2.5">
              <StatusPill status="urgent" label="Heavy traffic" />
              <p className="mt-1 text-[11px] text-ink-muted">Lekki–Epe Expressway · Demo</p>
            </div>
            <div className="rounded-control border border-surface-border bg-white p-2.5">
              <StatusPill status="available" label="Fuel available" />
              <p className="mt-1 text-[11px] text-ink-muted">₦945/L · Lekki Phase 1 · Demo</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
