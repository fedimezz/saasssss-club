/**
 * Konnect webhook — idempotency + verification tests.
 *
 * Proves: the webhook never double-activates, never calls Konnect for a ref
 * that isn't in OUR database, refuses a payment whose amount/orderId don't
 * match our record, and returns the payer to the CLUB's own host.
 *
 * Run: npx vitest run app/api/__tests__/webhook-idempotency.test.ts
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const REF     = "konnect-ref-abc-123";
const CLUB_ID = "club-a-id";

const PAYMENT_PENDING = {
  id: "pay-1", status: "PENDING", clubId: CLUB_ID, amount: 8,
  subscriptionId: "sub-1", transactionId: REF,
  subscription: { id: "sub-1", status: "PENDING", clubId: CLUB_ID },
};
const PAYMENT_PAID = { ...PAYMENT_PENDING, status: "PAID" };

const mockPaymentFindFirst = vi.fn();
const mockClubFindUnique = vi.fn();
const mockTxPaymentUpdateMany = vi.fn();
const mockTxSubUpdate = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    payment: { findFirst: (...a: unknown[]) => mockPaymentFindFirst(...a) },
    club: { findUnique: (...a: unknown[]) => mockClubFindUnique(...a) },
    $transaction: (...a: unknown[]) => mockTransaction(...a),
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 10, resetAt: 0 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

const mockGetDetails = vi.fn();
vi.mock("@/lib/payments/konnect", async (orig) => {
  const real = await orig<typeof import("@/lib/payments/konnect")>();
  return { ...real, getKonnectPaymentDetails: (...a: unknown[]) => mockGetDetails(...a) };
});

beforeAll(() => {
  process.env.APP_URL = "https://yoursaas.test";
  (process.env as Record<string, string>).NODE_ENV = "production";
});

beforeEach(() => {
  vi.clearAllMocks();
  mockClubFindUnique.mockResolvedValue({ slug: "gym-a", customDomain: null });
  mockGetDetails.mockResolvedValue({ status: "completed", amount: 8000, reachedAmount: 8000, orderId: "pay-1" });
  mockTxPaymentUpdateMany.mockResolvedValue({ count: 1 });
  mockTxSubUpdate.mockResolvedValue({});
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      payment: { updateMany: mockTxPaymentUpdateMany },
      subscription: { update: mockTxSubUpdate },
    })
  );
});

function makeReq(ref: string): NextRequest {
  return new NextRequest(`https://yoursaas.test/api/payments/konnect/webhook?payment_ref=${encodeURIComponent(ref)}`);
}
async function call(ref: string) {
  const { GET } = await import("@/app/api/payments/konnect/webhook/route");
  return GET(makeReq(ref));
}

describe("Konnect webhook", () => {
  it("PENDING → PAID: claims the payment once, activates, redirects to the CLUB host", async () => {
    mockPaymentFindFirst.mockResolvedValue(PAYMENT_PENDING);
    const res = await call(REF);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://gym-a.yoursaas.test/dashboard/membership?payment=success");
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockTxPaymentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "pay-1", clubId: CLUB_ID, status: { not: "PAID" } }) })
    );
    expect(mockTxSubUpdate).toHaveBeenCalledTimes(1);
  });

  it("already PAID: no Konnect call, zero writes, still success", async () => {
    mockPaymentFindFirst.mockResolvedValue(PAYMENT_PAID);
    const res = await call(REF);

    expect(res.headers.get("location")).toContain("payment=success");
    expect(mockGetDetails).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("lost the race (another call already claimed it): no double activation", async () => {
    mockPaymentFindFirst.mockResolvedValue(PAYMENT_PENDING);
    mockTxPaymentUpdateMany.mockResolvedValue({ count: 0 });
    const res = await call(REF);

    expect(res.headers.get("location")).toContain("payment=success");
    expect(mockTxSubUpdate).not.toHaveBeenCalled();
  });

  it("unknown ref: Konnect is NOT called, redirects to error", async () => {
    mockPaymentFindFirst.mockResolvedValue(null);
    const res = await call("unknown-ref-xxx");

    expect(res.headers.get("location")).toContain("payment=error");
    expect(mockGetDetails).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("malformed ref (path traversal attempt): rejected before any lookup", async () => {
    const res = await call("../../admin/secret");

    expect(res.headers.get("location")).toContain("payment=error");
    expect(mockPaymentFindFirst).not.toHaveBeenCalled();
    expect(mockGetDetails).not.toHaveBeenCalled();
  });

  it("amount that doesn't match OUR record: refused, nothing activated", async () => {
    mockPaymentFindFirst.mockResolvedValue(PAYMENT_PENDING); // we expect 8 TND = 8000 millimes
    mockGetDetails.mockResolvedValue({ status: "completed", amount: 1000, reachedAmount: 1000, orderId: "pay-1" });
    const res = await call(REF);

    expect(res.headers.get("location")).toContain("payment=error");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("orderId belonging to a different payment: refused", async () => {
    mockPaymentFindFirst.mockResolvedValue(PAYMENT_PENDING);
    mockGetDetails.mockResolvedValue({ status: "completed", amount: 8000, reachedAmount: 8000, orderId: "someone-elses-payment" });
    const res = await call(REF);

    expect(res.headers.get("location")).toContain("payment=error");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("failed payment: FAILED + CANCELLED, redirects to failed", async () => {
    mockPaymentFindFirst.mockResolvedValue(PAYMENT_PENDING);
    mockGetDetails.mockResolvedValue({ status: "failed", amount: 8000, reachedAmount: 0, orderId: "pay-1" });
    const res = await call(REF);

    expect(res.headers.get("location")).toContain("payment=failed");
    expect(mockTxSubUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "CANCELLED" } })
    );
  });

  it("a club with a custom domain is sent back to its own domain", async () => {
    mockPaymentFindFirst.mockResolvedValue(PAYMENT_PENDING);
    mockClubFindUnique.mockResolvedValue({ slug: "gym-a", customDomain: "gym.example.com" });
    const res = await call(REF);

    expect(res.headers.get("location")).toBe("https://gym.example.com/dashboard/membership?payment=success");
  });
});
