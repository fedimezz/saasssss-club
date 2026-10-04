// GET /api/clubs/search?q=...
//
// Public, unauthenticated, by design: the mobile app has no Host-header
// tenant context yet (unlike the web app, which gets its tenant from the
// subdomain the browser is already on) — this is how it finds one, before
// any login happens. Returns just enough to let the app point itself at
// that club's API host (`https://{slug}.<APP_URL host>` or, if set,
// `https://{customDomain}`) and nothing an operator would consider private.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { buildTenantOrigin } from "@/lib/tenant-url";

const MAX_RESULTS = 10;

// CORS: this route is hit cross-origin by the mobile app's web preview
// (Expo web on localhost:8081, and eventually any browser client) — native
// iOS/Android fetch isn't subject to CORS at all, but a browser preflights
// any request carrying Content-Type: application/json with OPTIONS first.
// Without this, Next.js 405s the preflight and the browser blocks the real
// GET before it reaches this handler. Safe to allow any origin: public,
// unauthenticated, no cookies involved.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-client-type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  // No auth on this endpoint at all, so the only real abuse control is rate
  // limiting — generous enough for a real user searching, tight enough that
  // scraping the whole club list back-to-back isn't practical.
  const rl = await checkRateLimit(`club-search:${getClientIp(request)}`, 30, 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429, headers: CORS_HEADERS });
  }

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ clubs: [] }, { headers: CORS_HEADERS });
  }

  const clubs = await prisma.club.findMany({
    where: {
      name: { contains: q, mode: "insensitive" },
      status: { in: ["TRIAL", "ACTIVE"] }, // never surface a suspended/cancelled club
    },
    select: {
      slug: true,
      name: true,
      customDomain: true,
      settings: { select: { logoUrl: true } },
    },
    take: MAX_RESULTS,
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
      {
        clubs: clubs.map((c) => ({
          slug: c.slug,
          name: c.name,
          logoUrl: c.settings?.logoUrl ?? null,
          apiBaseUrl: buildTenantOrigin(c),
        })),
      },
      { headers: CORS_HEADERS }
  );
}