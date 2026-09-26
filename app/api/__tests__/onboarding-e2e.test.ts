/**
 * Phase 11 — Onboarding E2E test
 * Full POST /api/onboarding/create-club flow.
 *
 * Run: npx vitest run app/api/__tests__/onboarding-e2e.test.ts
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 4, resetAt: 0 }),
  getClientIp:    vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@/lib/bcrypt", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed-pw"),
}));

// Keep generateToken real, mock buildAuthCookieOptions so it returns something benign
vi.mock("@/lib/auth", async (orig) => {
  const real = await orig<typeof import("@/lib/auth")>();
  return {
    ...real,
    buildAuthCookieOptions: vi.fn().mockReturnValue({ httpOnly: true, path: "/", secure: false }),
  };
});

const mockPlanFindFirst  = vi.fn();
const mockClubFindUnique = vi.fn();
const mockUserFindFirst  = vi.fn();
const mockTx             = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    saasPlan: { findFirst:  (...a: unknown[]) => mockPlanFindFirst(...a) },
    club:     { findUnique: (...a: unknown[]) => mockClubFindUnique(...a) },
    user:     { findFirst:  (...a: unknown[]) => mockUserFindFirst(...a) },
    $transaction: (...a: unknown[]) => mockTx(...a),
  },
}));

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-minimum-32-chars-xxxxxxxxx";
  process.env.APP_URL    = "https://yoursaas.test";
});

const VALID_PLAN  = { id: "plan-pro-id", tier: "PRO", isActive: true };
const NEW_CLUB    = { id: "new-club-id", slug: "my-gym", name: "My Gym" };
const NEW_OWNER   = { id: "new-owner-id", name: "Jean", email: "jean@my-gym.test", role: "OWNER", clubId: NEW_CLUB.id };

const VALID_BODY = {
  name: "Jean Dupont", email: "jean@my-gym.test", password: "Secure123!",
  clubName: "My Gym", slug: "my-gym", planId: VALID_PLAN.id,
};

function makeReq(body: unknown): NextRequest {
  return new NextRequest("https://yoursaas.test/api/onboarding/create-club", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTx.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      club:             { create: vi.fn().mockResolvedValue(NEW_CLUB) },
      user:             { create: vi.fn().mockResolvedValue(NEW_OWNER) },
      clubSubscription: { create: vi.fn().mockResolvedValue({}) },
      gymSettings:      { create: vi.fn().mockResolvedValue({}) },
    })
  );
});

describe("POST /api/onboarding/create-club", () => {
  it("creates club, sets JWT cookie, returns ok:true", async () => {
    mockPlanFindFirst.mockResolvedValue(VALID_PLAN);
    mockClubFindUnique.mockResolvedValue(null);
    mockUserFindFirst.mockResolvedValue(null);

    const { POST } = await import("@/app/api/onboarding/create-club/route");
    const res  = await POST(makeReq(VALID_BODY));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.club.slug).toBe("my-gym");
    expect(json.user.role).toBe("OWNER");
    // JWT cookie must be present
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("token=");
    // Transaction ran exactly once (atomic club+user+sub+settings)
    expect(mockTx).toHaveBeenCalledTimes(1);
  });

  it("409 when slug is already taken", async () => {
    mockPlanFindFirst.mockResolvedValue(VALID_PLAN);
    mockClubFindUnique.mockResolvedValue({ id: "existing-club" });
    mockUserFindFirst.mockResolvedValue(null);

    const { POST } = await import("@/app/api/onboarding/create-club/route");
    const res  = await POST(makeReq(VALID_BODY));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.field).toBe("slug");
    expect(mockTx).not.toHaveBeenCalled();
  });

  it("409 when email is already registered", async () => {
    mockPlanFindFirst.mockResolvedValue(VALID_PLAN);
    mockClubFindUnique.mockResolvedValue(null);
    mockUserFindFirst.mockResolvedValue({ id: "existing-user" });

    const { POST } = await import("@/app/api/onboarding/create-club/route");
    const res  = await POST(makeReq(VALID_BODY));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.field).toBe("email");
    expect(mockTx).not.toHaveBeenCalled();
  });

  it("400 when planId is invalid / inactive", async () => {
    mockPlanFindFirst.mockResolvedValue(null);
    mockClubFindUnique.mockResolvedValue(null);
    mockUserFindFirst.mockResolvedValue(null);

    const { POST } = await import("@/app/api/onboarding/create-club/route");
    const res  = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(400);
  });

  it("400 when slug contains uppercase letters", async () => {
    const { POST } = await import("@/app/api/onboarding/create-club/route");
    const res = await POST(makeReq({ ...VALID_BODY, slug: "My-Gym" }));
    expect(res.status).toBe(400);
  });

  it("400 when slug starts with a hyphen", async () => {
    const { POST } = await import("@/app/api/onboarding/create-club/route");
    const res = await POST(makeReq({ ...VALID_BODY, slug: "-mygym" }));
    expect(res.status).toBe(400);
  });

  it("400 when password is too short", async () => {
    const { POST } = await import("@/app/api/onboarding/create-club/route");
    const res = await POST(makeReq({ ...VALID_BODY, password: "short" }));
    expect(res.status).toBe(400);
  });

  it("429 when rate limit is exceeded", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit");
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 3600000 });

    const { POST } = await import("@/app/api/onboarding/create-club/route");
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(429);
  });
});
