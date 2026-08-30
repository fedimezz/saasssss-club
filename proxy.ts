// proxy.ts — Next.js 16 Edge proxy (replaces middleware.ts)
//
// Responsibilities:
//   1. JWT auth guard — protects /admin, /dashboard, /api/admin, /api/dashboard.
//   2. Tenant slug injection — extracts subdomain from Host header and forwards
//      it as X-Club-Slug so every route handler can call
//      resolveTenantFromRequest() without re-parsing the host.
//   3. SUPER_ADMIN routing — redirects to /platform, never to a gym.
//   4. Owner-only page guards — /admin/promotions, /admin/roles, etc.
//
// What this does NOT do:
//   - DB calls (Edge Runtime can't use Prisma's Node.js engine). All tenant/
//     clubId DB verification happens in route handlers via lib/auth.ts's
//     requireX() functions — those are the real security boundary.

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { verifyOrigin } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";

// General write-rate-limit for authenticated API requests, applied centrally
// (Phase 10 — "rate-limit sur toutes les routes write") rather than added
// to each of the ~50 write handlers individually: one place to get right,
// can't be forgotten on a new route. Auth endpoints (login, register, etc.)
// keep their own tighter, per-IP limits inside their handlers — this is a
// coarser backstop for everything else, keyed by user id once a JWT is
// verified below.
const WRITE_LIMIT = 60;
const WRITE_WINDOW_MS = 60 * 1000;

const JWT_SECRET = process.env.JWT_SECRET;
const AUTH_COOKIE_NAME = "token";

interface MiddlewareJWTPayload {
  id: string;
  email: string;
  role: string;
  name: string;
  clubId: string | null;
}

function extractSlug(host: string): string | null {
  const hostname = host.split(":")[0].toLowerCase();
  const parts = hostname.split(".");
  // apex (2 labels) or bare localhost (1 label) → no tenant
  if (parts.length <= 2 || parts[0] === "www") return null;
  return parts[0];
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── CSRF — Origin check, every non-GET /api/* request ──────────────────────
  // Centralized here instead of duplicated in all ~50 write route handlers:
  // one place to get right, impossible to forget on a new route, and it runs
  // before any auth/DB work so a cross-site write is rejected as cheaply as
  // possible. See lib/csrf.ts for why this checks "same base domain or a
  // subdomain of it" rather than the continuation prompt's literal regex
  // (that regex assumes APP_URL already has a subdomain to strip, which
  // breaks for this app's apex-domain config and would reject every
  // legitimate per-club subdomain origin).
  if (
    pathname.startsWith("/api/") &&
    !["GET", "HEAD", "OPTIONS"].includes(request.method)
  ) {
    const csrfError = verifyOrigin(request);
    if (csrfError) return csrfError;
  }

  // ── Tenant slug — inject on every request ──────────────────────────────────
  const host = request.headers.get("host") ?? "";
  const slug = extractSlug(host);

  // Helper that returns a NextResponse.next() with the club slug header added.
  const nextWithSlug = (extraHeaders?: Record<string, string>) => {
    const headers = new Headers(request.headers);
    if (slug) headers.set("x-club-slug", slug);
    if (extraHeaders) {
      for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v);
    }
    return NextResponse.next({ request: { headers } });
  };

  // ── Static / auth / public routes — skip auth check ───────────────────────
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/settings/public") ||
    pathname.startsWith("/api/plans/public") ||
    pathname.startsWith("/api/coaches/public") ||
    pathname.startsWith("/api/content/public") ||
    pathname.startsWith("/api/payments/konnect/webhook") ||
    pathname.startsWith("/api/sse")
  ) {
    return nextWithSlug();
  }

  const isApiRoute = pathname.startsWith("/api/");
  const isPlatformPath =
    pathname.startsWith("/platform") || pathname.startsWith("/api/platform");
  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/dashboard") ||
    pathname.startsWith("/api/admin") ||
    isPlatformPath;

  // Public pages — no auth needed, still inject slug
  if (!isProtected) return nextWithSlug();

  // ── Auth check ─────────────────────────────────────────────────────────────
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    if (isApiRoute) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const loginUrl = new URL("/user/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!JWT_SECRET) {
    console.error("JWT_SECRET is not set; denying access in proxy.");
    if (isApiRoute) return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    return NextResponse.redirect(new URL("/user/login", request.url));
  }

  try {
    const secretKey = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secretKey);
    const typedPayload = payload as unknown as MiddlewareJWTPayload;
    const role = typedPayload.role?.toUpperCase();

    // General write-rate-limit backstop — see WRITE_LIMIT comment above.
    if (isApiRoute && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const rl = await checkRateLimit(
        `write:${typedPayload.id}`,
        WRITE_LIMIT,
        WRITE_WINDOW_MS
      ).catch(() => ({ allowed: true, remaining: 0, resetAt: 0 })); // fail open — Redis outage shouldn't take down every write
      if (!rl.allowed) {
        return NextResponse.json(
          { error: "Trop de requêtes, veuillez réessayer dans un instant." },
          { status: 429 }
        );
      }
    }

    // SUPER_ADMIN → platform only
    if (isPlatformPath) {
      if (role !== "SUPER_ADMIN") {
        if (isApiRoute) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
        return NextResponse.redirect(new URL("/user/login", request.url));
      }
      return nextWithSlug({ "x-user-id": typedPayload.id, "x-user-role": role });
    }

    if (role === "SUPER_ADMIN") {
      if (isApiRoute) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
      return NextResponse.redirect(new URL("/platform", request.url));
    }

    // Admin/owner guard
    const isAdminPath =
      pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
    if (isAdminPath && !["ADMIN", "OWNER"].includes(role)) {
      if (isApiRoute) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    // Owner-only UI pages
    const ownerOnlyPaths = ["/admin/stats", "/admin/promotions", "/admin/roles"];
    if (ownerOnlyPaths.some((p) => pathname.startsWith(p)) && role !== "OWNER") {
      if (isApiRoute)
        return NextResponse.json({ error: "Accès réservé au propriétaire" }, { status: 403 });
      return NextResponse.redirect(new URL("/admin", request.url));
    }

    return nextWithSlug({ "x-user-id": typedPayload.id, "x-user-role": role });
  } catch (err) {
    console.log("Token verification failed:", err);
    const response = isApiRoute
      ? NextResponse.json({ error: "Session invalide" }, { status: 401 })
      : NextResponse.redirect(new URL("/user/login", request.url));
    response.cookies.delete(AUTH_COOKIE_NAME);
    return response;
  }
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/platform/:path*",
    // Broad /api/:path* match is what makes the CSRF check above apply to
    // every write route platform-wide (auth, billing, onboarding, posts,
    // upload, bookings, ...) without listing each one individually. The
    // more specific /api/dashboard, /api/admin, /api/platform entries
    // below are now redundant with this but harmless to keep explicit.
    "/api/:path*",
    "/api/dashboard/:path*",
    "/api/admin/:path*",
    "/api/platform/:path*",
    // Also run on public routes to inject x-club-slug
    "/",
    "/activites/:path*",
    "/coaching/:path*",
    "/offres/:path*",
    "/actualites/:path*",
    "/(public)/:path*",
    "/api/settings/public",
    "/api/plans/public",
    "/api/coaches/public",
    "/api/content/public/:path*",
  ],
};
