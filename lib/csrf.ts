// lib/csrf.ts — Phase 10: origin verification for non-GET route handlers.
//
// The continuation prompt's own pseudocode for this
// (`origin.startsWith(appUrl.replace(/^https?:\/\/[^.]+\./, "https://"))`)
// assumes APP_URL already has a subdomain to strip. With this app's actual
// config (APP_URL="https://yoursaas.com", an apex domain — see .env.example)
// that regex strips "yoursaas." out of "yoursaas.com" entirely and produces
// a bogus comparison, and even fixed it would reject every legitimate
// per-club subdomain origin (gym1.yoursaas.com, gym2.yoursaas.com, ...) —
// which is exactly the traffic this app needs to accept, since every gym's
// public site AND its dashboard live on its own subdomain of APP_URL.
//
// This instead checks that the Origin header's hostname is either exactly
// the platform's base domain or a subdomain of it, which is what "reject
// cross-site writes, allow same-platform requests" actually means for a
// multi-tenant app.

import { NextResponse } from "next/server";

function baseDomain(): string | null {
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return null;
  try {
    return new URL(appUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Returns a 403 NextResponse if the request's Origin header doesn't belong
 * to this platform (apex domain or any subdomain of it). Returns null if
 * the request is same-origin/trusted and the handler should proceed.
 *
 * Requests with no Origin header (server-to-server, curl, most GETs) are
 * allowed through — this guard is for browser-issued cross-site writes,
 * not a full auth check. It complements, not replaces, the JWT/session
 * checks already done by requireUser/requireAdmin/requireOwner.
 */
export function verifyOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin) return null; // no browser Origin header — not a CSRF vector this guard covers

  const base = baseDomain();
  if (!base) return null; // APP_URL not configured (e.g. local dev without .env) — don't block

  let originHost: string;
  try {
    originHost = new URL(origin).hostname;
  } catch {
    return NextResponse.json({ error: "CSRF" }, { status: 403 });
  }

  const trusted = originHost === base || originHost.endsWith(`.${base}`) || originHost === "localhost";
  if (!trusted) {
    return NextResponse.json({ error: "CSRF" }, { status: 403 });
  }
  return null;
}
