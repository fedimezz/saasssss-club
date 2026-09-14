import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";

const slugSchema = z.string().trim().min(3).max(40).regex(/^[a-z0-9-]+$/);

export async function GET(request: NextRequest) {
  const slug = new URL(request.url).searchParams.get("slug")?.toLowerCase() ?? "";
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) return NextResponse.json({ available: false, error: "Slug invalide" }, { status: 400 });

  const club = await prisma.club.findUnique({ where: { slug: parsed.data }, select: { id: true } });
  return NextResponse.json({ available: !club, slug: parsed.data });
}