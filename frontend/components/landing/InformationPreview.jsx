import { Container } from '@/components/ui/Container';
import {
  AlertCard,
  FuelCard,
  TrafficCard,
  TransportCard,
} from '@/components/landing/PreviewCards';
import {
  DEMO_PREVIEW_LABEL,
  demoAlert,
  demoFuel,
  demoTraffic,
  demoTransport,
} from '@/lib/landingDemo';

export function InformationPreview() {
  return (
    <section id="live-preview" className="section-y bg-surface-muted/80 border-y border-surface-border">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
            Live information preview
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            See the kind of updates people share
          </h2>
          <p className="mt-3 text-ink-muted">
            Demonstration cards only — structured for a future API connection, not live
            production data.
          </p>
          <p className="mt-2 text-xs font-medium text-ink-soft">{DEMO_PREVIEW_LABEL}</p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <TrafficCard report={demoTraffic} />
          <FuelCard report={demoFuel} />
          <TransportCard report={demoTransport} />
          <AlertCard report={demoAlert} />
        </div>
      </Container>
    </section>
  );
}
