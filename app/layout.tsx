import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";
import { headers } from "next/headers";
import { resolveTenantFromRequest } from "@/lib/tenant";
import { buildTenantOrigin } from "@/lib/tenant-url";
import { ThemeProvider } from "@/context/ThemeContext";
import { AuthProvider } from "@/context/AuthContext";
import { ClubSettingsProvider } from "@/context/ClubSettingsContext";
import { LanguageProvider } from "@/context/LanguageContext";
import RootShell from "@/components/layout/RootShell";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim()
    ?? (host.split(":")[0] === "localhost" || host.endsWith(".localhost") ? "http" : "https");
  const request = new Request(`${protocol}://${host}/`, { headers: requestHeaders });
  const tenant = await resolveTenantFromRequest(request);
  if (!tenant) {
    const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
    return {
      title: "Le Club Gammarth",
      description: "Plateforme de gestion pour clubs sportifs.",
      ...(base ? { metadataBase: new URL(base) } : {}),
    };
  }

  const origin = buildTenantOrigin(tenant, `${protocol}://${host}`);
  return {
    title: { default: tenant.name, template: `%s | ${tenant.name}` },
    description: `Site officiel de ${tenant.name}, club sportif et espace membres.`,
    metadataBase: new URL(origin),
    openGraph: { title: tenant.name, description: `Site officiel de ${tenant.name}.`, url: origin },
  };
}

// This runs synchronously, before React hydrates and before first paint.
// It reads the SAME storage key / fallback logic as readStoredTheme() in
// ThemeContext.tsx — keep these two in sync if you ever change one.
//
// Why this exists: ThemeProvider's React state always starts at "light"
// (required, so server and client render the same markup and avoid a
// hydration mismatch). Without this script, a returning visitor with dark
// mode saved would see a flash of light mode for a frame or two until
// ThemeProvider's mount effect corrects it. This script sets the "dark"
// class directly on <html> immediately, outside of React entirely, so
// there's no flash and no hydration mismatch (React never claims to have
// rendered "dark" — the class is just sitting there independently of it).
const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var isDark = stored === "dark" || (stored !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (isDark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

// Same rationale as themeInitScript above: sets <html lang>/dir before
// paint so an Arabic-preferring guest doesn't see a flash of LTR layout.
// LanguageProvider's mount effect re-applies this once it knows whether
// the visitor is logged in (and may override with their saved account
// preference), this is just the pre-paint guess from localStorage.
const langInitScript = `
(function () {
  try {
    var lang = localStorage.getItem("lang") || "FR";
    document.documentElement.lang = lang.toLowerCase();
    document.documentElement.dir = lang === "AR" ? "rtl" : "ltr";
  } catch (e) {}
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="fr" suppressHydrationWarning data-scroll-behavior="smooth">
      <body className="bg-primary text-primary">
        {/* next/script (not a raw <script>): React 19 warns "Encountered a script
            tag while rendering React component". beforeInteractive still runs
            these before hydration/first paint, exactly like the raw tags did. */}
        <Script id="theme-init" nonce={nonce} strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <Script id="lang-init" nonce={nonce} strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: langInitScript }} />
        <ThemeProvider>
          <ClubSettingsProvider>
            <AuthProvider>
              <LanguageProvider>
                <RootShell>{children}</RootShell>
              </LanguageProvider>
            </AuthProvider>
          </ClubSettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}