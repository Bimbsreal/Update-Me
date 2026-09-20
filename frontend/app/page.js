import { Hero } from '@/components/landing/Hero';
import { InformationPreview } from '@/components/landing/InformationPreview';
import { Features } from '@/components/landing/Features';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { MapPreview } from '@/components/landing/MapPreview';
import { CommunityPreview } from '@/components/landing/CommunityPreview';
import { OfficialUpdatesSection } from '@/components/landing/OfficialUpdatesSection';
import { FxSection } from '@/components/landing/FxSection';
import { TrustSection } from '@/components/landing/TrustSection';
import { CTASection } from '@/components/landing/CTASection';

export default function HomePage() {
  return (
    <>
      <Hero />
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
