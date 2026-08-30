"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Search, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

interface ClubRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  trialEndsAt: string | null;
  createdAt: string;
  subscription: { status: string; plan: { tier: string; name: string; priceMonthly: number } } | null;
  _count: { users: number };
}

const STATUS_STYLE: Record<string, string> = {
  TRIAL: "bg-sky-500/10 text-sky-500",
  ACTIVE: "bg-emerald-500/10 text-emerald-500",
  SUSPENDED: "bg-rose-500/10 text-rose-500",
  CANCELLED: "bg-slate-500/10 text-slate-500",
};

const STATUS_FILTERS = ["", "TRIAL", "ACTIVE", "SUSPENDED", "CANCELLED"];

export default function PlatformClubsPage() {
  const [clubs, setClubs] = useState<ClubRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      const res = await fetch(`/api/platform/clubs?${params}`);
      if (res.ok) {
        const json = await res.json();
        setClubs(json.clubs);
        setTotalPages(json.pagination.totalPages);
      }
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => { setPage(1); setSearch(e.target.value); }}
            placeholder="Rechercher un club…"
            className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s || "all"}
              onClick={() => { setPage(1); setStatus(s); }}
              className={`rounded-full px-3.5 py-1.5 text-[11px] font-bold transition ${
                status === s ? "bg-emerald-500 text-slate-950" : "border border-border bg-card text-secondary"
              }`}
            >
              {s || "Tous"}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
          </div>
        ) : clubs.length === 0 ? (
          <p className="px-5 py-10 text-center text-xs text-muted">Aucun club trouvé.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/60 text-left text-[10px] font-bold uppercase tracking-wider text-muted">
                <th className="px-4 py-3">Club</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Membres</th>
                <th className="px-4 py-3">Créé le</th>
              </tr>
            </thead>
            <tbody>
              {clubs.map((club) => (
                <tr key={club.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <Link href={`/platform/clubs/${club.id}`} className="font-bold text-primary hover:text-emerald-500">
                      {club.name}
                    </Link>
                    <p className="text-[10px] text-muted">{club.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${STATUS_STYLE[club.status] ?? ""}`}>
                      {club.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-secondary">{club.subscription?.plan.name ?? "—"}</td>
                  <td className="px-4 py-3 text-secondary">{club._count.users}</td>
                  <td className="px-4 py-3 text-secondary">{new Date(club.createdAt).toLocaleDateString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-full border border-border bg-card p-2 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs font-semibold text-secondary">Page {page} / {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-full border border-border bg-card p-2 disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
