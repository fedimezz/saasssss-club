// src/lib/tenant.ts
//
// Resolves "which gym is this request for" from server-side signals only —
// the request's Host header (subdomain) in production, with a couple of
// explicit, production-disabled dev conveniences. NEVER from a client-
// supplied clubId in a request body/query/header in production: that would
// let any authenticated user simply claim to belong to a different gym.
//
// Architecture: gym-a.yoursaas.com -> slug "gym-a". The apex domain
// (yoursaas.com) and "www" resolve to no tenant at all — that's the
// platform marketing site / SUPER_ADMIN area, not any one gym's site.
import prisma from "@/lib/prisma";
import type { ClubStatus } from "@prisma/client";

export interface TenantClub {
  id: string;
  slug: string;
  name: string;
  status: ClubStatus;
}

// Slug -> Club cache, short TTL. Tenant resolution runs on essentially every
// request (every page load, every API call), so this avoids a DB round trip
// per request without reaching for Redis for something this cheap and this
// tolerant of a few seconds of staleness. Trade-off: a just-suspended gym
// can keep serving requests for up to TTL_MS after suspension — acceptable
// for a first pass, but worth knowing about; if that gap ever matters,
// lib/admin's suspend action should call invalidateClubCache(slug) itself
// (wired in Phase 7 alongside the actual suspend/reactivate endpoint).
const cache = new Map<string, { club: TenantClub | null; expiresAt: number }>();
const TTL_MS = 30_000;

function extractSlugFromHost(host: string): string | null {
  const hostname = host.split(":")[0].toLowerCase();
  const parts = hostname.split(".");
  // "yoursaas.com" (2 labels) or a bare "localhost" (1 label) -> no tenant.
  if (parts.length <= 2) return null;
  if (parts[0] === "www") return null;
  return parts[0];
}

export async function resolveClubBySlug(slug: string): Promise<TenantClub | null> {
  const now = Date.now();
  const cached = cache.get(slug);
  if (cached && cached.expiresAt > now) return cached.club;

  const club = await prisma.club.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, status: true },
  });
  cache.set(slug, { club, expiresAt: now + TTL_MS });
  return club;
}

export function invalidateClubCache(slug: string): void {
  cache.delete(slug);
}

/**
 * Resolves the tenant for an incoming Request. This is the single function
 * every auth check and every server component should call — do not
 * re-implement hostname parsing elsewhere.
 */
export async function resolveTenantFromRequest(request: Request): Promise<TenantClub | null> {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;

  // Dev/test convenience ONLY: an explicit x-club-slug header or ?club=
  // query param lets you exercise multi-tenant behavior on localhost
  // without wildcard DNS/hosts-file setup. Both are completely ignored
  // outside development, so they can never be used to spoof a tenant
  // against a real deployment.
  if (process.env.NODE_ENV !== "production") {
    const headerSlug = request.headers.get("x-club-slug");
    const querySlug = url.searchParams.get("club");
    const devSlug = headerSlug || querySlug || process.env.DEV_DEFAULT_CLUB_SLUG;
    if (devSlug) return resolveClubBySlug(devSlug);
  }

  const slug = extractSlugFromHost(host);
  if (!slug) return null; // apex/platform host — intentionally no tenant
  return resolveClubBySlug(slug);
}

export function isClubUsable(club: TenantClub | null): club is TenantClub {
  return !!club && (club.status === "ACTIVE" || club.status === "TRIAL");
}
