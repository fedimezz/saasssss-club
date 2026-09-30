// POST /api/auth/reset-password   { email }              — request a reset link
// PATCH /api/auth/reset-password  { email, token, newPassword } — confirm it
//
// Both handlers are deliberately silent on whether an email exists, to
// block account enumeration.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/bcrypt";
import { generateResetToken, hashSecret, minutesFromNow } from "@/lib/otp";
import { sendEmail, resetPasswordEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import { formatZodError, resetPasswordRequestSchema, resetPasswordSchema } from "@/lib/validation";
import { resolveTenantFromRequest } from "@/lib/tenant";
import { buildTenantOrigin } from "@/lib/tenant-url";
import { runAfter } from "@/lib/after";
import { getClientIp } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json().catch(() => null);
    const parsed = resetPasswordRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { email: normalizedEmail } = parsed.data;

    const rl = await checkRateLimit(`reset-request:${normalizedEmail}`, 3, 15 * 60 * 1000);
    // Per-IP as well, so one source can't mail-bomb many addresses.
    const rlIp = await checkRateLimit(`reset-request-ip:${getClientIp(request)}`, 10, 15 * 60 * 1000);
    if (!rl.allowed || !rlIp.allowed) {
      return NextResponse.json(
        { error: "Trop de demandes. Réessayez dans quelques minutes." },
        { status: 429 }
      );
    }

    const tenant = await resolveTenantFromRequest(request);
    const user = tenant
      ? await prisma.user.findFirst({ where: { clubId: tenant.id, email: normalizedEmail } })
      : null;

    if (user) {
      const token = generateResetToken();
      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetTokenHash: hashSecret(token),
          resetTokenExpiry: minutesFromNow(30),
        },
      });

      // The link must open on the CLUB's own host: the confirm step (PATCH
      // below) resolves the tenant from the Host header, so a link built from
      // the apex APP_URL finds no tenant and always answers "invalid link".
      // Built from the tenant record, not the incoming Host header, so a
      // forged Host can't redirect the emailed link elsewhere.
      const baseUrl = buildTenantOrigin(tenant!, new URL(request.url).origin);
      const resetUrl = `${baseUrl}/user/reset-password?email=${encodeURIComponent(user.email)}&token=${token}`;
      const { subject, html } = resetPasswordEmail(resetUrl);
      // Sent after the response: an inline await makes "account exists"
      // measurably slower than "doesn't", which re-opens the enumeration this
      // endpoint's generic message is meant to close.
      runAfter(() => sendEmail({ to: user.email, subject, html }));
    }

    return NextResponse.json({
      message: "Si ce compte existe, un email de réinitialisation a été envoyé.",
    });
  } catch (error) {
    console.error("Reset password request error:", error);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const rawBody = await request.json().catch(() => null);
    const parsed = resetPasswordSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { email: normalizedEmail, token, newPassword } = parsed.data;

    const tenant = await resolveTenantFromRequest(request);
    const user = tenant
      ? await prisma.user.findFirst({ where: { clubId: tenant.id, email: normalizedEmail } })
      : null;

    const invalidResponse = NextResponse.json(
      { error: "Lien invalide ou expiré" },
      { status: 400 }
    );

    if (!user || !user.resetTokenHash || !user.resetTokenExpiry) {
      return invalidResponse;
    }
    if (user.resetTokenExpiry < new Date()) {
      return invalidResponse;
    }
    if (hashSecret(token) !== user.resetTokenHash) {
      return invalidResponse;
    }

    const hashedPassword = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetTokenHash: null,
        resetTokenExpiry: null,
        // Revokes every session issued before now (see lib/auth.ts). The whole
        // point of a reset is usually "someone else may have my account".
        passwordChangedAt: new Date(),
      },
    });

    return NextResponse.json({ message: "Mot de passe réinitialisé avec succès" });
  } catch (error) {
    console.error("Reset password confirm error:", error);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
