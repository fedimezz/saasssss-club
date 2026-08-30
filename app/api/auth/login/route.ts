import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyPassword } from "@/lib/bcrypt";
import { generateToken, AUTH_COOKIE_NAME, buildAuthCookieOptions } from "@/lib/auth";
import { resolveTenantFromRequest, isClubUsable } from "@/lib/tenant";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { formatZodError, loginSchema } from "@/lib/validation";
import { logAction } from "@/lib/activity-log";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`login:${ip}`, 10, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Trop de tentatives. Réessayez dans quelques minutes." },
        { status: 429 }
      );
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = loginSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { email: normalizedEmail, password, rememberMe } = parsed.data;

    // Which gym is this login for? Resolved from the Host header only —
    // never from anything in the request body. A request on the apex/
    // platform host (no tenant) can only ever be a SUPER_ADMIN login: it
    // has no gym context to match a gym user against.
    const tenant = await resolveTenantFromRequest(request);
    if (tenant && !isClubUsable(tenant)) {
      return NextResponse.json(
        { error: "Ce club n'est plus disponible." },
        { status: 403 }
      );
    }

    const user = await prisma.user.findFirst({
      where: tenant
        ? { clubId: tenant.id, email: normalizedEmail }
        : { clubId: null, email: normalizedEmail, role: "SUPER_ADMIN" },
      include: {
        subscriptions: {
          where: {
            status: "ACTIVE",
            endDate: { gt: new Date() },
          },
          take: 1,
          include: {
            plan: true,
          },
        },
        membershipCard: true,
      },
    });

    const invalidCredentialsResponse = NextResponse.json(
      { error: "Email ou mot de passe incorrect" },
      { status: 401 }
    );

    if (!user) {
      return invalidCredentialsResponse;
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: "Votre compte a été désactivé. Contactez l'administrateur." },
        { status: 401 }
      );
    }

    if (!user.password) {
      return NextResponse.json(
        {
          error:
            "Ce compte utilise la connexion Google. Cliquez sur \"Continuer avec Google\".",
        },
        { status: 401 }
      );
    }

    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      return invalidCredentialsResponse;
    }

    if (!user.emailVerified) {
      return NextResponse.json(
        {
          error: "Veuillez vérifier votre email avant de vous connecter.",
          requiresVerification: true,
          email: user.email,
        },
        { status: 403 }
      );
    }

    const expiresIn = rememberMe ? "30d" : "7d";
    const token = generateToken(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        clubId: user.clubId,
      },
      expiresIn
    );

    const activeSubscription = user.subscriptions[0] || null;

    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatar: user.avatar,
      membershipCard: user.membershipCard,
      subscription: activeSubscription
        ? {
            id: activeSubscription.id,
            plan: activeSubscription.plan.name,
            endDate: activeSubscription.endDate,
            status: activeSubscription.status,
          }
        : null,
    };

    const response = NextResponse.json({
      message: "Connexion réussie",
      user: userData,
    });

    void logAction(request, {
      actorId: user.id, actorName: user.name, actorRole: user.role,
      action: "USER_LOGIN",
      category: "AUTH",
      detail: { rememberMe },
    });

    response.cookies.set(AUTH_COOKIE_NAME, token, {
      ...buildAuthCookieOptions(request.url),
      maxAge: rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Une erreur est survenue lors de la connexion" },
      { status: 500 }
    );
  }
}