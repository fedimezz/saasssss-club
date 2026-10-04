import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getKonnectPaymentDetails, isValidPaymentRef } from "@/lib/payments/konnect";
import { buildTenantOrigin } from "@/lib/tenant-url";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// GET /api/payments/konnect/webhook?payment_ref=xxxx
//
// Konnect calls this URL (as a browser redirect, since we don't use
// silentWebhook) once the payer finishes on the gateway page. Per Konnect's
// docs we must NOT trust the redirect itself — we re-fetch the payment
// status server-side via Get Payment Details before touching the DB.
//
// Order of operations matters because this endpoint is public:
//   1. shape-check the ref                       (no injection into a URL path)
//   2. look the ref up in OUR database           (anonymous refs never reach Konnect)
//   3. ask Konnect for the real status
//   4. compare amount + orderId with OUR record  (a valid-but-different payment
//                                                 can't activate someone else's)
//   5. flip PENDING -> PAID exactly once         (atomic claim, safe under retries)
// and the payer is sent back to the CLUB's own host, not the apex.
export async function GET(request: NextRequest) {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const paymentRef = request.nextUrl.searchParams.get("payment_ref");

  const rl = await checkRateLimit(`konnect-webhook:${getClientIp(request)}`, 60, 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
  }

  const apexRedirect = (status: string) =>
    NextResponse.redirect(`${appUrl}/dashboard/membership?payment=${status}`);

  if (!paymentRef || !isValidPaymentRef(paymentRef)) {
    return apexRedirect("error");
  }

  try {
    const payment = await prisma.payment.findFirst({
      where: { transactionId: paymentRef },
      include: { subscription: true },
    });

    if (!payment) {
      console.error("Konnect webhook: no payment found for ref", paymentRef);
      return apexRedirect("error");
    }

    // clubId comes from the DB record — never trust the client.
    const clubId = payment.clubId;

    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: { slug: true, customDomain: true },
    });
    const backTo = (status: string) => {
      const origin = club ? buildTenantOrigin(club, appUrl) : appUrl;
      return NextResponse.redirect(`${origin}/dashboard/membership?payment=${status}`);
    };

    // Payment already processed (webhook can be called more than once) —
    // don't double-activate / double-extend anything.
    if (payment.status === "PAID") return backTo("success");

    const details = await getKonnectPaymentDetails(paymentRef);

    // Konnect amounts are in millimes (lib/payments/konnect.ts sends TND*1000).
    // The payment must be for THIS record, for THIS amount.
    const expectedAmount = Math.round(payment.amount * 1000);
    const orderMatches = !details.orderId || details.orderId === payment.id;
    if (details.amount !== expectedAmount || !orderMatches) {
      console.error("Konnect webhook: payment does not match our record", {
        paymentId: payment.id,
        expectedAmount,
        gotAmount: details.amount,
        orderMatches,
      });
      return backTo("error");
    }

    if (details.status === "completed" && details.reachedAmount >= details.amount) {
      const activated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Atomic claim: only ONE concurrent webhook call flips PENDING -> PAID.
        const claimed = await tx.payment.updateMany({
          where: { id: payment.id, clubId, status: { not: "PAID" } },
          data: { status: "PAID", paidAt: new Date() },
        });
        if (claimed.count === 0) return false;
        await tx.subscription.update({
          where: { id: payment.subscriptionId, clubId },
          data: { status: "ACTIVE" },
        });
        return true;
      });
      void activated; // either way the payer sees success: the payment IS paid
      return backTo("success");
    }

    if (details.status === "failed") {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const claimed = await tx.payment.updateMany({
          where: { id: payment.id, clubId, status: "PENDING" },
          data: { status: "FAILED" },
        });
        if (claimed.count === 0) return;
        await tx.subscription.update({
          where: { id: payment.subscriptionId, clubId },
          data: { status: "CANCELLED" },
        });
      });
      return backTo("failed");
    }

    // Still pending (e.g. payer closed the tab mid-flow) — leave as is,
    // the user can resume from the membership page.
    return backTo("pending");
  } catch (error) {
    console.error("Konnect webhook error:", error);
    return apexRedirect("error");
  }
}
