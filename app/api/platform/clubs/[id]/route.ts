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
  action: z.enum(["freeze", "unfreeze", "ban", "suspend", "activate", "change_plan"]),
  reason: z.string().max(500).optional(),
  planId: z.string().min(1).optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  slug: z.string().trim().min(3).max(40).regex(/^[a-z0-9-]+$/).optional(),
  customDomain: z.string().trim().max(253).optional().nullable(),
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

    if (action === "freeze" || action === "suspend") {
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

    if (action === "unfreeze" || action === "activate") {
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

    if (action === "ban") {
      await prisma.$transaction([
        prisma.club.update({
          where: { id },
          data: { status: "CANCELLED", suspendedAt: new Date(), suspendedReason: reason ?? "Banni par la plateforme" },
        }),
        prisma.clubSubscription.updateMany({ where: { clubId: id }, data: { status: "CANCELED" } }),
        prisma.user.updateMany({ where: { clubId: id }, data: { isActive: false } }),
      ]);
      await logAction(request, { clubId: id, actorId: superAdmin.id, actorName: superAdmin.name, actorRole: superAdmin.role, action: "PLATFORM_CLUB_BANNED", category: "SUBSCRIPTION", targetId: id, targetName: club.name, detail: { reason } });
      return NextResponse.json({ ok: true, status: "CANCELLED" });
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

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const csrfError = verifyOrigin(request);
    if (csrfError) return csrfError;
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé à la plateforme" }, { status: auth.status });
    const { id } = await params;
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    const existing = await prisma.club.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!existing) return NextResponse.json({ error: "Club introuvable" }, { status: 404 });
    if (parsed.data.slug) {
      const conflict = await prisma.club.findFirst({ where: { slug: parsed.data.slug, id: { not: id } }, select: { id: true } });
      if (conflict) return NextResponse.json({ error: "Ce slug est déjà utilisé", field: "slug" }, { status: 409 });
    }
    const club = await prisma.club.update({ where: { id }, data: parsed.data });
    await logAction(request, { clubId: id, actorId: auth.user.id, actorName: auth.user.name, actorRole: auth.user.role, action: "PLATFORM_CLUB_UPDATED", category: "SUBSCRIPTION", targetId: id, targetName: club.name, detail: parsed.data });
    return NextResponse.json({ ok: true, club });
  } catch (error) {
    console.error("Platform club PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const csrfError = verifyOrigin(request);
    if (csrfError) return csrfError;
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé à la plateforme" }, { status: auth.status });
    const { id } = await params;
    const club = await prisma.club.findUnique({ where: { id }, select: { id: true, name: true, slug: true } });
    if (!club) return NextResponse.json({ error: "Club introuvable" }, { status: 404 });
    await prisma.club.delete({ where: { id } });
    await logAction(request, { clubId: null, actorId: auth.user.id, actorName: auth.user.name, actorRole: auth.user.role, action: "PLATFORM_CLUB_DELETED", category: "SUBSCRIPTION", targetId: id, targetName: club.name, detail: { slug: club.slug } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Platform club DELETE error:", error);
    return NextResponse.json({ error: "Impossible de supprimer ce club" }, { status: 409 });
  }
}
