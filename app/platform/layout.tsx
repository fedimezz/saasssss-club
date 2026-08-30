"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import PlatformSidebar from "@/components/platform/PlatformSidebar";
import PlatformHeader from "@/components/platform/PlatformHeader";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isLoggedIn, userRole, isLoading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAuthorized = isLoggedIn && userRole?.toUpperCase() === "SUPER_ADMIN";

  useEffect(() => {
    if (isLoading) return;
    if (!isLoggedIn) {
      router.replace("/user/login");
      return;
    }
    if (!isAuthorized) {
      router.replace("/dashboard");
    }
  }, [isLoading, isLoggedIn, isAuthorized, router]);

  // Fast client-side UX check only — real access control for /platform/*
  // happens in proxy.ts, which verifies the httpOnly cookie's JWT before
  // the request ever reaches here (same pattern as app/admin/layout.tsx).
  if (isLoading || !isAuthorized) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={36} className="animate-spin text-[var(--primary)]" />
          <p className="text-sm text-muted">Vérification des accès...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex overflow-hidden bg-primary">
      <PlatformSidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden lg:ml-72">
        <PlatformHeader onMobileMenu={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
