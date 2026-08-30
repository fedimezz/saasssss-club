import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin, requireOwner } from "@/lib/auth";
import { PAGE_CONTENT_SCHEMA } from "@/lib/page-content-schema";
import { formatZodError, pageContentEnvelopeSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    const rows = await prisma.pageContent.findMany({ where: { clubId: auth.user.clubId, pageKey: { in: PAGE_CONTENT_SCHEMA.map((p) => p.pageKey) } } });
    const savedByPage = new Map(rows.map((r: { pageKey: string; content: unknown }) => [r.pageKey, r.content as Record<string, string>]));
    const response = NextResponse.json({ pages: PAGE_CONTENT_SCHEMA.map((def) => ({ pageKey: def.pageKey, label: def.label, fields: def.fields, previewPath: def.previewPath, content: savedByPage.get(def.pageKey) ?? {} })) });
    response.headers.set("Cache-Control", "no-store, max-age=0");
    return response;
  } catch (error) {
    console.error("Admin page-content GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireOwner(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé au propriétaire" }, { status: auth.status });
    const clubId = auth.user.clubId as string;
    const rawBody = await request.json().catch(() => null);
    const parsed = pageContentEnvelopeSchema.safeParse(rawBody);
    if (!parsed.success) return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    const { pageKey, content } = parsed.data;
    const def = PAGE_CONTENT_SCHEMA.find((p) => p.pageKey === pageKey);
    if (!def) return NextResponse.json({ error: "Page inconnue" }, { status: 400 });

    const allowedKeys = new Set(def.fields.map((f) => f.key));
    const clean: Record<string, string> = {};
    for (const [key, value] of Object.entries(content)) if (allowedKeys.has(key) && typeof value === "string") clean[key] = value.trim();

    const row = await prisma.pageContent.upsert({
      where: { clubId_pageKey: { clubId, pageKey } },
      create: { clubId, pageKey, content: clean, updatedBy: auth.user.id },
      update: { content: clean, updatedBy: auth.user.id },
    });
    const response = NextResponse.json({ pageKey: row.pageKey, content: row.content });
    response.headers.set("Cache-Control", "no-store, max-age=0");
    return response;
  } catch (error) {
    console.error("Admin page-content PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
