"use client";

import { useEditableContent } from "@/hooks/useEditableContent";
import { useClubSettings } from "@/context/ClubSettingsContext";

// Empty by default: shown only when the owner wrote a title/text (wizard →
// "Accueil") or filled the club description. No made-up figures, no stock copy.
export default function ClubIntro() {
  const { t, loading } = useEditableContent("home");
  const { description } = useClubSettings();

  const title = t("introTitle", "").trim();
  const text = t("introText", description || "").trim();

  if (loading || (!title && !text)) return null;

  return (
    <section className="bg-[#0E4B73] py-20 text-white">
      <div className="mx-auto max-w-7xl px-6 text-center">
        {title && <h2 className="text-4xl md:text-5xl font-bold">{title}</h2>}
        {text && <p className="mt-6 text-lg text-white/80 max-w-3xl mx-auto">{text}</p>}
      </div>
    </section>
  );
}
