"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useClubSettings } from "@/context/ClubSettingsContext";

// Code-split: `three` + GLTFLoader (~658KB) only loads for clubs that
// haven't set a hero photo, and only once this component actually mounts on
// the client — never during SSR, never on a photo-branded club's homepage.
const HeroDumbbellScene = dynamic(() => import("./HeroDumbbellScene"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 w-full h-full bg-primary" />,
});

export default function HeroSection() {
  const { isDark } = useTheme();
  const { isLoggedIn, userRole } = useAuth();
  const { name: clubName, heroTitle, heroSubtitle, heroImageUrl } = useClubSettings();
  const usePhoto = Boolean(heroImageUrl);

  const isAdmin =
      userRole?.toUpperCase() === "ADMIN" ||
      userRole?.toUpperCase() === "OWNER";

  const ctaButton = (() => {
    if (!isLoggedIn) {
      return { label: "Rejoindre maintenant", href: "/user/register" };
    }
    if (isAdmin) {
      return { label: "Tableau de bord", href: "/admin" };
    }
    return { label: "Mon espace", href: "/dashboard" };
  })();

  return (
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden transition-colors duration-500 bg-primary">
        {usePhoto ? (
            // Owner-uploaded (Cloudinary) or a stock default (Unsplash) — both
            // are in next.config.ts's images.remotePatterns, so next/image can
            // optimize this instead of the raw <img> tag this used to be.
            <Image
                src={heroImageUrl!}
                alt={clubName}
                fill
                priority
                sizes="100vw"
                className="object-cover"
            />
        ) : (
            <HeroDumbbellScene isDark={isDark} />
        )}

        {/* Visual overlay filter */}
        <div className={`absolute inset-0 transition-colors duration-500 z-[1] pointer-events-none ${
            usePhoto
                ? isDark ? "bg-black/60" : "bg-black/35"
                : isDark ? "bg-black/40" : "bg-white/20"
        }`} />

        {/* Text content */}
        <div className="relative z-10 text-center container mx-auto px-4 pointer-events-none">
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-green-500">
            {heroTitle || clubName}
          </h1>

          <p className={`text-xl md:text-2xl mt-4 font-medium max-w-xl mx-auto ${usePhoto ? "text-white/85" : "text-secondary"}`}>
            {heroSubtitle || "L'excellence sportive dans un cadre d'exception"}
          </p>

          <Link
              href={ctaButton.href}
              className="mt-8 inline-block bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-8 py-3.5 rounded-full font-bold transition transform hover:scale-105 pointer-events-auto shadow-lg"
          >
            {ctaButton.label}
          </Link>
        </div>
      </section>
  );
}
