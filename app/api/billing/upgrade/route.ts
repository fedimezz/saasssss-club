// src/app/api/billing/upgrade/route.ts
//
// POST /api/billing/upgrade { planId }
// requireOwner — verifies planId is an active SaasPlan in DB (never trusts
// a client-provided tier name), moves the club's ClubSubscription onto it,
// and logs the action. No payment provider is wired up yet (see schema
// comment on ClubSubscription.providerCustomerId/providerSubscriptionId —
// "no provider assumed here per spec"), so this only updates plan/status;
// it does not charge anything.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { logAction } from "@/lib/activity-log";
import { getFullUsage } from "@/lib/plan-limits";
import { verifyOrigin } from "@/lib/csrf";
import { z } from "zod";
import { formatZodError } from "@/lib/validation";

const upgradeSchema = z.object({
  planId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const csrfError = verifyOrigin(request);
    if (csrfError) return csrfError;

    const auth = await requireOwner(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    const owner = auth.user;
    if (!owner.clubId) {
      return NextResponse.json({ error: "Aucun club associé" }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const parsed = upgradeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { planId } = parsed.data;

    const plan = await prisma.saasPlan.findFirst({
      where: { id: planId, isActive: true },
    });
    if (!plan) {
      return NextResponse.json({ error: "Plan introuvable ou inactif" }, { status: 404 });
    }

    const currentSub = await prisma.clubSubscription.findUnique({
      where: { clubId: owner.clubId },
      include: { plan: true },
    });
    if (!currentSub) {
      return NextResponse.json({ error: "Aucun abonnement trouvé pour ce club" }, { status: 404 });
    }
    if (currentSub.planId === plan.id) {
      return NextResponse.json({ error: "Vous êtes déjà sur ce plan" }, { status: 400 });
    }

    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const sub = await tx.clubSubscription.update({
        where: { clubId: owner.clubId! },
        data: {
          planId: plan.id,
          status: "ACTIVE",
          currentPeriodStart: now,
          trialEndsAt: null,
        },
        include: { plan: true },
      });
      // A club moving off TRIAL to a paid plan is no longer "on trial" —
      // reflect that on the Club record too.
      await tx.club.updateMany({
        where: { id: owner.clubId!, status: "TRIAL" },
        data: { status: "ACTIVE" },
      });
      return sub;
    });

    await logAction(request, {
      actorId: owner.id,
      actorName: owner.name,
      actorRole: owner.role,
      action: "PLAN_CHANGED",
      category: "SUBSCRIPTION",
      targetId: owner.clubId,
      detail: { fromPlan: currentSub.plan.tier, toPlan: plan.tier },
    });

    const usage = await getFullUsage(owner.clubId);

    return NextResponse.json({
      subscription: {
        status: updated.status,
        plan: { id: plan.id, tier: plan.tier, name: plan.name, priceMonthly: plan.priceMonthly, limits: plan.limits },
      },
      usage: usage.usage,
    });
  } catch (error) {
    console.error("Billing upgrade error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
