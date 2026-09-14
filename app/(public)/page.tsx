"use client";

import { useClubSettings } from "@/context/ClubSettingsContext";
import HeroSection from "@/components/home/HeroSection";
import ClubIntro from "@/components/home/ClubIntro";
import SportsSection from "@/components/home/SportsSection";
import RelaxSection from "@/components/home/RelaxSection";
import GallerySection from "@/components/home/GallerySection";
import CalendarPreview from "@/components/home/CalendarPreview";
import CoachesSection from "@/components/home/CoachesSection";
import PricingSection from "@/components/home/PricingSection";
import CTASection from "@/components/home/CTASection";
import LandingPage from "@/components/landing/LandingPage";

export default function HomePage() {
  const { hasTenant } = useClubSettings();

  // No resolved gym tenant (apex/platform host, or no dev tenant
  // configured) — show the SaaS marketing site instead of a gym's page.
  if (!hasTenant) {
    return <LandingPage />;
  }

  return (
    <>
      <HeroSection />
      <ClubIntro />
      <SportsSection />
      <RelaxSection />
      <GallerySection />
      <CalendarPreview />
      <CoachesSection />
      <PricingSection />
      <CTASection />
    </>
  );
}