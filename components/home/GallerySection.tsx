"use client";

import Image from "next/image";
import Link from "next/link";
import { useEditableContent } from "@/hooks/useEditableContent";

export default function GallerySection() {
  // Home-page photos are no longer editable: this preview only reuses the
  // photos the owner chose for the Gallery page (nothing is shown until they
  // add some, and never a stock/other club's picture).
  const { list, loading } = useEditableContent("gallery");
  const images = [
    ...list("galleryFitness", []),
    ...list("galleryPadel", []),
    ...list("galleryPool", []),
  ].slice(0, 6);

  // Still loading, or the club hasn't uploaded any gallery photos yet — don't
  // show broken/placeholder images, just skip the section.
  if (loading || images.length === 0) return null;

  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center">
          <h2 className="text-5xl font-bold">
            Le Club In Pictures
          </h2>

          <p className="mt-4 text-gray-500">
            Discover our facilities and atmosphere.
          </p>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {images.map((image) => (
            <div
              key={image}
              className="group relative h-[320px] overflow-hidden rounded-3xl"
            >
              <Image
                src={image}
                alt="Gallery"
                fill
                className="
                  object-cover
                  transition
                  duration-700
                  group-hover:scale-110
                "
              />
            </div>
          ))}
          <div className="mt-12 text-center">
  <Link
    href="/gallery"
    className="
      inline-flex
      rounded-xl
      bg-[#0E4B73]
      px-8
      py-4
      text-white
      font-semibold
      transition
      hover:scale-105
    "
  >
    View Full Gallery
  </Link>
</div>
        </div>
      </div>
    </section>
  );
}