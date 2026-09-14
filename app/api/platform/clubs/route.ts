// GET /api/platform/clubs — SUPER_ADMIN only, cross-tenant club listing
// with search/status filter/pagination for the platform control dashboard.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth";
import { Prisma, ClubStatus } from "@prisma/client";

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
