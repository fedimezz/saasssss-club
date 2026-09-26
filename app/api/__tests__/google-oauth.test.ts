/**
 * Google OAuth crosses a domain boundary: the flow starts on a club's own
 * subdomain but Google's fixed redirect_uri always lands on the apex. These
 * tests prove the club survives that round trip and the user lands back on
 * their OWN club, not the apex.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const CLUB = { id: "club-abc", slug: "club-a", name: "Club A", status: "ACTIVE" as const };

const clubFindUnique = vi.fn();
const userFindFirst = vi.fn();
const userUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  default: {
    club: { findUnique: (...a: unknown[]) => clubFindUnique(...a) },
    user: {
      findFirst: (...a: unknown[]) => userFindFirst(...a),
      update: (...a: unknown[]) => userUpdate(...a),
    },
    $transaction: vi.fn(),
  },
}));

const originalFetch = global.fetch;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = "test-secret-minimum-32-chars-xxxxxxxxx";
  process.env.GOOGLE_CLIENT_ID = "gid";
  process.env.GOOGLE_CLIENT_SECRET = "gsecret";
  process.env.APP_URL = "https://yoursaas.test";
  process.env.NEXT_PUBLIC_APP_URL = "https://yoursaas.test";
  clubFindUnique.mockResolvedValue(CLUB);
  global.fetch = vi.fn(async (url: string | URL) => {
    const u = String(url);
    if (u.includes("oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
    }
    if (u.includes("googleapis.com/oauth2/v3/userinfo")) {
      return new Response(
        JSON.stringify({ sub: "g-1", email: "m@club-a.test", email_verified: true, name: "M" }),
        { status: 200 }
      );
    }
    throw new Error("unexpected fetch " + u);
  }) as typeof fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllEnvs();
});

describe("GET /api/auth/google (initiation)", () => {
  it("encodes the club id into `state`, refusing to start with no usable tenant", async () => {
    const { GET } = await import("@/app/api/auth/google/route");
    const res = await GET(
      new NextRequest("https://club-a.yoursaas.test/api/auth/google", { headers: { host: "club-a.yoursaas.test" } })
    );
    const location = res.headers.get("location")!;
    const state = new URL(location).searchParams.get("state")!;
    expect(state).toMatch(new RegExp(`^[0-9a-f]{32}\\.${CLUB.id}$`));

    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toContain(`google_oauth_state=${state}`);
    expect(cookie).toContain("Domain=.yoursaas.test"); // apex-wide, not the tenant subdomain
  });

  it("404s on a host with no club (e.g. the apex itself)", async () => {
    clubFindUnique.mockResolvedValue(null);
    const { GET } = await import("@/app/api/auth/google/route");
    const res = await GET(new NextRequest("https://yoursaas.test/api/auth/google", { headers: { host: "yoursaas.test" } }));
    expect(res.status).toBe(404);
  });
});

describe("GET /api/auth/callback/google", () => {
  const csrf = "a".repeat(32);
  const state = `${csrf}.${CLUB.id}`;

  function callbackReq(overrides: { state?: string; cookie?: string } = {}) {
    const url = `https://yoursaas.test/api/auth/callback/google?code=abc&state=${encodeURIComponent(overrides.state ?? state)}`;
    return new NextRequest(url, {
      headers: { host: "yoursaas.test", cookie: `google_oauth_state=${overrides.cookie ?? state}` },
    });
  }
  async function call(req: NextRequest) {
    const { GET } = await import("@/app/api/auth/callback/google/route");
    return GET(req);
  }
  const location = (r: Response) => r.headers.get("location") ?? "";

  it("resolves the tenant from `state`, NOT from the (apex) Host header", async () => {
    vi.stubEnv("NODE_ENV", "production");
    userFindFirst.mockResolvedValue({
      id: "u1", email: "m@club-a.test", role: "MEMBER", clubId: CLUB.id, isActive: true,
      googleId: "g-1", emailVerified: new Date(), name: "M",
    });
    const res = await call(callbackReq());

    expect(clubFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: CLUB.id } }));
    // Final redirect lands on the CLUB's own host, never the apex.
    expect(location(res)).toMatch(/^https:\/\/club-a\.yoursaas\.test\//);
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith("token="));
    expect(cookie).toContain("Domain=.club-a.yoursaas.test");
  });

  it("rejects a tampered clubId suffix (state no longer matches the cookie)", async () => {
    const res = await call(callbackReq({ state: `${csrf}.some-other-club`, cookie: state }));
    expect(location(res)).toContain("google_state_mismatch");
    expect(clubFindUnique).not.toHaveBeenCalled();
  });

  it("a club that no longer exists / isn't usable: sent to the apex login (nowhere else to send them)", async () => {
    // Distinct id: resolveClubById caches by id, and CLUB.id was already
    // cached as "found" by an earlier test in this file.
    clubFindUnique.mockResolvedValue(null);
    const missingId = "club-does-not-exist";
    const res = await call(callbackReq({ state: `${csrf}.${missingId}`, cookie: `${csrf}.${missingId}` }));
    expect(location(res)).toBe("https://yoursaas.test/user/login?error=club_unavailable");
  });

  it("clears the state cookie with the SAME apex-wide Domain it was set with", async () => {
    userFindFirst.mockResolvedValue({
      id: "u1", email: "m@club-a.test", role: "MEMBER", clubId: CLUB.id, isActive: true,
      googleId: "g-1", emailVerified: new Date(), name: "M",
    });
    const res = await call(callbackReq());
    const cleared = res.headers.getSetCookie().find((c) => c.startsWith("google_oauth_state=;"));
    expect(cleared).toContain("Domain=.yoursaas.test");
    expect(cleared).toContain("Max-Age=0");
  });
});
