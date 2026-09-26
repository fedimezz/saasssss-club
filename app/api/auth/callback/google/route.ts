// GET /api/auth/google/callback
// Finishes the Google OAuth flow: exchanges the authorization code for
// tokens, fetches the Google profile, finds-or-creates the matching User,
// and issues the same session cookie the password login uses.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { generateToken } from "@/lib/auth";
import { setAuthCookie, buildPlatformWideCookieOptions } from "@/lib/auth-cookie";
import { resolveClubById, isClubUsable } from "@/lib/tenant";
import { buildTenantOrigin } from "@/lib/tenant-url";
import { fetchWithTimeout } from "@/lib/http";

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

export async function GET(request: NextRequest) {
  // Only used for the token exchange (must byte-for-byte match what the
  // initiation route sent Google) and as the fallback for errors that
  // happen before we know which club this is — we genuinely don't have a
  // tenant to send the browser back to yet.
  const apexUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || new URL(request.url).origin;
  const apexLoginUrl = (error: string) => `${apexUrl}/user/login?error=${encodeURIComponent(error)}`;

  const clearStateCookie = (response: NextResponse) => {
    response.cookies.set("google_oauth_state", "", { ...buildPlatformWideCookieOptions(), maxAge: 0 });
    return response;
  };

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return clearStateCookie(NextResponse.redirect(apexLoginUrl("google_not_configured")));
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");
  const cookieState = request.cookies.get("google_oauth_state")?.value;

  if (oauthError) {
    // User declined on Google's consent screen — not an app error.
    return clearStateCookie(NextResponse.redirect(apexLoginUrl("google_denied")));
  }

  if (!code || !state || !cookieState || state !== cookieState) {
    return clearStateCookie(NextResponse.redirect(apexLoginUrl("google_state_mismatch")));
  }

  // The club this flow belongs to: encoded by /api/auth/google into `state`
  // (see that route for why) and only trustworthy because `state` just
  // matched the cookie above — a forged clubId alone doesn't pass that check.
  const clubId = state.slice(state.indexOf(".") + 1);
  const tenant = await resolveClubById(clubId);
  if (!isClubUsable(tenant)) {
    return clearStateCookie(NextResponse.redirect(apexLoginUrl("club_unavailable")));
  }
  const baseUrl = buildTenantOrigin(tenant, new URL(request.url).origin);
  const loginUrl = (error: string) => `${baseUrl}/user/login?error=${encodeURIComponent(error)}`;

  try {
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI ?? `${apexUrl}/api/auth/callback/google`;

    const tokenRes = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData: GoogleTokenResponse = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("Google token exchange failed:", tokenData.error, tokenData.error_description);
      return clearStateCookie(NextResponse.redirect(loginUrl("google_token_failed")));
    }

    const userInfoRes = await fetchWithTimeout("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userInfoRes.ok) {
      return clearStateCookie(NextResponse.redirect(loginUrl("google_userinfo_failed")));
    }

    const profile: GoogleUserInfo = await userInfoRes.json();

    if (!profile.email || !profile.email_verified) {
      // Don't trust an email Google itself hasn't verified.
      return clearStateCookie(NextResponse.redirect(loginUrl("google_email_unverified")));
    }

    const normalizedEmail = profile.email.trim().toLowerCase();

    let user = await prisma.user.findFirst({ where: { clubId: tenant.id, email: normalizedEmail } });
    let isNewUser = false;

    if (user) {
      if (!user.isActive) {
        return clearStateCookie(NextResponse.redirect(loginUrl("account_disabled")));
      }
      // Link the Google identity to an existing (e.g. password-created)
      // account on first Google sign-in. Google already verified this
      // email address, so we can safely mark it verified too — this also
      // lets someone who signed up with a password but never finished
      // our own email-code step get unblocked via Google instead.
      if (!user.googleId || !user.emailVerified) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            googleId: user.googleId ?? profile.sub,
            emailVerified: user.emailVerified ?? new Date(),
            avatar: user.avatar ?? profile.picture ?? null,
          },
        });
      }
    } else {
      isNewUser = true;
      try {
        user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const createdUser = await tx.user.create({
            data: {
              clubId: tenant.id,
              name: profile.name?.trim() || normalizedEmail.split("@")[0],
              email: normalizedEmail,
              password: null,
              googleId: profile.sub,
              avatar: profile.picture ?? null,
              role: "MEMBER",
              isActive: true,
              // Google already confirmed this address — skip our own
              // 6-digit code for accounts created this way.
              emailVerified: new Date(),
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
      } catch (err: unknown) {
        // googleId is unique platform-wide (one Google identity = one
        // login identity), so signing up at a second gym with the same
        // Google account hits that constraint — a known trade-off, see
        // the comment on User.googleId in schema.prisma.
        if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") {
          return clearStateCookie(NextResponse.redirect(loginUrl("google_account_linked_elsewhere")));
        }
        throw err;
      }
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      clubId: user.clubId,
    });
    const destination = isNewUser
        ? "/user/onboarding"
        : ["ADMIN", "OWNER"].includes(user.role.toUpperCase())
            ? "/admin"
            : "/dashboard";

    const syncUrl = `${baseUrl}/auth/sync?next=${encodeURIComponent(destination)}`;
    const response = NextResponse.redirect(syncUrl);
    // baseUrl here is the CLUB's own origin (see above), so this scopes the
    // cookie exactly the way the password-login route does — never the apex
    // request.url actually landed on.
    setAuthCookie(response, token, baseUrl, { maxAgeSeconds: 60 * 60 * 24 * 7 });
    return clearStateCookie(response);
  } catch (error) {
    console.error("Google OAuth callback error:", error);
    return clearStateCookie(NextResponse.redirect(apexLoginUrl("google_error")));
  }
}