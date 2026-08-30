// POST /api/onboarding/create-club — creates Club + OWNER + TRIALING subscription in one tx.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { hashPassword } from "@/lib/bcrypt";
import { generateToken, buildAuthCookieOptions, AUTH_COOKIE_NAME } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const TRIAL_DAYS = 14;

const schema = z.object({
  name:     z.string().trim().min(2).max(80),
  email:    z.string().trim().email("Email invalide").toLowerCase(),
  password: z.string().min(8, "Mot de passe trop court (8 car. min.)").max(100),
  phone:    z.string().trim().optional(),
  clubName: z.string().trim().min(2, "Nom du club trop court").max(100),
  slug: z
    .string().trim().min(3, "Slug trop court").max(40, "Slug trop long")
    .regex(/^[a-z0-9-]+$/, "Slug : minuscules, chiffres, tirets uniquement")
    .refine((s) => !s.startsWith("-") && !s.endsWith("-"), "Le slug ne peut pas commencer/finir par un tiret"),
  planId: z.string().min(1, "Plan obligatoire"),
});

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(`onboarding:${ip}`, 5, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Trop de tentatives. Réessayez dans une heure." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Données invalides" }, { status: 400 });
  }

  const { name, email, password, phone, clubName, slug, planId } = parsed.data;

  const plan = await prisma.saasPlan.findFirst({ where: { id: planId, isActive: true }, select: { id: true } });
  if (!plan) return NextResponse.json({ error: "Plan SaaS introuvable ou inactif" }, { status: 400 });

  const [slugTaken, emailTaken] = await Promise.all([
    prisma.club.findUnique({ where: { slug }, select: { id: true } }),
    prisma.user.findFirst({ where: { email }, select: { id: true } }),
  ]);
  if (slugTaken) return NextResponse.json({ error: "Ce sous-domaine est déjà utilisé.", field: "slug" }, { status: 409 });
  if (emailTaken) return NextResponse.json({ error: "Cet email est déjà associé à un compte.", field: "email" }, { status: 409 });

  const hashedPassword = await hashPassword(password);
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86400000);

  try {
    const { club, owner } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const club = await tx.club.create({ data: { slug, name: clubName, status: "TRIAL", trialEndsAt } });

      const owner = await tx.user.create({
        data: { clubId: club.id, name, email, phone: phone || null, password: hashedPassword, role: "OWNER", isActive: true, emailVerified: new Date() },
        select: { id: true, name: true, email: true, role: true, clubId: true },
      });

      await tx.clubSubscription.create({
        data: { clubId: club.id, planId: plan.id, status: "TRIALING", trialEndsAt, currentPeriodStart: new Date(), currentPeriodEnd: trialEndsAt },
      });

      await tx.gymSettings.create({
        data: { clubId: club.id, gymName: clubName, primaryColor: "#6366f1", enabledPages: { home: true, schedule: true, coaches: true, pricing: true, contact: true } },
      });

      return { club, owner };
    });

    const token = generateToken({ id: owner.id, email: owner.email, role: owner.role, name: owner.name, clubId: owner.clubId });
    const res = NextResponse.json({ ok: true, club: { id: club.id, slug: club.slug, name: club.name }, user: { id: owner.id, name: owner.name, email: owner.email, role: owner.role } });
    res.cookies.set(AUTH_COOKIE_NAME, token, { ...buildAuthCookieOptions(request.url), maxAge: 60 * 60 * 24 * 7 });
    return res;
  } catch (error) {
    console.error("create-club error:", error);
    return NextResponse.json({ error: "Erreur serveur lors de la création du club." }, { status: 500 });
  }
}
