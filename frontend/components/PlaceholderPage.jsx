import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';

export function PlaceholderPage({
  title,
  description,
  primaryHref = '/get-started',
  primaryLabel = 'Get Started',
}) {
  return (
    <section className="section-y">
      <Container className="max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
          Coming soon
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          {title}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-ink-muted">{description}</p>
        <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Button as={Link} href={primaryHref}>
            {primaryLabel}
          </Button>
          <Button as={Link} href="/" variant="secondary">
            Back to Home
          </Button>
        </div>
      </Container>
    </section>
  );
}
