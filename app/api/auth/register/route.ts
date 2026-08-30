import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { hashPassword } from "@/lib/bcrypt";
import { resolveTenantFromRequest, isClubUsable } from "@/lib/tenant";
import { checkLimit } from "@/lib/plan-limits";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { generateVerificationCode, hashSecret, minutesFromNow } from "@/lib/otp";
import { sendEmail, verificationCodeEmail } from "@/lib/email";
import { sendSms, verificationCodeSms } from "@/lib/sms";
import { emailSchema, nameSchema, passwordSchema, phoneSchema, formatZodError } from "@/lib/validation";

const registerSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    phone: phoneSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  });

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`register:${ip}`, 5, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Trop de tentatives. Réessayez dans quelques minutes." },
        { status: 429 }
      );
    }

    // Which gym is this signup for? Resolved from the Host header only.
    // There's no self-serve signup on the apex/platform host — that's the
    // SUPER_ADMIN area, accounts there are created by other means (Phase 7).
    const tenant = await resolveTenantFromRequest(request);
    if (!isClubUsable(tenant)) {
      return NextResponse.json(
        { error: "Ce club n'est pas disponible pour les inscriptions." },
        { status: 404 }
      );
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = registerSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }

    const trimmedName = parsed.data.name;
    const normalizedEmail = parsed.data.email;
    const trimmedPhone = parsed.data.phone;
    const password = parsed.data.password;

    const existingUser = await prisma.user.findFirst({
      where: { clubId: tenant.id, email: normalizedEmail },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Cet email est déjà utilisé" },
        { status: 400 }
      );
    }

    // ── Plan limit check — public self-registration counts toward maxMembers ─
    const limitCheck = await checkLimit(tenant.id, "maxMembers");
    if (!limitCheck.ok) {
      return NextResponse.json(
        { error: "Ce club n'accepte plus de nouvelles inscriptions pour le moment." },
        { status: 402 }
      );
    }

    const hashedPassword = await hashPassword(password);

    const user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const createdUser = await tx.user.create({
        data: {
          clubId: tenant.id,
          name: trimmedName,
          email: normalizedEmail,
          phone: trimmedPhone,
          password: hashedPassword,
          role: "MEMBER",
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          createdAt: true,
        },
      });

      const cardNumber = `LCG${Date.now()}${Math.floor(Math.random() * 1000)}`;
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);

      await tx.membershipCard.create({
        data: {
          clubId: tenant.id,
          userId: createdUser.id,
          cardNumber,
          qrCode: `QR-${cardNumber}`,
          expiresAt,
        },
      });

      return createdUser;
    });

    const verificationCode = generateVerificationCode();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        verificationCodeHash: hashSecret(verificationCode),
        verificationCodeExpiry: minutesFromNow(15),
      },
    });
    const { subject, html } = verificationCodeEmail(verificationCode);
    await sendEmail({ to: user.email, subject, html }).catch((err) =>
      console.error("Failed to send verification email:", err)
    );

    // Best-effort second channel — email remains the source of truth for
    // verification, this just improves deliverability for users who watch
    // their phone more than their inbox. Doesn't block registration if it
    // fails or SMS isn't configured (lib/sms.ts falls back to a console log).
    if (user.phone) {
      await sendSms({ to: user.phone, body: verificationCodeSms(verificationCode) }).catch((err) =>
        console.error("Failed to send verification SMS:", err)
      );
    }

    // Do NOT log the user in here. No session cookie is issued until the
    // email code is confirmed in /api/auth/verify — otherwise anyone could
    // register with an email they don't own and be fully authenticated.
    return NextResponse.json(
      {
        message: "Inscription réussie, vérifiez votre email",
        requiresVerification: true,
        user,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Une erreur est survenue lors de l'inscription" },
      { status: 500 }
    );
  }
}