// GET /api/platform/overview — SUPER_ADMIN only, cross-tenant platform
// stats (never scoped by clubId — this is the one place in the codebase
// that's intentionally allowed to aggregate across every gym).

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé à la plateforme" }, { status: auth.status });

    const [
      totalClubs, trialClubs, activeClubs, suspendedClubs, cancelledClubs,
      totalMembers, activeSubs, recentClubs,
    ] = await Promise.all([
      prisma.club.count(),
      prisma.club.count({ where: { status: "TRIAL" } }),
      prisma.club.count({ where: { status: "ACTIVE" } }),
      prisma.club.count({ where: { status: "SUSPENDED" } }),
      prisma.club.count({ where: { status: "CANCELLED" } }),
      prisma.user.count({ where: { role: "MEMBER" } }),
      prisma.clubSubscription.findMany({
        where: { status: "ACTIVE" },
        select: { plan: { select: { priceMonthly: true } } },
      }),
      prisma.club.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, name: true, slug: true, status: true, createdAt: true },
      }),
    ]);

    // MRR — sum of priceMonthly across every club currently on an ACTIVE
    // (paid, non-trial) subscription. Trialing clubs contribute $0, which
    // is correct: they aren't paying yet.
    const mrr = activeSubs.reduce((sum, s) => sum + s.plan.priceMonthly, 0);

    const trialEndingSoon = await prisma.club.count({
      where: {
        status: "TRIAL",
        trialEndsAt: { gte: new Date(), lte: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) },
      },
    });

    return NextResponse.json({
      clubs: { total: totalClubs, trial: trialClubs, active: activeClubs, suspended: suspendedClubs, cancelled: cancelledClubs },
      mrr,
      totalMembers,
      trialEndingSoon,
      recentClubs,
    });
  } catch (error) {
    console.error("Platform overview GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
