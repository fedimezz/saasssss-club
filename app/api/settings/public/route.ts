import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveTenantFromRequest } from "@/lib/tenant";

const DEFAULTS = {
  name: "Mon Club", logoUrl: null, primaryColor: "#0f172a",
  backgroundColor: "#ffffff", backgroundColorDark: "#0a0a0a",
  enabledPages: null, heroTitle: null, heroSubtitle: null, heroImageUrl: null,
};

// Public, unauthenticated: only the branding fields (name/logo/color) are
// exposed here — never address/phone/email/etc. Used by ClubSettingsContext
// to render the real club identity everywhere (public navbar, admin sidebar,
// login/register pages) for the gym resolved from the current subdomain.
export async function GET(request: NextRequest) {
  try {
    const tenant = await resolveTenantFromRequest(request);
    if (!tenant) {
      // No subdomain resolved (apex/platform host, or no dev tenant configured) —
      // this is the SaaS marketing site itself, not any one gym's page.
      return NextResponse.json({ ...DEFAULTS, hasTenant: false });
    }

    const settings = await prisma.gymSettings.findUnique({
      where: { clubId: tenant.id },
      select: {
        name: true, logoUrl: true, primaryColor: true,
        backgroundColor: true, backgroundColorDark: true, enabledPages: true,
        heroTitle: true, heroSubtitle: true, heroImageUrl: true,
      },
    });

    return NextResponse.json({
      name: settings?.name ?? tenant.name,
      logoUrl: settings?.logoUrl ?? null,
      primaryColor: settings?.primaryColor ?? "#0f172a",
      backgroundColor: settings?.backgroundColor ?? "#ffffff",
      backgroundColorDark: settings?.backgroundColorDark ?? "#0a0a0a",
      enabledPages: settings?.enabledPages ?? null,
      heroTitle: settings?.heroTitle ?? null,
      heroSubtitle: settings?.heroSubtitle ?? null,
      heroImageUrl: settings?.heroImageUrl ?? null,
      hasTenant: true,
    });
  } catch (error) {
    console.error("Public settings GET error:", error);
    // Never break rendering because of this endpoint — fall back to defaults.
    // hasTenant: true keeps existing tenant sites rendering their normal UI
    // even if this call transiently fails, instead of flashing SaaS marketing content.
    return NextResponse.json({ ...DEFAULTS, hasTenant: true });
  }
}
