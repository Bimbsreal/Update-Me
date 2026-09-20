import { Container } from '@/components/ui/Container';
import { demoCommunity } from '@/lib/landingDemo';

export function CommunityPreview() {
  return (
    <section id="community" className="section-y border-y border-surface-border bg-surface-muted/70">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Someone nearby may know exactly what you need to know
          </h2>
          <p className="mt-3 text-ink-muted">
            People helping people find useful local information — not a social network.
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-4xl gap-4 md:grid-cols-2">
          {demoCommunity.map((item) => (
            <article
              key={item.id}
              className="rounded-card border border-surface-border bg-white p-5 shadow-card sm:p-6"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                Question · {item.place}
              </p>
              <h3 className="mt-2 text-base font-bold text-ink">{item.question}</h3>
              <div className="mt-4 rounded-control border border-brand-100 bg-brand-50/60 p-3">
                <p className="text-xs font-semibold text-brand-700">Useful response</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{item.answer}</p>
              </div>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
