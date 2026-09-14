// GET  /api/platform/clubs/[id]   — SUPER_ADMIN only, one club's full detail
// PATCH /api/platform/clubs/[id]  — { action: "suspend" | "activate" | "change_plan", planId?, reason? }

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth";
import { logAction } from "@/lib/activity-log";
import { verifyOrigin } from "@/lib/csrf";
import { z } from "zod";
import { formatZodError } from "@/lib/validation";

const actionSchema = z.object({
  action: z.enum(["suspend", "activate", "change_plan"]),
  reason: z.string().max(500).optional(),
  planId: z.string().min(1).optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé à la plateforme" }, { status: auth.status });

    const { id } = await params;
    const club = await prisma.club.findUnique({
      where: { id },
      include: {
        subscription: { include: { plan: true } },
        settings: { select: { name: true, logoUrl: true } },
        _count: { select: { users: true, sessions: true, payments: true } },
        users: {
          where: { role: "OWNER" },
          select: { id: true, name: true, email: true, createdAt: true },
          take: 1,
        },
      },
    });
    if (!club) return NextResponse.json({ error: "Club introuvable" }, { status: 404 });

    return NextResponse.json({ club });
  } catch (error) {
    console.error("Platform club GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const csrfError = verifyOrigin(request);
    if (csrfError) return csrfError;

    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé à la plateforme" }, { status: auth.status });
    const superAdmin = auth.user;

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { action, reason, planId } = parsed.data;

    const club = await prisma.club.findUnique({ where: { id }, select: { id: true, name: true, status: true } });
    if (!club) return NextResponse.json({ error: "Club introuvable" }, { status: 404 });

    if (action === "suspend") {
      await prisma.$transaction([
        prisma.club.update({
          where: { id },
          data: { status: "SUSPENDED", suspendedAt: new Date(), suspendedReason: reason ?? "Suspendu par la plateforme" },
        }),
        prisma.clubSubscription.updateMany({ where: { clubId: id }, data: { status: "SUSPENDED" } }),
      ]);
      await logAction(request, {
        clubId: id,
        actorId: superAdmin.id, actorName: superAdmin.name, actorRole: superAdmin.role,
        action: "PLATFORM_CLUB_SUSPENDED", category: "SUBSCRIPTION",
        targetId: id, targetName: club.name, detail: { reason },
      });
      return NextResponse.json({ ok: true, status: "SUSPENDED" });
    }

    if (action === "activate") {
      await prisma.$transaction([
        prisma.club.update({
          where: { id },
          data: { status: "ACTIVE", suspendedAt: null, suspendedReason: null },
        }),
        prisma.clubSubscription.updateMany({ where: { clubId: id }, data: { status: "ACTIVE" } }),
      ]);
      await logAction(request, {
        clubId: id,
        actorId: superAdmin.id, actorName: superAdmin.name, actorRole: superAdmin.role,
        action: "PLATFORM_CLUB_ACTIVATED", category: "SUBSCRIPTION",
        targetId: id, targetName: club.name,
      });
      return NextResponse.json({ ok: true, status: "ACTIVE" });
    }

    // change_plan
    if (!planId) {
      return NextResponse.json({ error: "planId requis pour changer de plan" }, { status: 400 });
    }
    const plan = await prisma.saasPlan.findFirst({ where: { id: planId, isActive: true } });
    if (!plan) return NextResponse.json({ error: "Plan introuvable ou inactif" }, { status: 404 });

    await prisma.clubSubscription.update({
      where: { clubId: id },
      data: { planId: plan.id },
    });
    await logAction(request, {
      clubId: id,
      actorId: superAdmin.id, actorName: superAdmin.name, actorRole: superAdmin.role,
      action: "PLATFORM_CLUB_PLAN_CHANGED", category: "SUBSCRIPTION",
      targetId: id, targetName: club.name, detail: { toPlan: plan.tier },
    });
    return NextResponse.json({ ok: true, plan: { id: plan.id, tier: plan.tier, name: plan.name } });
  } catch (error) {
    console.error("Platform club PATCH error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
