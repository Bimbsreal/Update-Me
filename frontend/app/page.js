import { Hero } from '@/components/landing/Hero';
import { InformationPreview } from '@/components/landing/InformationPreview';
import { TrafficNearYou } from '@/components/landing/TrafficNearYou';
import { FuelNearYou } from '@/components/landing/FuelNearYou';
import { PricesNearYou } from '@/components/landing/PricesNearYou';
import { OfficialNearYou } from '@/components/landing/OfficialNearYou';
import { PlaceSearchCompact } from '@/components/landing/PlaceSearchCompact';
import { Features } from '@/components/landing/Features';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { MapPreview } from '@/components/landing/MapPreview';
import { CommunityPreview } from '@/components/landing/CommunityPreview';
import { OfficialUpdatesSection } from '@/components/landing/OfficialUpdatesSection';
import { FxSection } from '@/components/landing/FxSection';
import { TrustSection } from '@/components/landing/TrustSection';
import { CTASection } from '@/components/landing/CTASection';
import { Container } from '@/components/ui/Container';

export default function HomePage() {
  return (
    <>
      <Hero />
      <section className="border-b border-surface-border bg-surface-muted/50 py-8 sm:py-10">
        <Container>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <PlaceSearchCompact />
            <TrafficNearYou />
            <FuelNearYou />
            <PricesNearYou />
            <OfficialNearYou />
          </div>
        </Container>
      </section>
      <InformationPreview />
      <Features />
      <HowItWorks />
      <MapPreview />
      <CommunityPreview />
      <OfficialUpdatesSection />
      <FxSection />
      <TrustSection />
      <CTASection />
    </>
  );
}
