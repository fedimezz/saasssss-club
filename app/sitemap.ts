import type { MetadataRoute } from "next";

// Static shell only: this app is multi-tenant per-subdomain content
// generated from each club's own pages/settings, which isn't something a
// single host-less sitemap route can enumerate. A per-tenant sitemap would
// need its own route that resolves the tenant from the request Host header.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://example.com";
  return [{ url: base, lastModified: new Date(), changeFrequency: "weekly", priority: 1 }];
}
