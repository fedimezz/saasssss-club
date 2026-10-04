import { NextResponse } from "next/server";
import { clearAuthCookie } from "@/lib/auth-cookie";

export async function POST(request: Request) {
  const response = NextResponse.json({ message: "Déconnexion réussie" });
  // Must expire the cookie with the same Domain/Path it was set with (and the
  // host-only variant) — a bare delete() leaves the Domain=.host cookie alive
  // in production, i.e. "logout" didn't log anybody out.
  clearAuthCookie(response, request.url);
  return response;
}
