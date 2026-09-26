// GET /api/auth/google
// Starts the Google OAuth "Authorization Code" flow from a CLUB's own login
// page (e.g. club-a.host/user/login). Google's registered redirect_uri is a
// single fixed URL on the platform apex — it must be, Google doesn't support
// per-subdomain callbacks — so the tenant this flow belongs to has to survive
// the trip through Google and back. That's done by folding the club id into
// `state` itself (Google echoes it back verbatim) rather than relying on the
// Host header at the callback, which by then IS the apex, not the club.
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { buildPlatformWideCookieOptions } from "@/lib/auth-cookie";
import { resolveTenantFromRequest, isClubUsable } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "La connexion Google n'est pas configurée." },
      { status: 501 }
    );
  }

  const tenant = await resolveTenantFromRequest(request);
  if (!isClubUsable(tenant)) {
    return NextResponse.json({ error: "Ce club n'est plus disponible." }, { status: 404 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || new URL(request.url).origin;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ?? `${baseUrl}/api/auth/callback/google`;

  // The random part is the actual CSRF secret (must match the cookie).
  // tenant.id is not secret — appending it is just how the club survives
  // the Google round trip; it carries no extra trust on its own.
  const csrf = crypto.randomBytes(16).toString("hex");
  const state = `${csrf}.${tenant.id}`;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");

  const response = NextResponse.redirect(authUrl.toString());
  // Domain=.<apex>: set while responding on the tenant subdomain, must still
  // be readable when Google calls back on the apex host — see file header.
  response.cookies.set("google_oauth_state", state, {
    ...buildPlatformWideCookieOptions(),
    maxAge: 60 * 5,
  });
  return response;
}
