// GET /api/platform/plans — SUPER_ADMIN only. Same SaasPlan rows as the
// public /api/saas-plans endpoint, plus subscriber counts per tier for
// the platform control dashboard.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé à la plateforme" }, { status: auth.status });

    const plans = await prisma.saasPlan.findMany({
      orderBy: { priceMonthly: "asc" },
      include: { _count: { select: { clubSubscriptions: true } } },
    });

    return NextResponse.json({
      plans: plans.map((p) => ({
        id: p.id,
        tier: p.tier,
        name: p.name,
        priceMonthly: p.priceMonthly,
        currency: p.currency,
        limits: p.limits,
        isActive: p.isActive,
        subscriberCount: p._count.clubSubscriptions,
      })),
    });
  } catch (error) {
    console.error("Platform plans GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
