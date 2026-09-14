/**
 * Phase 11 — Webhook idempotency test
 *
 * Proves that calling the Konnect webhook twice with the same payment_ref
 * does NOT double-activate the subscription.
 *
 * Run: npx vitest run app/api/__tests__/webhook-idempotency.test.ts
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const REF     = "konnect-ref-abc-123";
const CLUB_ID = "club-a-id";

const PAYMENT_PENDING = {
  id: "pay-1", status: "PENDING", clubId: CLUB_ID,
  subscriptionId: "sub-1", transactionId: REF,
  subscription: { id: "sub-1", status: "PENDING", clubId: CLUB_ID },
};
const PAYMENT_PAID = { ...PAYMENT_PENDING, status: "PAID" };

const mockPayment = { findFirst: vi.fn() };
const mockSub     = { update: vi.fn() };
const mockTx      = vi.fn();
const mockPayUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    payment:      { ...mockPayment, update: mockPayUpdate },
    subscription: mockSub,
    $transaction: (...a: unknown[]) => mockTx(...a),
  },
}));

vi.mock("@/lib/payments/konnect", () => ({
  getKonnectPaymentDetails: vi.fn().mockResolvedValue({
    status: "completed", amount: 8000, reachedAmount: 8000,
  }),
}));

beforeAll(() => { process.env.APP_URL = "https://yoursaas.test"; });
beforeEach(() => {
  vi.clearAllMocks();
  // Default tx: execute each item in the array
  mockTx.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
  mockPayUpdate.mockResolvedValue({ ...PAYMENT_PAID });
  mockSub.update.mockResolvedValue({});
});

function makeReq(ref: string): NextRequest {
  return new NextRequest(`https://yoursaas.test/api/payments/konnect/webhook?payment_ref=${ref}`);
}

describe("Konnect webhook idempotency", () => {
  it("first call (PENDING → PAID): runs transaction + redirects to success", async () => {
    mockPayment.findFirst.mockResolvedValue(PAYMENT_PENDING);

    const { GET } = await import("@/app/api/payments/konnect/webhook/route");
    const res = await GET(makeReq(REF));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("payment=success");
    // Transaction ran exactly once
    expect(mockTx).toHaveBeenCalledTimes(1);
  });

  it("second call (already PAID): zero DB writes, still redirects to success", async () => {
    mockPayment.findFirst.mockResolvedValue(PAYMENT_PAID); // idempotency guard fires

    const { GET } = await import("@/app/api/payments/konnect/webhook/route");
    const res = await GET(makeReq(REF));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("payment=success");
    // No writes
    expect(mockTx).not.toHaveBeenCalled();
    expect(mockPayUpdate).not.toHaveBeenCalled();
    expect(mockSub.update).not.toHaveBeenCalled();
  });

  it("unknown ref: no DB writes, redirects to error", async () => {
    mockPayment.findFirst.mockResolvedValue(null);

    const { GET } = await import("@/app/api/payments/konnect/webhook/route");
    const res = await GET(makeReq("unknown-ref-xxx"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("payment=error");
    expect(mockTx).not.toHaveBeenCalled();
  });

  it("failed payment: updates to FAILED + CANCELLED, redirects to failed", async () => {
    const { getKonnectPaymentDetails } = await import("@/lib/payments/konnect");
    vi.mocked(getKonnectPaymentDetails).mockResolvedValueOnce({
      status: "failed", amount: 8000, reachedAmount: 0,
    } as Awaited<ReturnType<typeof getKonnectPaymentDetails>>);
    mockPayment.findFirst.mockResolvedValue(PAYMENT_PENDING);

    const { GET } = await import("@/app/api/payments/konnect/webhook/route");
    const res = await GET(makeReq(REF));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("payment=failed");
    expect(mockTx).toHaveBeenCalledTimes(1);
  });
});
