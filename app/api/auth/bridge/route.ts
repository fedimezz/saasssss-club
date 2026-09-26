// GET /api/auth/bridge?token=...&redirect=/admin/settings
//
// One-time session handoff for the ONE case where authentication happens on
// one origin and the user must land authenticated on a different one:
// /onboarding creates the club + owner on the apex domain, but the owner's
// dashboard lives on {slug}.host.
//
// The token is NOT a session token. It is a purpose-bound "bridge" token
// (lib/auth.ts → generateBridgeToken) and this route enforces, in order:
//   1. signature + purpose + 2-minute expiry          (verifyBridgeToken)
//   2. it is being redeemed on the club it was minted for (Host → tenant)
//   3. production: the browser holds the nonce cookie create-club set, which
//      binds the token to the browser that created the club (no login-CSRF
//      via a link an attacker crafted with THEIR OWN token)
//   4. single use: the jti is consumed atomically (lib/one-time.ts)
//   5. the account still exists, is active, and is an OWNER/ADMIN of that club
// Only then is a fresh session cookie scoped to the origin the request landed
// on. Previously any valid SESSION token was accepted and re-minted as a new
// 7-day one — an unbounded session-extension primitive for a stolen token.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyBridgeToken, hashBridgeNonce, generateToken } from "@/lib/auth";
import { setAuthCookie } from "@/lib/auth-cookie";
import { BRIDGE_NONCE_COOKIE } from "@/lib/bridge-nonce";
import { resolveTenantFromRequest, isClubUsable } from "@/lib/tenant";
import { safeRedirectPath } from "@/lib/redirect";
import { consumeOnce } from "@/lib/one-time";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const requestHost = request.headers.get("host") ?? requestUrl.host;
  const requestProtocol =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || requestUrl.protocol.replace(":", "");
  const requestOrigin = `${requestProtocol}://${requestHost}`;

  const redirectTo = (path: string) => {
    const res = NextResponse.redirect(new URL(path, requestOrigin));
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("Referrer-Policy", "no-referrer");
    return res;
  };
  const fail = () => {
    const res = redirectTo("/platform/login?expired=1");
    res.cookies.set(BRIDGE_NONCE_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  };

  const token = requestUrl.searchParams.get("token");
  if (!token) return redirectTo("/platform/login");

  const safeRedirect = safeRedirectPath(requestUrl.searchParams.get("redirect"), "/admin", requestOrigin);

  const payload = verifyBridgeToken(token);
  if (!payload) return fail();

  const tenant = await resolveTenantFromRequest(request);
  if (!isClubUsable(tenant) || tenant.id !== payload.clubId) return fail();

  if (process.env.NODE_ENV === "production") {
    const nonce = request.cookies.get(BRIDGE_NONCE_COOKIE)?.value;
    if (!nonce || hashBridgeNonce(nonce) !== payload.nonce) return fail();
  }

  const firstUse = await consumeOnce(`bridge:${payload.jti}`, 150);
  if (!firstUse) return fail();

  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    select: { id: true, email: true, role: true, name: true, clubId: true, isActive: true },
  });
  if (
    !user ||
    !user.isActive ||
    user.clubId !== tenant.id ||
    !["OWNER", "ADMIN"].includes(user.role.toUpperCase())
  ) {
    return fail();
  }

  const session = generateToken(
    { id: user.id, email: user.email, role: user.role, name: user.name, clubId: user.clubId },
    "7d"
  );

  const response = redirectTo(safeRedirect);
  setAuthCookie(response, session, request.url, { maxAgeSeconds: 60 * 60 * 24 * 7 });
  response.cookies.set(BRIDGE_NONCE_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
