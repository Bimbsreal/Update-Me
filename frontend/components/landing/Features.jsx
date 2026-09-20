import { Container } from '@/components/ui/Container';
import { FeatureCard } from '@/components/landing/FeatureCard';
import { demoFeatures } from '@/lib/landingDemo';

export function Features() {
  return (
    <section id="features" className="section-y">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Built for everyday decisions
          </h2>
          <p className="mt-3 text-ink-muted">
            Six utility categories. No social feed, no popularity contests — just useful
            local information.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {demoFeatures.map((feature) => (
            <FeatureCard
              key={feature.id}
              title={feature.title}
              body={feature.body}
              accent={feature.accent}
            />
          ))}
        </div>
      </Container>
    </section>
  );
}
