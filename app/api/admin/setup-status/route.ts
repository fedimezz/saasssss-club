// GET /api/admin/setup-status
//
// Powers the "getting started" checklist an owner sees on /admin until their
// club is set up. Deliberately has NO separate progress table to keep in
// sync — each step's "done" state is derived live from whether the owner has
// actually done the thing (a plan exists, a coach exists, ...). That means
// the checklist can never drift from reality, and an owner who does things
// out of order or from a different page still gets correct checkmarks.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    const clubId = auth.user.clubId as string;

    const [settings, planCount, coachCount, weeklyPlanCount, konnectConfigured] = await Promise.all([
      prisma.gymSettings.findUnique({
        where: { clubId },
        select: { logoUrl: true, heroTitle: true, heroImageUrl: true, phone: true, address: true },
      }),
      prisma.membershipPlan.count({ where: { clubId, isActive: true } }),
      prisma.coach.count({ where: { clubId, isActive: true } }),
      prisma.weeklyPlan.count({ where: { clubId } }),
      // Whether Konnect is configured at all is a platform-wide env setting,
      // not per-club — same value for every club, included here just so the
      // "connect payments" step can point the owner at billing settings
      // instead of claiming it's done when it isn't.
      Promise.resolve(Boolean(process.env.KONNECT_API_KEY && process.env.KONNECT_WALLET_ID)),
    ]);

    const brandingDone = Boolean(
      settings && (settings.logoUrl || settings.heroTitle || settings.heroImageUrl) && settings.phone
    );

    const steps = [
      {
        id: "branding",
        title: "Personnalisez votre club",
        description: "Logo, coordonnées et image d'accueil",
        done: brandingDone,
        href: "/admin/settings",
      },
      {
        id: "plans",
        title: "Créez vos formules d'abonnement",
        description: "Au moins une formule active pour que les membres puissent s'inscrire",
        done: planCount > 0,
        href: "/admin/plans",
      },
      {
        id: "coaches",
        title: "Ajoutez vos coachs",
        description: "Pour pouvoir leur assigner des séances",
        done: coachCount > 0,
        href: "/admin/staff",
      },
      {
        id: "schedule",
        title: "Construisez votre planning",
        description: "Créez la première semaine de séances",
        done: weeklyPlanCount > 0,
        href: "/admin/schedule",
      },
      {
        id: "payments",
        title: "Configurez les paiements en ligne",
        description: konnectConfigured
          ? "Vérifiez votre configuration Konnect"
          : "Optionnel — vos membres peuvent aussi payer sur place",
        done: konnectConfigured,
        href: "/admin/billing",
        optional: true,
      },
    ];

    const requiredSteps = steps.filter((s) => !s.optional);
    const completedCount = requiredSteps.filter((s) => s.done).length;

    return NextResponse.json({
      steps,
      completedCount,
      totalCount: requiredSteps.length,
      allDone: completedCount === requiredSteps.length,
    });
  } catch (error) {
    console.error("Setup status GET error:", error);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
