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
  const { hasTenant, loading } = useClubSettings();

  // Wait for the tenant resolution before deciding which UI to show.
  // Without this guard, hasTenant defaults to `true` and the gym page
  // flashes briefly before switching to the SaaS landing on apex host.
  if (loading) return null;

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