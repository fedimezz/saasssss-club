// lib/tenant-url.ts — where does a given club live?
//
// Links that leave the server (password-reset emails, payment return URLs)
// must point at the CLUB's own host, because every tenant-scoped handler
// resolves the tenant from the Host header. A link built from the apex
// APP_URL lands on a host with no tenant, so the confirm step finds no user.
//
// Deliberately built from the tenant record + APP_URL, never from the
// incoming Host header, so a forged Host can't poison an emailed link.
interface ClubLocation {
  slug: string;
  customDomain?: string | null;
}

function platformBase(): URL | null {
  const raw = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/** Hostname of the platform apex (no "www."), or null if APP_URL isn't set. */
export function platformHostname(): string | null {
  const base = platformBase();
  return base ? base.hostname.toLowerCase().replace(/^www\./, "") : null;
}

/**
 * Origin (scheme + host [+ port]) of a club.
 *   custom domain  → https://gym.example.com
 *   subdomain      → https://club-a.yoursaas.com
 * `devFallbackOrigin` is returned outside production so local dev keeps using
 * whatever origin the developer is actually on (see lib/tenant.ts dev hooks).
 */
export function buildTenantOrigin(club: ClubLocation, devFallbackOrigin?: string): string {
  if (process.env.NODE_ENV !== "production" && devFallbackOrigin) return devFallbackOrigin;

  if (club.customDomain) return `https://${club.customDomain}`;

  const base = platformBase() ?? new URL("http://localhost:3000");
  const host = base.hostname.toLowerCase().replace(/^www\./, "");
  const port = base.port ? `:${base.port}` : "";
  return `${base.protocol}//${club.slug}.${host}${port}`;
}

/** True when `host` is the platform apex itself (or its www alias). */
export function isPlatformHost(host: string): boolean {
  const apex = platformHostname();
  if (!apex) return false;
  const hostname = host.split(":")[0].toLowerCase();
  return hostname === apex || hostname === `www.${apex}`;
}
