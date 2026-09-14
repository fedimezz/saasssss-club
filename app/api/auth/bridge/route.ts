// GET /api/auth/bridge?token=...&redirect=/admin/settings
//
// One-time session handoff for cases where authentication happens on one
// origin and the user needs to land authenticated on a DIFFERENT origin —
// right now, only /onboarding: it creates the club + owner on the apex
// domain, but the owner's dashboard lives on {slug}.host.
//
// A cookie's Domain attribute can share it across subdomains in
// production, but that trick silently fails for a bare "localhost" host
// (the Domain attribute isn't settable on a single-label host — see
// lib/auth.ts's buildAuthCookieOptions) and is fragile in general (proxies,
// custom domains, etc. can all strip or rewrite it). Instead of depending
// on a cookie written by a different origin having propagated, this route
// sets a FRESH cookie scoped to whatever origin the request actually
// lands on — which is correct in every environment, dev or prod.
//
// `token` is short-lived (2 minutes) and only usable once in practice
// (the redirect target doesn't accept it again) — it exists purely to
// carry identity across the one hop, not as a long-lived credential.
import { NextRequest, NextResponse } from "next/server";
import { verifyToken, generateToken, AUTH_COOKIE_NAME, buildAuthCookieOptions } from "@/lib/auth";

export async function GET(request: NextRequest) {
    const requestUrl = new URL(request.url);
    const requestHost = request.headers.get("host") ?? requestUrl.host;
    const requestProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || requestUrl.protocol.replace(":", "");
    const requestOrigin = `${requestProtocol}://${requestHost}`;
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const redirectParam = searchParams.get("redirect") || "/admin";
    // Only ever redirect to a same-origin relative path — never let this
    // become an open redirect via the query string.
    const safeRedirect = redirectParam.startsWith("/") ? redirectParam : "/admin";

    if (!token) {
        return NextResponse.redirect(new URL("/platform/login", requestOrigin));
    }

    const payload = verifyToken(token);
    if (!payload) {
        return NextResponse.redirect(new URL("/platform/login?expired=1", requestOrigin));
    }

    const freshToken = generateToken(
        { id: payload.id, email: payload.email, role: payload.role, name: payload.name, clubId: payload.clubId },
        "7d"
    );

    const response = NextResponse.redirect(new URL(safeRedirect, requestOrigin));
    response.cookies.set(AUTH_COOKIE_NAME, freshToken, {
        ...buildAuthCookieOptions(request.url),
        maxAge: 60 * 60 * 24 * 7,
    });
    return response;
}