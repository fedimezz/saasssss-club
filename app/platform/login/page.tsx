// app/platform/login/page.tsx
// Club-owner login page - shown on the apex/platform domain only.
// This is a DIFFERENT page from /user/login (which is for gym MEMBERS
// on a gym subdomain). Here, users who own or manage a gym log back into
// their admin dashboard after the initial /onboarding flow.
"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Mail, Lock, Building2, ArrowRight, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";

function PlatformLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isLoggedIn, userRole, user, isLoading } = useAuth();
  const { isDark } = useTheme();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const created = searchParams.get("created") === "1";

  const ownerDestination = (slug: string) => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
    const target = new URL("/admin", baseUrl);
    const hostname = target.hostname;
    if (hostname === "localhost" || hostname.endsWith(".localhost")) {
      target.hostname = `${slug}.localhost`;
    } else {
      target.hostname = `${slug}.${hostname.replace(/^www\./, "")}`;
    }
    return target.toString();
  };

  // Redirect already-authenticated users.
  useEffect(() => {
    if (isLoading) return;
    if (isLoggedIn && userRole) {
      const role = userRole.toUpperCase();
      if (role === "SUPER_ADMIN") {
        router.replace("/platform");
      } else if (role === "ADMIN" || role === "OWNER") {
        const club = user?.club;
        const slug = typeof club === "object" && club !== null && "slug" in club
          ? String(club.slug)
          : null;
        router.replace(slug ? ownerDestination(slug) : "/admin");
      } else {
        router.replace("/dashboard");
      }
    }
  }, [isLoading, isLoggedIn, userRole, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!email || !password) {
      setError("Veuillez remplir tous les champs.");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, rememberMe, portal: "owner" }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.requiresVerification) {
          window.location.href = `/user/verify?email=${encodeURIComponent(data.email || email)}`;
          return;
        }
        setError(data.error || "Identifiants incorrects.");
        setLoading(false);
        return;
      }

      login(data.user.role, data.user);

      const role = String(data.user.role).toUpperCase();
      let destination = "";
      if (!destination) {
        if (role === "SUPER_ADMIN") destination = "/platform";
        else if (role === "ADMIN" || role === "OWNER") {
          destination = data.user.club?.slug
            ? ownerDestination(data.user.club.slug)
            : "/admin";
        }
        else destination = "/dashboard";
      }

      // Hard navigation so the fresh auth cookie is included in the next request.
      window.location.href = destination;
    } catch {
      setError("Impossible de contacter le serveur.");
      setLoading(false);
    }
  };

  return (
    <div
      className={`min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 transition-all duration-300 ${
        isDark
          ? "bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950"
          : "bg-gradient-to-br from-slate-50 via-white to-emerald-50"
      }`}
    >
      {/* Ambient glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className={`absolute -top-56 -right-56 w-96 h-96 rounded-full blur-3xl ${
            isDark ? "bg-emerald-900/20" : "bg-emerald-200/40"
          } animate-pulse`}
        />
        <div
          className={`absolute -bottom-56 -left-56 w-96 h-96 rounded-full blur-3xl ${
            isDark ? "bg-sky-900/15" : "bg-sky-100/40"
          } animate-pulse delay-1000`}
        />
      </div>

      <div className="relative w-full max-w-md space-y-8">
        {/* Brand header */}
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-3 mb-6 group">
            <div className={`h-12 w-12 rounded-2xl flex items-center justify-center border ${isDark ? "bg-slate-900 text-emerald-400 border-emerald-500/30" : "bg-white text-emerald-600 border-emerald-200"}`}>
              <Building2 className="h-6 w-6" />
            </div>
            <div className="text-left">
              <h1 className={`text-xl font-black tracking-tight ${isDark ? "text-slate-100" : "text-slate-900"}`}>Le Club de Gammarth</h1>
              <p className={`text-[10px] uppercase tracking-widest font-semibold ${isDark ? "text-emerald-400/80" : "text-slate-500"}`}>Espace propriétaire</p>
            </div>
          </Link>

          <h2
            className={`text-2xl font-bold mb-1 ${
              isDark ? "text-slate-100" : "text-slate-900"
            }`}
          >
            Votre espace club
          </h2>
          <p className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            Connectez-vous pour gérer votre club et vos membres
          </p>
        </div>

        {/* Card */}
        <div
          className={`p-8 rounded-2xl shadow-2xl ${
            isDark
              ? "bg-slate-900/80 backdrop-blur-sm border border-slate-800"
              : "bg-white/90 backdrop-blur-sm border border-slate-200"
          }`}
        >
          {created && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              Votre club est prêt. Connectez-vous pour ouvrir son espace d’administration.
            </div>
          )}
          {error && (
            <div className="mb-6 bg-red-50 dark:bg-red-950/50 border-l-4 border-red-500 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label
                className={`block text-sm font-medium mb-2 ${
                  isDark ? "text-slate-300" : "text-slate-700"
                }`}
              >
                Email
              </label>
              <div className="relative">
                <Mail
                  className={`absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 ${
                    isDark ? "text-slate-500" : "text-slate-400"
                  }`}
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all ${
                    isDark
                      ? "bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                      : "bg-white border-slate-300 text-slate-900 placeholder:text-slate-400"
                  }`}
                  placeholder="proprietaire@monclub.com"
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label
                className={`block text-sm font-medium mb-2 ${
                  isDark ? "text-slate-300" : "text-slate-700"
                }`}
              >
                Mot de passe
              </label>
              <div className="relative">
                <Lock
                  className={`absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 ${
                    isDark ? "text-slate-500" : "text-slate-400"
                  }`}
                />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full pl-10 pr-10 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all ${
                    isDark
                      ? "bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                      : "bg-white border-slate-300 text-slate-900 placeholder:text-slate-400"
                  }`}
                  placeholder="--------"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Remember me + forgot */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className={`text-sm ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  Se souvenir de moi
                </span>
              </label>
              <Link
                href="/user/forgot-password"
                className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
              >
                Mot de passe oublie?
              </Link>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 py-2.5 rounded-xl font-bold transition-all duration-200 disabled:opacity-50 shadow-lg shadow-emerald-500/20 active:scale-95"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  Se connecter
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer links */}
        <div className="text-center space-y-3">
          <p className={`text-sm ${isDark ? "text-slate-400" : "text-slate-600"}`}>
            Pas encore de club?{" "}
            <Link
              href="/onboarding"
              className="text-emerald-600 hover:text-emerald-500 font-semibold"
            >
              Creer mon gym gratuitement
            </Link>
          </p>
          <p className={`text-xs ${isDark ? "text-slate-600" : "text-slate-400"}`}>
            Vous etes membre d&apos;un club? Connectez-vous depuis l&apos;adresse de votre club.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function PlatformLoginPage() {
  return (
    <Suspense fallback={null}>
      <PlatformLoginForm />
    </Suspense>
  );
}
