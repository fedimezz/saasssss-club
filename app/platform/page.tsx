"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, DollarSign, Users, AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import StatCard from "@/components/admin/StatCard";

interface Overview {
  clubs: { total: number; trial: number; active: number; suspended: number; cancelled: number };
  mrr: number;
  totalMembers: number;
  trialEndingSoon: number;
  recentClubs: { id: string; name: string; slug: string; status: string; createdAt: string }[];
}

const STATUS_STYLE: Record<string, string> = {
  TRIAL: "bg-sky-500/10 text-sky-500",
  ACTIVE: "bg-emerald-500/10 text-emerald-500",
  SUSPENDED: "bg-rose-500/10 text-rose-500",
  CANCELLED: "bg-slate-500/10 text-slate-500",
};

export default function PlatformOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/platform/overview");
        if (!res.ok) throw new Error("Erreur de chargement");
        setData(await res.json());
      } catch {
        setError("Impossible de charger les statistiques de la plateforme.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  if (error || !data) {
    return <p className="text-sm text-rose-500">{error ?? "Erreur inconnue"}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Clubs total" value={String(data.clubs.total)} icon={Building2} color="blue" />
        <StatCard title="MRR" value={`${data.mrr.toLocaleString()} $`} icon={DollarSign} color="green" />
        <StatCard title="Membres (plateforme)" value={String(data.totalMembers)} icon={Users} color="purple" />
        <StatCard
          title="Essais expirant sous 3j"
          value={String(data.trialEndingSoon)}
          icon={AlertTriangle}
          color={data.trialEndingSoon > 0 ? "amber" : "green"}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(["trial", "active", "suspended", "cancelled"] as const).map((key) => (
          <div key={key} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{key}</p>
            <p className="mt-1 text-xl font-black text-primary">{data.clubs[key]}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-sm font-extrabold text-primary">Clubs récents</h3>
          <Link href="/platform/clubs" className="flex items-center gap-1 text-xs font-bold text-emerald-500 hover:underline">
            Voir tous <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="divide-y divide-border">
          {data.recentClubs.length === 0 ? (
            <p className="px-5 py-6 text-center text-xs text-muted">Aucun club pour le moment.</p>
          ) : (
            data.recentClubs.map((club) => (
              <Link
                key={club.id}
                href={`/platform/clubs/${club.id}`}
                className="flex items-center justify-between px-5 py-3.5 transition hover:bg-muted/60"
              >
                <div>
                  <p className="text-xs font-bold text-primary">{club.name}</p>
                  <p className="text-[10px] text-muted">{club.slug}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${STATUS_STYLE[club.status] ?? ""}`}>
                  {club.status}
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
