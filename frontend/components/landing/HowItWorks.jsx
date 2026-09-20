import { Container } from '@/components/ui/Container';
import { demoSteps } from '@/lib/landingDemo';

export function HowItWorks() {
  return (
    <section id="how-it-works" className="section-y border-y border-surface-border bg-surface-muted/70">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            How Update Me works
          </h2>
          <p className="mt-3 text-ink-muted">
            A simple loop for discovering and sharing useful local information.
          </p>
        </div>

        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {demoSteps.map((item, index) => (
            <li
              key={item.step}
              className="relative rounded-card border border-surface-border bg-white p-5 text-center shadow-card"
            >
              {index < demoSteps.length - 1 ? (
                <span
                  className="pointer-events-none absolute right-[-0.65rem] top-1/2 hidden h-px w-5 -translate-y-1/2 bg-brand-200 lg:block"
                  aria-hidden
                />
              ) : null}
              <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                {item.step}
              </div>
              <h3 className="text-base font-bold text-ink">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{item.body}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
