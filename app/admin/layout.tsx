"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminHeader from "@/components/admin/AdminHeader";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoggedIn, userRole, isLoading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const roleUpper = userRole?.toUpperCase() ?? null;
  const isAuthorized =
    isLoggedIn && (roleUpper === "ADMIN" || roleUpper === "OWNER");

  // Guided website setup gate. A brand-new owner (phase "initial") must
  // personalise the club's website FIRST: until they publish it, every other
  // /admin page redirects to the wizard and the sidebar only shows the wizard.
  // null = not known yet (loading / not an owner).
  const isOwner = roleUpper === "OWNER";
  const [setupPhase, setSetupPhase] = useState<string | null>(null);
  const readSetupPhase = () =>
    fetch("/api/admin/website-setup", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j?.phase as string | undefined) ?? "unknown")
      .catch(() => "unknown");

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    readSetupPhase().then((phase) => { if (!cancelled) setSetupPhase(phase); });
    return () => { cancelled = true; };
  }, [isOwner]);

  const wizardRequired = isOwner && setupPhase === "initial";
  const onWizardPage = pathname.startsWith("/admin/website-setup");
  const waitingForSetupCheck = isOwner && setupPhase === null;

  // Off the wizard while setup looks unfinished: re-read the phase from the
  // server before bouncing back (the wizard navigates away right after
  // publishing, so the cached "initial" may be stale).
  useEffect(() => {
    if (!wizardRequired || onWizardPage) return;
    let cancelled = false;
    readSetupPhase().then((phase) => {
      if (cancelled) return;
      if (phase === "initial") router.replace("/admin/website-setup");
      else setSetupPhase(phase);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardRequired, onWizardPage, pathname]);

  useEffect(() => {
    if (isLoading) return;
    if (!isLoggedIn) {
      // Send unauthenticated users to the member/club login, NOT to the
      // platform super-admin login. /platform/login is only for SUPER_ADMIN.
      router.replace("/user/login");
      return;
    }
    if (!isAuthorized) {
      router.replace("/dashboard");
    }
  }, [isLoading, isLoggedIn, isAuthorized, router]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-primary z-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={36} className="animate-spin text-[var(--primary)]" />
          <p className="text-sm text-muted">Vérification des accès...</p>
        </div>
      </div>
    );
  }

  // As with the dashboard layout, this is a fast client-side UX check.
  // The actual access control for /admin/* happens in proxy.ts, which
  // verifies the httpOnly cookie's JWT before the request ever reaches here.
  if (!isAuthorized || waitingForSetupCheck || (wizardRequired && !onWizardPage)) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-primary z-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={36} className="animate-spin text-[var(--primary)]" />
          <p className="text-sm text-muted">Vérification des accès...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-primary overflow-hidden">
      <AdminSidebar
        role={roleUpper as "ADMIN" | "OWNER"}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        wizardOnly={wizardRequired}
      />
      <div className="flex-1 lg:ml-72 flex flex-col min-w-0 overflow-hidden">
        <AdminHeader
          onMobileMenu={() => setMobileOpen(true)}
          role={roleUpper as "ADMIN" | "OWNER"}
        />
        <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}