import { Container } from '@/components/ui/Container';
import { StatusPill } from '@/components/landing/FeatureCard';

const qualities = [
  {
    status: 'available',
    label: 'Community reported',
    body: 'Shared by people who are there — grounded in what they observed.',
  },
  {
    status: 'normal',
    label: 'Community confirmed',
    body: 'Others can confirm a report so confidence grows with fresh eyes.',
  },
  {
    status: 'official',
    label: 'Official',
    body: 'Official public-service updates stay clearly distinguishable.',
  },
  {
    status: 'caution',
    label: 'Updated',
    body: 'Reports can change as conditions change on the ground.',
  },
  {
    status: 'expired',
    label: 'Expired',
    body: 'Stale information is marked so you can trust what is still current.',
  },
];

export function TrustSection() {
  return (
    <section id="trust" className="section-y">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Designed for useful, current information
          </h2>
          <p className="mt-3 text-ink-muted">
            Update Me is built around freshness and clarity — not likes, followers, or
            viral reach.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {qualities.map((item) => (
            <article
              key={item.label}
              className="rounded-card border border-surface-border bg-white p-5 shadow-card"
            >
              <StatusPill status={item.status} label={item.label} />
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">{item.body}</p>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
