import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';

export function CTASection() {
  return (
    <section className="relative overflow-hidden py-16 sm:py-20">
      <div
        className="absolute inset-0 -z-10 bg-brand-900"
        aria-hidden
        style={{
          backgroundImage:
            'linear-gradient(rgba(0, 51, 32, 0.86), rgba(0, 71, 44, 0.9)), url("/hero-bridge.svg")',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      <Container className="text-center text-white">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Know more. Move smarter.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-base text-white/80 sm:text-lg">
          Join Update Me for free and get community-powered updates that help you make
          better everyday decisions across Nigeria.
        </p>
        <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Button
            as={Link}
            href="/register"
            size="lg"
            className="bg-white text-brand-800 hover:bg-brand-50"
          >
            Get Started
          </Button>
          <Button
            as={Link}
            href="/login"
            variant="ghost"
            size="lg"
            className="text-white hover:bg-white/10"
          >
            Sign In
          </Button>
        </div>
      </Container>
    </section>
  );
}
