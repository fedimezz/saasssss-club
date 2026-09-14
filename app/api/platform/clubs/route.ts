// GET /api/platform/clubs — SUPER_ADMIN only, cross-tenant club listing
// with search/status filter/pagination for the platform control dashboard.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth";
import { Prisma, ClubStatus } from "@prisma/client";
import { z } from "zod";
import { hashPassword } from "@/lib/bcrypt";
import { verifyOrigin } from "@/lib/csrf";
import { logAction } from "@/lib/activity-log";

const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().min(3).max(40).regex(/^[a-z0-9-]+$/),
  planId: z.string().min(1),
  ownerName: z.string().trim().min(2).max(80),
  ownerEmail: z.string().trim().email().toLowerCase(),
  ownerPassword: z.string().min(8).max(100),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé à la plateforme" }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search") ?? "";
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = 20;

    const where: Prisma.ClubWhereInput = {
      ...(status && (Object.values(ClubStatus) as string[]).includes(status)
        ? { status: status as ClubStatus }
        : {}),
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { slug: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const [clubs, total] = await Promise.all([
      prisma.club.findMany({
        where,
        select: {
          id: true, name: true, slug: true, status: true,
          trialEndsAt: true, suspendedAt: true, createdAt: true,
          subscription: { select: { status: true, plan: { select: { tier: true, name: true, priceMonthly: true } } } },
          _count: { select: { users: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.club.count({ where }),
    ]);

    return NextResponse.json({
      clubs,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    console.error("Platform clubs GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const csrfError = verifyOrigin(request);
    if (csrfError) return csrfError;
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé à la plateforme" }, { status: auth.status });
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Données invalides" }, { status: 400 });
    const { name, slug, planId, ownerName, ownerEmail, ownerPassword } = parsed.data;
    const [existingClub, existingPlan] = await Promise.all([
      prisma.club.findUnique({ where: { slug }, select: { id: true } }),
      prisma.saasPlan.findFirst({ where: { id: planId, isActive: true }, select: { id: true } }),
    ]);
    if (existingClub) return NextResponse.json({ error: "Ce slug est déjà utilisé", field: "slug" }, { status: 409 });
    if (!existingPlan) return NextResponse.json({ error: "Plan introuvable ou inactif" }, { status: 404 });
    const password = await hashPassword(ownerPassword);
    const trialEndsAt = new Date(Date.now() + 14 * 86400000);
    const club = await prisma.$transaction(async (tx) => {
      const created = await tx.club.create({ data: { name, slug, status: "TRIAL", trialEndsAt } });
      await tx.user.create({ data: { clubId: created.id, name: ownerName, email: ownerEmail, password, role: "OWNER", isActive: true, emailVerified: new Date() } });
      await tx.clubSubscription.create({ data: { clubId: created.id, planId, status: "TRIALING", trialEndsAt, currentPeriodStart: new Date(), currentPeriodEnd: trialEndsAt } });
      await tx.gymSettings.create({ data: { clubId: created.id, name } });
      return created;
    });
    await logAction(request, { clubId: club.id, actorId: auth.user.id, actorName: auth.user.name, actorRole: auth.user.role, action: "PLATFORM_CLUB_CREATED", category: "SUBSCRIPTION", targetId: club.id, targetName: club.name });
    return NextResponse.json({ ok: true, club }, { status: 201 });
  } catch (error) {
    console.error("Platform club POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
